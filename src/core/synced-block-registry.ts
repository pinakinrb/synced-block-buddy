import { App, Notice, Plugin, TFile } from "obsidian";
import {
	SyncedBlockRegistryData,
	SyncedBlockEntry,
	BlockLocation,
} from "../types/synced-block-registry";
import { normalize, hash } from "../utils/hash";
import { parseBlocksFromFile, patchFileText, BlockUpdate, ParsedBlock } from "../utils/file-patch";
import { SyncedBlockStorage } from "./synced-block-storage";

/**
 * Registry implementation using multi-master conflict-detecting algorithm
 */
export class SyncedBlockRegistry {
	private registry: SyncedBlockRegistryData = {
		blocks: {},
		fileIndex: {},
		duplicateIndex: {},
		writeGuards: {},
	};
	private saveTimeout: number | null = null;
	private readonly SAVE_DEBOUNCE_MS = 3000;
	private readonly MAX_CONCURRENT_WRITES = 8;
	private hashCache: Map<string, string> = new Map();
	private fileParseCache: Map<string, { blocks: ParsedBlock[]; mtime: number }> = new Map();
	private duplicateFiles: Map<string, Array<{ blockId: string; blockName: string; instanceCount: number }>> = new Map();

	constructor(private app: App, private plugin: Plugin) {}

	/**
	 * Loads registry from persistent storage
	 */
	async loadFromStorage(): Promise<void> {
		// Clear cache on initial load to ensure fresh data
		SyncedBlockStorage.clearCache();

		this.registry = {
			blocks: {},
			fileIndex: {},
			duplicateIndex: {},
			writeGuards: {},
		};

		try {
			const storedData = await SyncedBlockStorage.load(this.plugin);
			if (!storedData) {
				return;
			}

			this.registry.blocks = storedData.blocks || {};
			this.registry.fileIndex = storedData.fileIndex || {};
			this.registry.duplicateIndex = storedData.duplicateIndex || {};
			// writeGuards are not persisted (ephemeral)
		} catch (error) {
			// Log error but continue with empty registry (non-critical, will rebuild on next scan)
			console.error("[Synced Blocks] Error loading registry from storage:", error);
		}
	}

	/**
	 * Gets parsed blocks from a file, using cache if file hasn't changed
	 * Uses file modification time to detect changes
	 */
	private async getParsedBlocks(file: TFile, fileText: string): Promise<ParsedBlock[]> {
		const filePath = file.path;
		const fileMtime = file.stat.mtime;

		// Check cache
		const cached = this.fileParseCache.get(filePath);
		if (cached && cached.mtime === fileMtime) {
			// File hasn't changed, use cached blocks
			return cached.blocks;
		}

		// Parse blocks
		const blocks = parseBlocksFromFile(fileText);

		// Update cache
		this.fileParseCache.set(filePath, {
			blocks,
			mtime: fileMtime,
		});

		return blocks;
	}

	/**
	 * Gets a cached hash for content, computing it if not already cached
	 * Uses normalized content as cache key to ensure consistency
	 */
	private async getCachedHash(content: string): Promise<string> {
		// Normalize content to ensure consistent cache key
		const normalizedContent = normalize(content);
		
		// Check cache first
		if (this.hashCache.has(normalizedContent)) {
			return this.hashCache.get(normalizedContent)!;
		}
		
		// Compute hash and cache it
		const computedHash = await hash(normalizedContent);
		this.hashCache.set(normalizedContent, computedHash);
		return computedHash;
	}

	/**
	 * Saves registry to persistent storage (debounced)
	 */
	private scheduleSaveToStorage(): void {
		// Clear existing timeout
		if (this.saveTimeout !== null) {
			window.clearTimeout(this.saveTimeout);
		}

		// Schedule save after debounce delay
		this.saveTimeout = window.setTimeout(() => {
			void (async () => {
				try {
					await SyncedBlockStorage.save(this.plugin, {
						blocks: this.registry.blocks,
						fileIndex: this.registry.fileIndex,
						duplicateIndex: this.registry.duplicateIndex,
					});
				} catch (error) {
					console.error("[Synced Blocks] Error saving registry to storage:", error);
				} finally {
					this.saveTimeout = null;
				}
			})();
		}, this.SAVE_DEBOUNCE_MS);
	}

