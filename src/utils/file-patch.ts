import { extractSyncedBlocks, createSyncedBlockMarkdown } from "./synced-block-format";

/**
 * Represents a block range in a file
 */
export interface BlockRange {
	blockId: string;
	startOffset: number;
	endOffset: number;
}

/**
 * Represents a parsed block with full information
 */
export interface ParsedBlock {
	blockId: string;
	blockName?: string;
	content: string;
	startOffset: number;
	endOffset: number;
}

/**
 * Represents an update to apply to a block
 */
export interface BlockUpdate {
	blockId: string;
	newContent: string;
}

/**
 * Parses blocks from file text and returns block ranges
 * startOffset/endOffset are computed each scan, not stored permanently
 */
export function parseBlocksFromFile(fileText: string): ParsedBlock[] {
	const blocks = extractSyncedBlocks(fileText);
	return blocks.map((block) => {
		// Find the block in the text to get exact offsets
		const startOffset = fileText.indexOf(block.fullMatch);
		const endOffset = startOffset + block.fullMatch.length;
		
		return {
			blockId: block.id,
			blockName: block.name,
			content: block.content,
			startOffset,
			endOffset,
		};
	});
}

/**
 * Patches file text by updating block content
 * Optimized to avoid re-parsing: tracks offset changes as patches are applied
 * @param fileText Original file text
 * @param parsedBlocks Current parsed blocks in the file (must include blockName)
 * @param updates Array of updates to apply
 * @returns New file text with updates applied
 */
export function patchFileText(
	fileText: string,
	parsedBlocks: ParsedBlock[],
	updates: BlockUpdate[]
): string {
	// Create a map of blockId -> newContent for quick lookup
	const updateMap = new Map<string, string>();
	for (const update of updates) {
		updateMap.set(update.blockId, update.newContent);
	}

	// Filter to only blocks that need updates
	const blocksToUpdate = parsedBlocks
		.filter((block) => updateMap.has(block.blockId))
		.sort((a, b) => b.startOffset - a.startOffset); // Sort by offset descending (end to start)

	// If no blocks to update, return original text
	if (blocksToUpdate.length === 0) {
		return fileText;
	}

	// Track offset adjustments as we apply patches from end to start
	// Since we apply from end to start, offsets before the current patch don't change
	// But we need to track cumulative size changes to adjust offsets correctly
	let result = fileText;
	
	// Map to track size changes for each block (for offset calculation)
	const sizeChanges = new Map<number, number>(); // originalEndOffset -> sizeDiff

	for (const block of blocksToUpdate) {
		const newContent = updateMap.get(block.blockId);
		if (!newContent) {
			continue; // Should not happen due to filter, but safety check
		}

		// Calculate cumulative offset adjustment from all patches applied AFTER this block
		// (i.e., blocks with higher startOffset that we've already processed)
		let cumulativeOffsetAdjustment = 0;
		for (const [endOffset, sizeDiff] of sizeChanges.entries()) {
			if (endOffset > block.endOffset) {
				cumulativeOffsetAdjustment += sizeDiff;
			}
		}

		// Calculate adjusted offsets (accounting for patches applied after this block)
		const adjustedStartOffset = block.startOffset + cumulativeOffsetAdjustment;
		const adjustedEndOffset = block.endOffset + cumulativeOffsetAdjustment;

		// Extract content before and after this block
		const beforeContent = result.substring(0, adjustedStartOffset);
		const afterContent = result.substring(adjustedEndOffset);

		// Reconstruct the block with new content
		const newBlockMarkdown = createSyncedBlockMarkdown(
			block.blockName || "",
			block.blockId,
			newContent
		);

		// Calculate the size difference
		const oldSize = adjustedEndOffset - adjustedStartOffset;
		const newSize = newBlockMarkdown.length;
		const sizeDiff = newSize - oldSize;

		// Store size change for future offset calculations
		sizeChanges.set(block.endOffset, sizeDiff);

		// Apply the patch
		result = beforeContent + newBlockMarkdown + afterContent;
	}

	return result;
}

