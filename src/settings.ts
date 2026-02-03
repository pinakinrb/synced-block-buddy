import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import SyncedBlockBuddyPlugin from "./main";
import { getAssetPath } from "./utils/get-asset-path";
import { createAuthorPromo } from "./ui/author-promo";
import { OnboardingManager } from "./core/onboarding-manager";

export interface SyncedBlockBuddySettings {
	hasCompletedOnboarding: boolean;
	showTips: boolean;
}

export const DEFAULT_SETTINGS: SyncedBlockBuddySettings = {
	hasCompletedOnboarding: false,
	showTips: true,
};

export class SyncedBlocksSettingTab extends PluginSettingTab {
	plugin: SyncedBlockBuddyPlugin;

	constructor(app: App, plugin: SyncedBlockBuddyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Configuration").setHeading();

		// Build Index button
		new Setting(containerEl)
			.setName("Build index")
			.setDesc("Scan all files and rebuild the synced blocks index. This will update the registry with all synced blocks found in your vault.")
			.addButton((button) => {
				button.setButtonText("Build")
					.setCta()
					.onClick(async () => {
						// Check if already building
						if (this.plugin.syncManager.isBuildingIndex()) {
							// Cancel build
							this.plugin.syncManager.cancelBuildIndex();
							button.setButtonText("Build");
							button.setDisabled(false);
							return;
						}

						// Start building
						button.setButtonText("Cancel");
						button.setWarning();
						
						try {
							const result = await this.plugin.syncManager.buildIndex();
							let buttonText = `Done (${result.blocksFound} blocks found)`;
							
							// Show duplicate summary if any duplicates were found
							if (result.duplicateStats.filesWithDuplicates > 0) {
								const duplicateMessage =
									result.duplicateStats.filesWithDuplicates === 1
										? `Found 1 file with ${result.duplicateStats.totalDuplicateBlocks} duplicate block(s). Check console for details.`
										: `Found ${result.duplicateStats.filesWithDuplicates} files with ${result.duplicateStats.totalDuplicateBlocks} total duplicate block(s). Check console for details.`;
								
								new Notice(duplicateMessage, 8000);
								buttonText += ` • ${result.duplicateStats.filesWithDuplicates} file(s) with duplicates`;
							}
							
							button.setButtonText(buttonText);
							button.setCta();
							
							// Reset button after 3 seconds
							setTimeout(() => {
								button.setButtonText("Build");
								button.setDisabled(false);
							}, 3000);
						} catch (error) {
							// Check if it was cancelled
							if (error instanceof Error && error.message === "Index build cancelled") {
								button.setButtonText("Build");
								button.setCta();
								button.setDisabled(false);
								new Notice("Index build cancelled", 2000);
							} else {
								// Log error for debugging
								console.error("[Synced Blocks] Error building index:", error);
								// Show user-friendly error notification
								new Notice("Synced blocks: failed to build index. Some files may have errors. Check console for details", 5000);
								button.setButtonText("Error - try again");
								button.setCta();
								button.setDisabled(false);
							}
						}
					});
			});

		// Show tutorial again button
		new Setting(containerEl)
			.setName("Show tutorial again")
			.setDesc("Reopen the onboarding tutorial to learn how to use synced block buddy")
			.addButton((button) => {
				button.setButtonText("Open tutorial")
					.setCta()
					.onClick(() => {
						OnboardingManager.showOnboarding(this.plugin);
					});
			});

		// Add author promotion section with mascot
		containerEl.createEl("hr");
		// Load mascot and update the UI
		const mascotPath = getAssetPath(this.plugin, "assets/mascot.png");
		createAuthorPromo(containerEl, mascotPath);
	}
}