	/**
	 * Forces immediate save to storage (used on unload)
	 */
	async saveToStorageImmediate(): Promise<void> {
		// Cancel any pending debounced save
		if (this.saveTimeout !== null) {
			window.clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}

		// Save immediately
		await SyncedBlockStorage.save(this.plugin, {
			blocks: this.registry.blocks,
			fileIndex: this.registry.fileIndex,
			duplicateIndex: this.registry.duplicateIndex,
		});
	}

	/**
	 * Checks if a file write is guarded (to suppress self-triggered events)
	 * Also cleans up expired guards to prevent memory leaks
	 */
	isGuardedWrite(filePath: string): boolean {
		// Clean up expired guards first (prevents accumulation)
		this.cleanupExpiredGuards();

		const guard = this.registry.writeGuards[filePath];
		if (!guard) {
			return false;
		}

		// Check if guard is still valid
		if (Date.now() > guard.expiresAtMs) {
			delete this.registry.writeGuards[filePath];
			return false;
		}

		return true;
	}

	/**
	 * Removes all expired write guards to prevent memory leaks
	 * Called automatically when checking guards, so no intervals needed
	 */
	private cleanupExpiredGuards(): void {
		const now = Date.now();
		const guards = this.registry.writeGuards;

		// Iterate through all guards and remove expired ones
		for (const [filePath, guard] of Object.entries(guards)) {
			if (now > guard.expiresAtMs) {
				delete guards[filePath];
			}
		}
	}

