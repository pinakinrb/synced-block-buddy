import { App, Plugin, TFile } from "obsidian";
import { SyncedBlockRegistry } from "./synced-block-registry";
import { SyncedBlockEntry } from "../types/synced-block-registry";

/**
 * Main manager for synced blocks using the new conflict-detecting algorithm
 * Handles file change detection and registry updates
 */
export class SyncedBlockManager {
	private registry: SyncedBlockRegistry;
	private isInitialized = false;
	private processFileTimeouts: Map<string, number> = new Map();
	private readonly DEBOUNCE_MS = 500;
	private buildIndexAbortController: AbortController | null = null;
	private readonly BATCH_SIZE = 10;
	private readonly FILES_PER_BATCH = 5;

	constructor(private app: App, private plugin: Plugin) {
		this.registry = new SyncedBlockRegistry(app, plugin);
	}

	/**
	 * Initializes the manager and sets up file change listeners
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Load registry from persistent storage
		await this.registry.loadFromStorage();

		// Listen for file modifications
		this.plugin.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.scheduleProcessFile(file.path, "modify");
				}
			})
		);

		// Listen for file deletions
		this.plugin.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.handleFileDelete(file.path);
				}
			})
		);

		// Listen for file renames
		this.plugin.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && file.extension === "md") {
					this.handleFileRename(file.path, oldPath);
				}
			})
		);

		// Listen for file opens
		this.plugin.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.scheduleProcessFile(file.path, "open");
				}
			})
		);

		this.isInitialized = true;
	}

	/**
	 * Schedules file processing with debouncing
	 * Single pipeline for all file events
	 */
	private scheduleProcessFile(filePath: string, reason: string): void {
		// Clear existing timeout for this file
		const existingTimeout = this.processFileTimeouts.get(filePath);
		if (existingTimeout !== undefined) {
			window.clearTimeout(existingTimeout);
		}

		// Schedule new processing
		const timeout = window.setTimeout(() => {
			void (async () => {
				try {
					await this.registry.processFile(filePath);
				} catch (error) {
					// Log error for debugging (background operation, no user notification)
					console.error(`[Synced Blocks] Error processing file ${filePath}:`, error);
				} finally {
					this.processFileTimeouts.delete(filePath);
				}
			})();
		}, this.DEBOUNCE_MS);

		this.processFileTimeouts.set(filePath, timeout);
	}

	/**
	 * Handles file rename events
	 */
	private handleFileRename(newPath: string, oldPath: string): void {
		try {
			this.registry.handleFileRename(oldPath, newPath);
		} catch (error) {
			// Log error for debugging (background operation, no user notification)
			console.error(`[Synced Blocks] Error handling file rename from ${oldPath} to ${newPath}:`, error);
		}
	}

	/**
	 * Handles file deletion events
	 */
	private handleFileDelete(filePath: string): void {
		try {
			this.registry.handleFileDelete(filePath);
		} catch (error) {
			// Log error for debugging (background operation, no user notification)
			console.error(`[Synced Blocks] Error handling file delete ${filePath}:`, error);
		}
	}

	/**
	 * Gets all synced block entries
	 */
	getAllBlocks(): SyncedBlockEntry[] {
		return this.registry.getAllBlocks();
	}

	/**
	 * Gets a synced block entry by ID
	 */
	getBlock(blockId: string): SyncedBlockEntry | undefined {
		return this.registry.getBlock(blockId);
	}

	/**
	 * Gets block IDs in a file
	 */
	getBlockIdsInFile(filePath: string): string[] {
		return this.registry.getBlockIdsInFile(filePath);
	}

	/**
	 * Checks if a block name already exists (case-insensitive)
	 * Uses optimized registry lookup - O(n) where n = number of blocks
	 * Much more efficient than scanning all files
	 */
	hasBlockName(name: string): boolean {
		return this.registry.hasBlockName(name);
	}

	/**
	 * Resolves a conflict by accepting a specific variant as canonical content
	 * @param blockId The ID of the block with the conflict
	 * @param variantHash The hash of the variant to accept
	 * @returns true if conflict was resolved successfully
	 */
	async resolveConflict(blockId: string, variantHash: string): Promise<boolean> {
		return await this.registry.resolveConflict(blockId, variantHash);
	}

