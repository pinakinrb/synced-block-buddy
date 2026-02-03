import { App, DataAdapter, Plugin } from "obsidian";

/**
 * Extended types for Obsidian APIs that aren't fully typed
 */

/**
 * Plugin manifest structure
 */
export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	minAppVersion: string;
	description: string;
	author: string;
	authorUrl?: string;
	fundingUrl?: string | Record<string, string>;
	isDesktopOnly: boolean;
	dir?: string;
}

/**
 * Plugin with manifest property (internal Obsidian property)
 */
export interface PluginWithManifest extends Plugin {
	manifest: PluginManifest;
}

/**
 * DataAdapter with basePath property (available in Electron environment)
 */
export interface DataAdapterWithBasePath extends DataAdapter {
	basePath?: string;
	getBasePath?: () => string | undefined;
}

/**
 * App with plugins property (internal Obsidian property)
 */
export interface AppWithPlugins extends App {
	plugins: {
		getPlugin(id: string): Plugin | null;
		enabledPlugins: Set<string>;
		plugins: Record<string, Plugin>;
	};
}

/**
 * Node.js module type (simplified)
 */
export interface NodeModule {
	id: string;
	exports: unknown;
}

/**
 * Electron require function type
 */
export interface ElectronRequire {
	(id: string): NodeModule | undefined;
}

/**
 * Node.js Buffer type (simplified)
 */
export interface NodeBuffer {
	toString(encoding?: string): string;
}

/**
 * Node.js fs module type (simplified)
 */
export interface NodeFS {
	existsSync(path: string): boolean;
	readFileSync(path: string, encoding?: string): string | NodeBuffer;
}

/**
 * Node.js path module type (simplified)
 */
export interface NodePath {
	isAbsolute(path: string): boolean;
	join(...paths: string[]): string;
	resolve(...paths: string[]): string;
}

/**
 * Window with Electron require (available in Electron environment)
 */
export interface WindowWithRequire extends Window {
	require?: ElectronRequire;
}

/**
 * Global with require (fallback for Electron require)
 */
export interface GlobalWithRequire {
	require?: ElectronRequire;
}

