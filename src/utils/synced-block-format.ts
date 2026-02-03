/**
 * Synced block markdown format constants and utilities
 * Format:
 * %% synced-block-start {"id":"abc", "name":"Name goes here"} %%
 * 
 * content goes here
 * 
 * %% synced-block-end %%
 * Uses Obsidian comment syntax with JSON metadata in start marker, content between markers
 */

/**
 * Pattern for matching the start of a synced block
 * Matches: %% synced-block-start {...} %%
 */
const SYNCED_BLOCK_START_PATTERN = /%%\s*synced-block-start\s*/gi;

/**
 * Pattern for matching the end of a synced block
 * Matches: %% synced-block-end %%
 */
const SYNCED_BLOCK_END_PATTERN = /%%\s*synced-block-end\s*%%/gi;


/**
 * Validates and parses synced block JSON metadata from start marker
 * @param jsonString - The JSON string to parse (should contain id and name)
 * @returns Parsed and validated block metadata, or null if invalid
 */
function parseSyncedBlockMetadata(jsonString: string): { id: string; name: string } | null {
	try {
		const data = JSON.parse(jsonString) as { id?: unknown; name?: unknown };
		
		// Validate required fields
		if (typeof data.id !== "string" || !data.id.trim()) {
			return null;
		}
		
		if (typeof data.name !== "string" || !data.name.trim()) {
			return null;
		}
		
		return {
			id: data.id.trim(),
			name: data.name.trim(),
		};
	} catch (error) {
		// Log error for debugging (non-critical, returns null for invalid JSON)
		console.error("[Synced Blocks] Error parsing synced block metadata:", error);
		return null;
	}
}

/**
 * Creates a synced block markdown string using start/end markers
 * @param name - The name of the synced block
 * @param id - The unique ID of the synced block
 * @param content - The content inside the synced block (can be multi-line)
 * @returns The formatted synced block markdown string
 */
export function createSyncedBlockMarkdown(
	name: string,
	id: string,
	content: string = ""
): string {
	// Create JSON object with id and name for the start marker
	const metadata = {
		id: id,
		name: name,
	};
	
	const jsonString = JSON.stringify(metadata);
	
	// Format: start marker, content, end marker
	return `%% synced-block-start ${jsonString} %%\n\n${content}\n\n%% synced-block-end %%`;
}

/**
 * Extracts all synced blocks from markdown text
 * @param text - The markdown text to search
 * @returns Array of objects containing block name, id, and content
 */
