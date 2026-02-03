/**
 * Utility functions for hashing and content normalization
 */

/**
 * Normalizes content for consistent comparison
 * - Normalizes line endings to \n
 * - Trims trailing whitespace from each line
 */
export function normalize(content: string): string {
	return content
		.split(/\r\n|\r|\n/)
		.map((line) => line.trimEnd())
		.join("\n")
		.trim();
}

/**
 * Generates a stable hash of content using SHA-256
 * Returns a hex string
 */
export async function hash(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}