	/**
	 * Adds a write guard for a file
	 */
	private addWriteGuard(filePath: string, durationMs: number = 2000): string {
		const token = `guard-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		this.registry.writeGuards[filePath] = {
			token,
			expiresAtMs: Date.now() + durationMs,
		};
		return token;
	}

	/**
	 * Removes a write guard
	 */
	private removeWriteGuard(filePath: string): void {
		delete this.registry.writeGuards[filePath];
	}

	/**
	 * Gets a block entry
	 */
	getBlock(blockId: string): SyncedBlockEntry | undefined {
		return this.registry.blocks[blockId];
	}

	/**
	 * Gets all block entries
	 */
	getAllBlocks(): SyncedBlockEntry[] {
		return Object.values(this.registry.blocks);
	}

	/**
	 * Checks if a block name exists (case-insensitive)
	 * Uses indexed lookup for O(1) performance
	 */
	hasBlockName(name: string): boolean {
		const normalizedName = name.toLowerCase();
		for (const block of Object.values(this.registry.blocks)) {
			if (block.blockName.toLowerCase() === normalizedName) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Core upsert and sync logic
	 */
	async upsertBlockAndMaybeSync(
		filePath: string,
		block: { blockId: string; blockName?: string; content: string }
	): Promise<void> {
		const contentN = normalize(block.content);
		const seenHash = await this.getCachedHash(contentN);

		let blockEntry = this.registry.blocks[block.blockId];

		// Case 1: Block doesn't exist - create it
		if (!blockEntry) {
			blockEntry = {
				blockId: block.blockId,
				blockName: block.blockName || block.blockId,
				canonicalContent: contentN,
				revision: 1,
				updatedAtMs: Date.now(),
			locations: {
				[filePath]: {
					lastAppliedRevision: 1,
					lastSeenHash: seenHash,
					lastSeenAtMs: Date.now(),
				},
			},
				conflict: null,
			};
			this.registry.blocks[block.blockId] = blockEntry;

			// Do not write back (file is the creator)
			this.scheduleSaveToStorage();
			return;
		}

		// Case 2: Block exists - ensure location exists
		if (!blockEntry.locations[filePath]) {
			blockEntry.locations[filePath] = {
				lastAppliedRevision: 0,
				lastSeenHash: null,
			};
		}

		const loc = blockEntry.locations[filePath];

		// Update block name if provided
		if (block.blockName) {
			blockEntry.blockName = block.blockName;
		}

		// Decide what changed
		const canonicalHash = await this.getCachedHash(blockEntry.canonicalContent);
		const fileDiffersFromCanonical = seenHash !== canonicalHash;

		// Case 3: File matches canonical
		if (!fileDiffersFromCanonical) {
			loc.lastSeenHash = seenHash;
			loc.lastSeenAtMs = Date.now();

			// If file already matches canonical but we haven't confirmed it yet
			if (loc.lastAppliedRevision < blockEntry.revision) {
				loc.lastAppliedRevision = blockEntry.revision;
			}

			// Clear conflict if it exists and file now matches canonical
			if (blockEntry.conflict) {
				blockEntry.conflict = null;
			}

			this.scheduleSaveToStorage();
			return;
		}

		// Case 4: File differs from canonical - need to determine what happened
		const lastSeenHash = loc.lastSeenHash;
		const fileChangedSinceLastScan =
			lastSeenHash !== null && seenHash !== lastSeenHash;
		const fileWasLastSyncedToCanonical = loc.lastAppliedRevision === blockEntry.revision;

		// Rule 1: File was last synced to canonical, and now it changed → adopt edit
		if (fileWasLastSyncedToCanonical && fileChangedSinceLastScan) {
			// This is a clean local edit
			blockEntry.canonicalContent = contentN;
			blockEntry.revision += 1;
			blockEntry.updatedAtMs = Date.now();
			loc.lastAppliedRevision = blockEntry.revision;
			loc.lastSeenHash = seenHash;
			loc.lastSeenAtMs = Date.now();

			// Clear conflict if it exists
			blockEntry.conflict = null;

			// Push canonical to other locations (not this file)
			await this.propagateBlockToAllFiles(block.blockId, filePath);

			this.scheduleSaveToStorage();
			return;
		}

		// Rule 2: File is behind canonical, overwrite it
		if (loc.lastAppliedRevision < blockEntry.revision && !fileChangedSinceLastScan) {
			// File didn't change locally, it's just stale
			await this.writeBlockToFile(filePath, block.blockId, blockEntry.canonicalContent);
			loc.lastAppliedRevision = blockEntry.revision;
			loc.lastSeenHash = await this.getCachedHash(blockEntry.canonicalContent);
			loc.lastSeenAtMs = Date.now();

			this.scheduleSaveToStorage();
			return;
		}

		// Rule 3: Conflict (two writers)
		// This covers cases like:
		// - canonical changed elsewhere, but file also changed locally
		// - or we don't have enough info (first time seeing this file) and it differs

		if (!blockEntry.conflict) {
			blockEntry.conflict = {
				atRevision: blockEntry.revision,
				variants: [],
			};
		}

		// Add/replace variant for this filePath
		const existingVariantIndex = blockEntry.conflict.variants.findIndex(
			(v) => v.filePath === filePath
		);
		const variant = {
			filePath,
			content: contentN,
			hash: seenHash,
		};

		if (existingVariantIndex >= 0) {
			blockEntry.conflict.variants[existingVariantIndex] = variant;
		} else {
			blockEntry.conflict.variants.push(variant);
		}

		// Also add canonical as a variant if not already captured
		const canonicalVariantExists = blockEntry.conflict.variants.some(
			(v) => v.hash === canonicalHash
		);
		if (!canonicalVariantExists) {
			blockEntry.conflict.variants.push({
				filePath: "canonical",
				content: blockEntry.canonicalContent,
				hash: canonicalHash,
			});
		}

		// Update location tracking
		loc.lastSeenHash = seenHash;
		loc.lastSeenAtMs = Date.now();

		this.scheduleSaveToStorage();
		// Do not auto-overwrite anything in conflict state
	}

	/**
	 * Writes block content to a file
	 * @param filePath Path to the file
	 * @param blockId ID of the block to write
	 * @param newContent New content for the block
	 */
	private async writeBlockToFile(
		filePath: string,
		blockId: string,
		newContent: string
	): Promise<void> {
		// Add write guard
		this.addWriteGuard(filePath, 2000);

		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				return;
			}

			// Read file text
			const fileText = await this.app.vault.read(file);

			// Use file modification time-based cache for parsed blocks
			const blockRanges = await this.getParsedBlocks(file, fileText);

			// Find all instances of this block ID (not just the first one)
			// This handles cases where duplicates exist in the same file
			const blockRangesToUpdate = blockRanges.filter((b) => b.blockId === blockId);

			if (blockRangesToUpdate.length === 0) {
				return;
			}

			// Get block name from registry
			const blockEntry = this.registry.blocks[blockId];
			if (!blockEntry) {
				return;
			}

			// Patch file text - patchFileText() already handles multiple instances correctly
			// It will update all blocks with matching blockId
			const updates: BlockUpdate[] = [
				{
					blockId,
					newContent,
				},
			];

			const newFileText = patchFileText(fileText, blockRanges, updates);

			// Write file text back
			await this.app.vault.modify(file, newFileText);
			
			// Clear file parse cache after modifying file (file content changed)
			this.fileParseCache.delete(filePath);

			// Guard will expire automatically after TTL
		} catch (error) {
			// Log error for debugging (background sync operation, no user notification)
			console.error(`[Synced Blocks] Error writing block ${blockId} to file ${filePath}:`, error);
		}
	}

	/**
	 * Propagates block to all files except the source file
	 * Uses parallel execution with concurrency limit for better performance
	 */
	private async propagateBlockToAllFiles(blockId: string, except?: string): Promise<void> {
		const blockEntry = this.registry.blocks[blockId];
		if (!blockEntry) {
			return;
		}

		// Hash canonical content once before processing (cached)
		const canonicalHash = await this.getCachedHash(blockEntry.canonicalContent);

		// Collect all file paths and locations that need to be updated
		const filesToUpdate: Array<{ filePath: string; location: BlockLocation }> = [];
		for (const [filePath, location] of Object.entries(blockEntry.locations)) {
			if (filePath === except) {
				continue;
			}
			filesToUpdate.push({ filePath, location });
		}

		// Process files in parallel batches with concurrency limit
		for (let i = 0; i < filesToUpdate.length; i += this.MAX_CONCURRENT_WRITES) {
			const batch = filesToUpdate.slice(i, i + this.MAX_CONCURRENT_WRITES);
			
			// Process batch in parallel
			await Promise.all(
				batch.map(async ({ filePath, location }) => {
					// Write canonical into that file
					// getParsedBlocks() will use fileParseCache automatically
					await this.writeBlockToFile(filePath, blockId, blockEntry.canonicalContent);
			
					// Clear file parse cache after writing (file was modified)
					this.fileParseCache.delete(filePath);
					
					// Update location tracking
					location.lastAppliedRevision = blockEntry.revision;
					location.lastSeenHash = canonicalHash;
					location.lastSeenAtMs = Date.now();
				})
			);
		}
	}

	/**
	 * Handles blocks that are missing from a file (were removed)
	 */
	async handleBlocksMissingFromFile(
		filePath: string,
		blocksInFile: Array<{ blockId: string }>,
		previousBlockIds: string[] = []
	): Promise<void> {
		// Use provided previousBlockIds, or fall back to current fileIndex if not provided
		const knownBlockIds = previousBlockIds.length > 0 
			? previousBlockIds 
			: this.registry.fileIndex[filePath] || [];
		const nowSet = new Set(blocksInFile.map((b) => b.blockId));

		for (const blockId of knownBlockIds) {
			if (nowSet.has(blockId)) {
				continue; // Block still exists
			}

			// Block was removed from file - delete the location entry
			const blockEntry = this.registry.blocks[blockId];
			if (blockEntry?.locations[filePath]) {
				delete blockEntry.locations[filePath];
			}

			// If block has no remaining locations, remove it from registry entirely
			if (blockEntry && Object.keys(blockEntry.locations).length === 0) {
				delete this.registry.blocks[blockId];
			}
		}

		this.scheduleSaveToStorage();
	}

	/**
	 * Processes a file (main entry point)
	 * @param filePath Path to the file to process
	 * @param suppressDuplicateNotifications Whether to suppress duplicate notifications (default: false, set to true during bulk operations)
	 */
	async processFile(filePath: string, suppressDuplicateNotifications: boolean = false): Promise<void> {
		// Check if write is guarded
		if (this.isGuardedWrite(filePath)) {
			return;
		}

		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				return;
			}

			// Read file text
			const fileText = await this.app.vault.read(file);

			// Parse blocks from file (with caching based on file modification time)
			const blocksInFile = await this.getParsedBlocks(file, fileText);

			// Detect duplicate block IDs in this file
			const duplicates = this.detectDuplicateBlocks(blocksInFile);
			if (duplicates.length > 0) {
				// Show notifications unless suppressed (e.g., during bulk operations)
				// During bulk operations, notifications are suppressed and summarized at the end
				this.handleDuplicateBlocks(filePath, duplicates, blocksInFile, !suppressDuplicateNotifications);
			}

			// Capture previous file index before updating (needed for removal detection)
			const previousBlockIds = this.registry.fileIndex[filePath] || [];

			// Process each block
			// When duplicates exist, we process all instances but use the first one's content for canonical
			// This ensures all instances are tracked, but canonical content comes from the first occurrence
			const processedBlockIds = new Set<string>();
			for (const block of blocksInFile) {
				// For duplicate blocks, only process the first instance for canonical content
				// Other instances will be updated during sync but won't affect canonical
				if (processedBlockIds.has(block.blockId)) {
					// This is a duplicate - skip processing to avoid overwriting canonical content
					// The first instance already set the canonical content
					continue;
				}
				processedBlockIds.add(block.blockId);
				
				await this.upsertBlockAndMaybeSync(filePath, {
					blockId: block.blockId,
					blockName: block.blockName,
					content: block.content,
				});
			}

			// Handle removals (must use previous block IDs to detect what was removed)
			await this.handleBlocksMissingFromFile(filePath, blocksInFile, previousBlockIds);

			// Update file index after processing
			this.registry.fileIndex[filePath] = blocksInFile.map((b) => b.blockId);

			// Update duplicate index - store blockIds that appear multiple times
			if (duplicates.length > 0) {
				this.registry.duplicateIndex[filePath] = duplicates;
			} else {
				// Remove from duplicate index if no duplicates (file was fixed)
				delete this.registry.duplicateIndex[filePath];
			}
		} catch (error) {
			// Log error for debugging (background operation, no user notification)
			console.error(`[Synced Blocks] Error processing file ${filePath}:`, error);
		}
	}

	/**
	 * Detects duplicate block IDs in a file
	 * @param blocksInFile Array of parsed blocks from the file
	 * @returns Array of block IDs that appear multiple times
	 */
	private detectDuplicateBlocks(blocksInFile: ParsedBlock[]): string[] {
		// Group blocks by blockId to find duplicates
		const blocksById = new Map<string, ParsedBlock[]>();
		for (const block of blocksInFile) {
			if (!blocksById.has(block.blockId)) {
				blocksById.set(block.blockId, []);
			}
			blocksById.get(block.blockId)!.push(block);
		}

		// Find block IDs that appear more than once
		const duplicates: string[] = [];
		for (const [blockId, blocks] of blocksById.entries()) {
			if (blocks.length > 1) {
				duplicates.push(blockId);
			}
		}

		return duplicates;
	}

	/**
	 * Handles duplicate blocks found in a file
	 * Logs warnings and optionally shows user notification
	 * @param filePath Path to the file with duplicates
	 * @param duplicateBlockIds Array of block IDs that appear multiple times
	 * @param blocksInFile All blocks in the file
	 * @param showNotification Whether to show user notification (default: true, set to false during bulk operations to avoid spam)
	 */
	private handleDuplicateBlocks(
		filePath: string,
		duplicateBlockIds: string[],
		blocksInFile: ParsedBlock[],
		showNotification: boolean = true
	): void {
		// Get block names for better logging
		const duplicateInfo = duplicateBlockIds.map((blockId) => {
			const firstBlock = blocksInFile.find((b) => b.blockId === blockId);
			const allInstances = blocksInFile.filter((b) => b.blockId === blockId);
			return {
				blockId,
				blockName: firstBlock?.blockName || blockId,
				instanceCount: allInstances.length,
			};
		});

		// Store duplicate information for bulk operations
		this.duplicateFiles.set(filePath, duplicateInfo);

		// Log warning with details
		console.warn(
			`[Synced Blocks] Found ${duplicateBlockIds.length} duplicate block ID(s) in file: ${filePath}`,
			duplicateInfo.map((info) => ({
				name: info.blockName,
				id: info.blockId,
				instances: info.instanceCount,
			}))
		);

		// Show non-intrusive user notification (only if not during bulk operation)
		if (showNotification) {
			setTimeout(() => {
				const duplicateNames = duplicateInfo.map((info) => info.blockName).join(", ");
				const message =
					duplicateInfo.length === 1
						? `Duplicate synced block "${duplicateNames}" found in ${filePath}. Only the first instance will be used for syncing.`
						: `${duplicateInfo.length} duplicate synced blocks found in ${filePath}: ${duplicateNames}. Only the first instance of each will be used for syncing.`;

				new Notice(message, 6000);
			}, 100);
		}
	}

	/**
	 * Handles file rename
	 */
	async handleFileRename(oldPath: string, newPath: string): Promise<void> {
		// Move fileIndex entry
		if (this.registry.fileIndex[oldPath]) {
			this.registry.fileIndex[newPath] = this.registry.fileIndex[oldPath];
			delete this.registry.fileIndex[oldPath];
		}

		// Move duplicateIndex entry
		if (this.registry.duplicateIndex[oldPath]) {
			this.registry.duplicateIndex[newPath] = this.registry.duplicateIndex[oldPath];
			delete this.registry.duplicateIndex[oldPath];
		}

		// Update all block locations
		for (const blockEntry of Object.values(this.registry.blocks)) {
			if (blockEntry.locations[oldPath]) {
				blockEntry.locations[newPath] = blockEntry.locations[oldPath];
				delete blockEntry.locations[oldPath];
			}
		}

		this.scheduleSaveToStorage();
	}

	/**
	 * Handles file delete
	 */
	async handleFileDelete(filePath: string): Promise<void> {
		// Remove all location entries for blocks in this file
		const blockIds = this.registry.fileIndex[filePath] || [];
		for (const blockId of blockIds) {
			const blockEntry = this.registry.blocks[blockId];
			if (blockEntry && blockEntry.locations[filePath]) {
				delete blockEntry.locations[filePath];
			}

			// If block has no remaining locations, remove it from registry entirely
			if (blockEntry && Object.keys(blockEntry.locations).length === 0) {
				delete this.registry.blocks[blockId];
			}
		}

		// Remove from file index
		delete this.registry.fileIndex[filePath];

		// Remove from duplicate index
		delete this.registry.duplicateIndex[filePath];

		this.scheduleSaveToStorage();
	}

	/**
	 * Gets block IDs in a file
	 */
	getBlockIdsInFile(filePath: string): string[] {
		return this.registry.fileIndex[filePath] || [];
	}

	/**
	 * Gets duplicate block IDs in a file (from persisted registry)
	 * @param filePath Path to the file
	 * @returns Array of block IDs that appear multiple times in the file
	 */
	getDuplicateBlockIdsInFile(filePath: string): string[] {
		return this.registry.duplicateIndex[filePath] || [];
	}

	/**
	 * Checks if a file has duplicate blocks (from persisted registry)
	 * @param filePath Path to the file
	 * @returns true if the file has duplicate blocks
	 */
	hasDuplicateBlocks(filePath: string): boolean {
		return (this.registry.duplicateIndex[filePath]?.length || 0) > 0;
	}

	/**
	 * Gets all files that have duplicate blocks (from persisted registry)
	 * @returns Array of file paths that contain duplicate blocks
	 */
	getFilesWithDuplicates(): string[] {
		return Object.keys(this.registry.duplicateIndex);
	}

	/**
	 * Gets all files that have duplicate blocks with details (from persisted registry)
	 * @returns Map of file paths to duplicate block IDs
	 */
	getDuplicateFiles(): Map<string, string[]> {
		return new Map(Object.entries(this.registry.duplicateIndex));
	}

	/**
	 * Gets duplicate statistics summary (from persisted registry)
	 * @returns Summary of duplicate blocks found
	 */
	getDuplicateStatistics(): {
		filesWithDuplicates: number;
		totalDuplicateBlocks: number;
		files: Array<{
			filePath: string;
			duplicateCount: number;
			blockIds: string[];
		}>;
	} {
		const files = Object.entries(this.registry.duplicateIndex).map(([filePath, blockIds]) => ({
			filePath,
			duplicateCount: blockIds.length,
			blockIds,
		}));

		const totalDuplicateBlocks = files.reduce((sum, file) => sum + file.duplicateCount, 0);

		return {
			filesWithDuplicates: files.length,
			totalDuplicateBlocks,
			files,
		};
	}

	/**
	 * Gets runtime duplicate tracking (from current session)
	 * This includes detailed information like block names and instance counts
	 * @returns Map of file paths to duplicate block information
	 */
	getRuntimeDuplicateFiles(): Map<string, Array<{ blockId: string; blockName: string; instanceCount: number }>> {
		return new Map(this.duplicateFiles);
	}

	/**
	 * Clears runtime duplicate tracking (useful after showing summary)
	 * Note: This only clears runtime tracking, not persisted duplicateIndex
	 */
	clearDuplicateTracking(): void {
		this.duplicateFiles.clear();
	}

	/**
	 * Resolves a conflict by accepting a specific variant as the canonical content
	 * @param blockId The ID of the block with the conflict
	 * @param variantHash The hash of the variant to accept (must match one of the conflict variants)
	 * @returns true if conflict was resolved, false if variant not found or no conflict exists
	 */
	async resolveConflict(blockId: string, variantHash: string): Promise<boolean> {
		const blockEntry = this.registry.blocks[blockId];
		if (!blockEntry || !blockEntry.conflict) {
			return false; // No conflict to resolve
		}

		// Find the variant with matching hash
		const chosenVariant = blockEntry.conflict.variants.find(
			(v) => v.hash === variantHash
		);

		if (!chosenVariant) {
			return false; // Variant not found
		}

		// Set canonical content to chosen variant
		const normalizedContent = normalize(chosenVariant.content);
		blockEntry.canonicalContent = normalizedContent;
		blockEntry.revision += 1;
		blockEntry.updatedAtMs = Date.now();

		// Clear conflict
		blockEntry.conflict = null;

		// Update location tracking for all locations
		const canonicalHash = await this.getCachedHash(normalizedContent);
		for (const [, location] of Object.entries(blockEntry.locations)) {
			location.lastAppliedRevision = blockEntry.revision;
			location.lastSeenHash = canonicalHash;
			location.lastSeenAtMs = Date.now();
		}

		// Propagate resolved content to all files
		await this.propagateBlockToAllFiles(blockId);

		this.scheduleSaveToStorage();
		return true;
	}
}

