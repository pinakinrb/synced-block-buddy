import { CreateSyncedBlockConfigArea } from "./modals/create-synced-block-config-area-modal";
import SyncedBlockBuddyPlugin from "../main";

/**
 * Registers context menu items for the plugin
 */
export function registerContextMenu(plugin: SyncedBlockBuddyPlugin): void {
	// Register context menu for editor
	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu, editor, view) => {
			menu.addItem((item) => {
				item.setTitle("Create new synced block")
					.setIcon("refresh-ccw")
					.setSection("action")
					.onClick(() => {
						new CreateSyncedBlockConfigArea(plugin.app, plugin).open();
					});
			});
		})
	);
}
