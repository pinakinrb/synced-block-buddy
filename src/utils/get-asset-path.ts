import { Plugin } from "obsidian";
import {
	DataAdapterWithBasePath,
	NodeFS,
	NodePath,
	PluginWithManifest,
	WindowWithRequire,
	GlobalWithRequire,
} from "../types/obsidian-extensions";

/**
 * Gets the path to a plugin asset as a data URI
 * @param plugin - The plugin instance
 * @param assetPath - The path to the asset relative to the plugin folder (e.g., "assets/mascot.png")
 * @returns The asset as a data URI, or empty string if not found
 */
export function getAssetPath(plugin: Plugin, assetPath: string): string {
	// Access the plugin's manifest directory
	const pluginWithManifest = plugin as PluginWithManifest;
	const manifest = pluginWithManifest.manifest;
	if (!manifest || !manifest.dir) {
		return "";
	}

	try {
		// Use Node.js fs module (available in Electron environment)
		const windowWithRequire = window as WindowWithRequire;
		const globalWithRequire = globalThis as GlobalWithRequire;
		const electronRequire = windowWithRequire.require || globalWithRequire.require;
		
		if (!electronRequire) {
			return "";
		}

		const fs = electronRequire("fs") as NodeFS | undefined;
		const path = electronRequire("path") as NodePath | undefined;
		
		if (!fs || !path) {
			return "";
		}

		// Get the vault adapter to resolve the base path
		const adapter = plugin.app.vault.adapter as DataAdapterWithBasePath;
		const vaultPath = adapter.basePath || adapter.getBasePath?.();
		
		if (!vaultPath) {
			return "";
		}
		
		// Resolve the full path - manifest.dir might be relative or absolute
		let fullPath: string;
		if (path.isAbsolute(manifest.dir)) {
			// If manifest.dir is already absolute, use it directly
			fullPath = path.join(manifest.dir, assetPath);
		} else {
			// If relative, resolve it relative to the vault root
			fullPath = path.join(vaultPath, manifest.dir, assetPath);
		}
		
		// Normalize the path (resolve .. and . segments)
		fullPath = path.resolve(fullPath);
		
		// Check if file exists
		if (!fs.existsSync(fullPath)) {
			return "";
		}

		// Read file and convert to base64 data URI
		const fileBuffer = fs.readFileSync(fullPath);
		const mimeType = getMimeType(assetPath);
		// Buffer is available in Node.js/Electron environment
		const base64 = typeof fileBuffer === "string" 
			? btoa(fileBuffer) 
			: fileBuffer.toString("base64");
		return `data:${mimeType};base64,${base64}`;
	} catch (error) {
		// Log error for debugging (non-critical, returns empty string)
		console.error(`[Synced Blocks] Error loading asset ${assetPath}:`, error);
		return "";
	}
}

/**
 * Gets the MIME type for a file based on its extension
 */
function getMimeType(filePath: string): string {
	const ext = filePath.split(".").pop()?.toLowerCase();
	const mimeTypes: Record<string, string> = {
		"png": "image/png",
		"jpg": "image/jpeg",
		"jpeg": "image/jpeg",
		"gif": "image/gif",
		"svg": "image/svg+xml",
		"webp": "image/webp",
	};
	return mimeTypes[ext || ""] || "image/png";
}