	/**
	 * Processes a file to register/update blocks
	 * Called when block is created via GUI - the file modify event will handle it automatically,
	 * but this can be called for immediate processing
	 */
	async processFile(file: TFile): Promise<void> {
		try {
			await this.registry.processFile(file.path);
		} catch (error) {
			// Re-throw error so caller can handle it (this is called from user-initiated operations)
			console.error(`[Synced Blocks] Error processing file ${file.path}:`, error);
			throw error;
		}
	}

	/**
	 * Builds the index by scanning all markdown files in the vault
	 * Registers all synced blocks found and saves to persistent storage
	 * Non-blocking: processes files in batches with UI yields
	 * Supports cancellation via AbortController
	 */
	async buildIndex(): Promise<{
		filesProcessed: number;
		blocksFound: number;
		duplicateStats: {
			filesWithDuplicates: number;
			totalDuplicateBlocks: number;
		};
	}> {
		// Cancel any existing build operation
		if (this.buildIndexAbortController) {
			this.buildIndexAbortController.abort();
		}

		// Create new abort controller for this build
		this.buildIndexAbortController = new AbortController();
		const signal = this.buildIndexAbortController.signal;

		// Clear any previous duplicate tracking before starting new index build
		this.registry.clearDuplicateTracking();

		const markdownFiles = this.app.vault.getMarkdownFiles();
		let filesProcessed = 0;
		let blocksFound = 0;

		// Process files in batches to avoid blocking UI
		for (let i = 0; i < markdownFiles.length; i += this.BATCH_SIZE) {
			// Check if cancelled
			if (signal.aborted) {
				throw new Error("Index build cancelled");
			}

			// Get batch of files
			const batch = markdownFiles.slice(i, i + this.BATCH_SIZE);

			// Process batch in parallel (with concurrency limit)
			for (let j = 0; j < batch.length; j += this.FILES_PER_BATCH) {
				// Check if cancelled
				if (signal.aborted) {
					throw new Error("Index build cancelled");
				}

				const parallelBatch = batch.slice(j, j + this.FILES_PER_BATCH);
				
				// Process parallel batch
				await Promise.all(
					parallelBatch.map(async (file) => {
						if (signal.aborted) {
							return;
						}

						try {
							// Process file with notification suppression during bulk operation
							// We'll show a summary at the end instead of individual notifications
							await this.registry.processFile(file.path, true);
							const blockIds = this.registry.getBlockIdsInFile(file.path);
							blocksFound += blockIds.length;
							filesProcessed++;
						} catch (error) {
							// Log error but continue processing other files
							console.error(`[Synced Blocks] Error processing file ${file.path} during index build:`, error);
						}
					})
				);
			}

			// Yield to UI thread between batches
			await new Promise<void>((resolve) => {
				setTimeout(() => resolve(), 0);
			});
		}

		// Clear abort controller on completion
		this.buildIndexAbortController = null;

		// Get duplicate statistics
		const duplicateStats = this.registry.getDuplicateStatistics();

		return {
			filesProcessed,
			blocksFound,
			duplicateStats: {
				filesWithDuplicates: duplicateStats.filesWithDuplicates,
				totalDuplicateBlocks: duplicateStats.totalDuplicateBlocks,
			},
		};
	}

	/**
	 * Cancels the current index build operation if one is in progress
	 */
	cancelBuildIndex(): void {
		if (this.buildIndexAbortController) {
			this.buildIndexAbortController.abort();
			this.buildIndexAbortController = null;
		}
	}

	/**
	 * Checks if an index build is currently in progress
	 */
	isBuildingIndex(): boolean {
		return this.buildIndexAbortController !== null && !this.buildIndexAbortController.signal.aborted;
	}

	/**
	 * Cleans up resources
	 */
	async unload(): Promise<void> {
		// Clear all pending timeouts
		for (const timeout of Array.from(this.processFileTimeouts.values())) {
			window.clearTimeout(timeout);
		}
		this.processFileTimeouts.clear();
		
		// Force immediate save before unloading
		await this.registry.saveToStorageImmediate();
		
		this.isInitialized = false;
	}
}

