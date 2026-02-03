import { Plugin } from "obsidian";
import lottie, { AnimationItem } from "lottie-web";
import {
	DataAdapterWithBasePath,
	NodeFS,
	NodePath,
	PluginWithManifest,
	WindowWithRequire,
	GlobalWithRequire,
} from "../types/obsidian-extensions";

/**
 * Loads a Lottie animation JSON file and returns the animation data
 * Supports both desktop (Node.js) and mobile (vault adapter) environments
 * @param plugin - The plugin instance
 * @param assetPath - The path to the Lottie JSON file relative to the plugin folder (e.g., "assets/animation.json")
 * @returns The animation data as a JSON object, or null if not found
 */
export function loadLottieData(plugin: Plugin, assetPath: string): Record<string, unknown> | null {
	const pluginWithManifest = plugin as PluginWithManifest;
	const manifest = pluginWithManifest.manifest;
	if (!manifest || !manifest.dir) {
		return null;
	}

	try {
		const windowWithRequire = window as WindowWithRequire;
		const globalWithRequire = globalThis as GlobalWithRequire;
		const electronRequire = windowWithRequire.require || globalWithRequire.require;
		
		// Desktop path: Use Node.js fs module
		if (electronRequire) {
			const fs = electronRequire("fs") as NodeFS | undefined;
			const path = electronRequire("path") as NodePath | undefined;
			
			if (fs && path) {
				const adapter = plugin.app.vault.adapter as DataAdapterWithBasePath;
				const vaultPath = adapter.basePath || adapter.getBasePath?.();
				
				if (vaultPath) {
					let fullPath: string;
					if (path.isAbsolute(manifest.dir)) {
						fullPath = path.join(manifest.dir, assetPath);
					} else {
						fullPath = path.join(vaultPath, manifest.dir, assetPath);
					}
					
					fullPath = path.resolve(fullPath);
					
					if (fs.existsSync(fullPath)) {
						const fileContent = fs.readFileSync(fullPath, "utf-8");
						// When encoding is provided, readFileSync returns a string
						if (typeof fileContent === "string") {
							return JSON.parse(fileContent) as Record<string, unknown>;
						}
						// Fallback: convert Buffer to string if needed
						return JSON.parse(fileContent.toString()) as Record<string, unknown>;
					}
				}
			}
		}

		// Mobile path: On mobile, plugin files are not directly accessible via Node.js APIs
		// Plugin files are typically outside the vault and not accessible through vault.adapter
		// For mobile compatibility, we gracefully return null and let the fallback content display
		// This is expected behavior - the onboarding will show text instead of animation on mobile
		console.debug(`[Synced Blocks] Lottie animation not available on mobile. Showing fallback content.`);
		return null;
	} catch (error) {
		console.error(`[Synced Blocks] Error loading Lottie animation ${assetPath}:`, error);
		return null;
	}
}

/**
 * Renders a Lottie animation in the given container element
 * @param containerEl - The HTML element to render the animation in
 * @param animationData - The Lottie animation JSON data
 * @param options - Optional configuration for the animation
 * @returns The Lottie animation instance, or null if rendering failed
 */
export function renderLottieAnimation(
	containerEl: HTMLElement,
	animationData: Record<string, unknown>,
	options?: {
		loop?: boolean;
		autoplay?: boolean;
		renderer?: "svg" | "canvas" | "html";
	}
): AnimationItem | null {
	try {
		// Clear container
		containerEl.empty();
		
		// Use the container directly - no extra wrapper needed
		// Set container styles to ensure proper sizing
		containerEl.addClass("lottie-container");

		const animation = lottie.loadAnimation({
			container: containerEl,
			renderer: options?.renderer || "svg",
			loop: options?.loop !== false, // Default to true
			autoplay: options?.autoplay !== false, // Default to true
			animationData: animationData,
		});

		return animation;
	} catch (error) {
		console.error("[Synced Blocks] Error rendering Lottie animation:", error);
		return null;
	}
}

/**
 * Loads and renders a Lottie animation from a file
 * @param plugin - The plugin instance
 * @param containerEl - The HTML element to render the animation in
 * @param assetPath - The path to the Lottie JSON file
 * @param options - Optional configuration for the animation
 * @returns The Lottie animation instance, or null if loading/rendering failed
 */
export async function loadAndRenderLottie(
	plugin: Plugin,
	containerEl: HTMLElement,
	assetPath: string,
	options?: {
		loop?: boolean;
		autoplay?: boolean;
		renderer?: "svg" | "canvas" | "html";
	}
): Promise<AnimationItem | null> {
	const animationData = loadLottieData(plugin, assetPath);
	if (!animationData) {
		return null;
	}

	return renderLottieAnimation(containerEl, animationData, options);
}

