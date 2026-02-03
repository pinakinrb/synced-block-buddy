/**
 * New registry data model for multi-master conflict-detecting algorithm
 */

/**
 * Per-file location tracking
 */
export interface BlockLocation {
	/** Last registry revision we wrote into THIS file */
	lastAppliedRevision: number;
	/** Hash of content we last read from THIS file */
	lastSeenHash: string | null;
	/** Optional timestamp for debugging */
	lastSeenAtMs?: number;
}

/**
 * Conflict variant information
 */
export interface ConflictVariant {
	filePath: string;
	content: string;
	hash: string;
}

/**
 * Conflict information
 */
export interface BlockConflict {
	/** Revision at which conflict was detected */
	atRevision: number;
	/** All conflicting variants */
	variants: ConflictVariant[];
}

/**
 * Registry entry for a synced block
 */
export interface SyncedBlockEntry {
	blockId: string;
	blockName: string;
	/** Current winning content */
	canonicalContent: string;
	/** Integer, monotonic revision number */
	revision: number;
	/** Optional timestamp for debugging */
	updatedAtMs?: number;
	/** Per-file tracking */
	locations: Record<string, BlockLocation>;
	/** Conflict state (null if no conflict) */
	conflict: BlockConflict | null;
}

/**
 * Write guard to suppress self-triggered modify events
 */
export interface WriteGuard {
	token: string;
	expiresAtMs: number;
}

/**
 * Complete registry data structure
 */
export interface SyncedBlockRegistryData {
	blocks: Record<string, SyncedBlockEntry>;
	fileIndex: Record<string, string[]>; // filePath -> blockIds[]
	duplicateIndex: Record<string, string[]>; // filePath -> duplicate blockIds[] (blockIds that appear multiple times)
	writeGuards: Record<string, WriteGuard>; // filePath -> guard
}