export function extractSyncedBlocks(
	text: string
): Array<{ name: string; id: string; content: string; fullMatch: string }> {
	const blocks: Array<{
		name: string;
		id: string;
		content: string;
		fullMatch: string;
	}> = [];
	
	// Reset regex lastIndex to ensure we start from the beginning
	const startPattern = new RegExp(SYNCED_BLOCK_START_PATTERN.source, "gi");
	startPattern.lastIndex = 0;

	let startMatch;
	while ((startMatch = startPattern.exec(text)) !== null) {
		const startIndex = startMatch.index;
		const afterStart = startMatch.index + startMatch[0].length;
		
		// Find the JSON object start (should be right after "synced-block-start ")
		const jsonStart = text.indexOf("{", afterStart);
		if (jsonStart === -1) {
			continue;
		}
		
		// Try fast path: use JSON.parse() on a likely JSON substring
		// This is faster for valid JSON but may fail on edge cases
		let jsonEnd = -1;
		let jsonString = "";
		const MAX_JSON_LENGTH = 500; // Reasonable limit for block metadata
		const jsonSubstring = text.substring(jsonStart, jsonStart + MAX_JSON_LENGTH);
		
		// Try fast path: find likely JSON end (first } not in a string) and validate with JSON.parse()
		// This handles most common cases quickly without trying many substrings
		let likelyEnd = -1;
		let inStringFast = false;
		let escapeNextFast = false;
		for (let i = 0; i < jsonSubstring.length; i++) {
			const char = jsonSubstring[i];
			if (escapeNextFast) {
				escapeNextFast = false;
				continue;
			}
			if (char === "\\") {
				escapeNextFast = true;
				continue;
			}
			if (char === '"') {
				inStringFast = !inStringFast;
				continue;
			}
			if (!inStringFast && char === "}") {
				likelyEnd = jsonStart + i + 1;
				break;
			}
		}
		
		// If we found a likely end, try parsing it
		if (likelyEnd !== -1) {
			try {
				const testJson = text.substring(jsonStart, likelyEnd);
				JSON.parse(testJson); // Validate it's valid JSON
				jsonEnd = likelyEnd;
				jsonString = testJson;
			} catch {
				// JSON.parse failed (likely nested objects or edge case), fall back to manual parsing
			}
		}
		
		// Fall back to manual parsing if fast path didn't work
		if (jsonEnd === -1) {
			// Parse JSON by finding the matching closing brace
			// We need to handle nested objects and strings properly
			let braceCount = 0;
			let inString = false;
			let escapeNext = false;
			
			for (let i = jsonStart; i < text.length; i++) {
				const char = text[i];
				
				if (escapeNext) {
					escapeNext = false;
					continue;
				}
				
				if (char === "\\") {
					escapeNext = true;
					continue;
				}
				
				if (char === '"') {
					inString = !inString;
					continue;
				}
				
				if (inString) {
					continue;
				}
				
				if (char === "{") {
					braceCount++;
				} else if (char === "}") {
					braceCount--;
					if (braceCount === 0) {
						jsonEnd = i + 1;
						break;
					}
				}
			}
			
			if (jsonEnd === -1) {
				// No valid JSON found, skip this block
				continue;
			}
			
			jsonString = text.substring(jsonStart, jsonEnd);
		}
		
		// Find the closing %% marker after the JSON (end of start marker)
		// Don't trim before finding the position - we need the exact position in the original text
		const afterJson = text.substring(jsonEnd);
		const closingMarkerIndex = afterJson.indexOf("%%");
		
		if (closingMarkerIndex === -1) {
			// No closing marker found for start, skip this block
			continue;
		}
		
		// Calculate the end of the start marker: jsonEnd + position of %% + length of %%
		const startMarkerEnd = jsonEnd + closingMarkerIndex + 2;
		// jsonString is already set from parsing above, just trim it
		jsonString = jsonString.trim();
		
		// Parse the metadata (id and name)
		const metadata = parseSyncedBlockMetadata(jsonString);
		if (!metadata) {
			continue;
		}
		
		// Find the end marker (%% synced-block-end %%)
		const endPattern = new RegExp(SYNCED_BLOCK_END_PATTERN.source, "gi");
		endPattern.lastIndex = startMarkerEnd;
		const endMatch = endPattern.exec(text);
		
		if (!endMatch) {
			// No end marker found, skip this block
			continue;
		}
		
		const endIndex = endMatch.index + endMatch[0].length;
		
		// Validate that start marker end comes before end marker
		if (startMarkerEnd >= endMatch.index) {
			// Invalid block structure - start marker end is after or at end marker
			continue;
		}
		
		// Extract content between start marker end and end marker
		// Trim whitespace from both ends
		const content = text.substring(startMarkerEnd, endMatch.index).trim();
		const fullMatch = text.substring(startIndex, endIndex);
		
		blocks.push({
			name: metadata.name,
			id: metadata.id,
			content: content,
			fullMatch: fullMatch,
		});
	}

	return blocks;
}

/**
 * Generates a unique ID for a synced block
 * @returns A unique ID string
 */
export function generateSyncedBlockId(): string {
	return `sb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Checks if a block ID already exists in the given file text
 * @param fileText - The file text to search
 * @param blockId - The block ID to check for
 * @returns true if the block ID exists in the file, false otherwise
 */
export function blockIdExistsInFile(fileText: string, blockId: string): boolean {
	const blocks = extractSyncedBlocks(fileText);
	return blocks.some((block) => block.id === blockId);
}

