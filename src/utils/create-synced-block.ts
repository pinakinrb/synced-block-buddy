import { App } from "obsidian";
import { CreateSyncedBlockConfigArea } from "../ui/modals/create-synced-block-config-area-modal";
import { AppWithPlugins } from "../types/obsidian-extensions";
import SyncedBlockBuddyPlugin from "../main";

/**
 * Opens the modal to create a new synced block
 */
export function createNewSyncedBlock(app: App): void {
	// Access plugins through type assertion (Obsidian API has plugins but types may not expose it)
	const appWithPlugins = app as AppWithPlugins;
	const plugins = appWithPlugins.plugins;
	if (!plugins) {
		return;
	}
	
	const plugin = plugins.getPlugin("synced-blocks") as SyncedBlockBuddyPlugin | null;
	if (plugin) {
		new CreateSyncedBlockConfigArea(app, plugin).open();
	}
}

