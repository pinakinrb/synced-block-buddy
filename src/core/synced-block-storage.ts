import { Plugin } from "obsidian";
import { SyncedBlockRegistryData } from "../types/synced-block-registry";

/**
 * Storage key constant
 */
const STORAGE_KEY = "synced-blocks-registry";

/**
 * Plugin data structure stored by Obsidian
 */
interface PluginData {
	[STORAGE_KEY]?: SyncedBlockRegistryData;
	[key: string]: unknown;
}

/**
 * Manages persistent storage of synced block registry
 * Uses Obsidian's plugin data storage (saveData/loadData)
 * Implements caching to reduce redundant I/O operations
 */
export class SyncedBlockStorage {
	private static cachedPluginData: PluginData | null = null;
	private static cacheTimestamp: number = 0;

	/**
	 * Loads registry data from persistent storage
	 * Uses cached data if available to avoid redundant I/O
	 */
	static async load(plugin: Plugin): Promise<SyncedBlockRegistryData | null> {
		try {
			// Use cached data if available
			let data: PluginData | null = null;
			if (this.cachedPluginData !== null) {
				data = this.cachedPluginData;
			} else {
				// Load from disk and cache it
				const loadedData = (await plugin.loadData()) as PluginData | null;
				data = loadedData || {};
				this.cachedPluginData = data;
				this.cacheTimestamp = Date.now();
			}

			if (!data) {
				return null;
			}

			// Check if registry data exists
			const registryData = data[STORAGE_KEY];
			if (!registryData || typeof registryData !== "object" || !("blocks" in registryData)) {
				return null;
			}

			// TypeScript now knows registryData is SyncedBlockRegistryData due to the checks above
			return registryData;
		} catch (error) {
			// Log error for debugging (storage load failure is non-critical, returns null)
			console.error("[Synced Blocks] Error loading registry from storage:", error);
			// Clear cache on error
			this.clearCache();
			return null;
		}
	}

	/**
	 * Saves registry data to persistent storage
	 * Uses cached plugin data to avoid redundant loads
	 * Preserves writeGuards from existing data
	 */
	static async save(
		plugin: Plugin,
		data: Pick<SyncedBlockRegistryData, "blocks" | "fileIndex" | "duplicateIndex">
	): Promise<void> {
		try {
			// Use cached data if available, otherwise load from disk
			let existingData: PluginData;
			if (this.cachedPluginData !== null) {
				existingData = { ...this.cachedPluginData };
			} else {
				const loadedData = (await plugin.loadData()) as PluginData | null;
				existingData = loadedData || {};
			}

			// Get existing registry data to preserve writeGuards
			const existingRegistry = existingData[STORAGE_KEY];
			const writeGuards = (existingRegistry && typeof existingRegistry === "object" && "writeGuards" in existingRegistry)
				? existingRegistry.writeGuards
				: {};

			// Merge with existing data, keeping other plugin data intact
			// Include writeGuards to satisfy the full SyncedBlockRegistryData type
			const mergedData = {
				...existingData,
				[STORAGE_KEY]: {
					...data,
					writeGuards,
				},
			};

			// Save to disk
			await plugin.saveData(mergedData);

			// Update cache with merged data
			this.cachedPluginData = mergedData;
			this.cacheTimestamp = Date.now();
		} catch (error) {
			// Log error before re-throwing (caller should handle this)
			console.error("[Synced Blocks] Error saving registry to storage:", error);
			// Clear cache on error to force reload on next operation
			this.clearCache();
			throw error;
		}
	}

	/**
	 * Clears the cached plugin data
	 * Should be called when cache might be stale (e.g., external changes)
	 */
	static clearCache(): void {
		this.cachedPluginData = null;
		this.cacheTimestamp = 0;
	}

	/**
	 * Gets the cache timestamp (for debugging/monitoring)
	 */
	static getCacheTimestamp(): number {
		return this.cacheTimestamp;
	}

}

