import { App, Modal, Notice, Setting } from "obsidian";
import { createNewSyncedBlock } from "../../utils/create-synced-block";
import { InsertSyncedBlockModal } from "./insert-synced-block-modal";
import { ResolveConflictModal } from "./resolve-conflict-modal";
import SyncedBlockBuddyPlugin from "../../main";
import { getAssetPath } from "../../utils/get-asset-path";
import { createAuthorPromo } from "../author-promo";

export class MainSyncedBlocksModal extends Modal {
	private plugin: SyncedBlockBuddyPlugin;

	constructor(app: App, plugin: SyncedBlockBuddyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Set modal title
		contentEl.createEl("h2", { text: "Synced Block Buddy" });

		// Create New Synced Block button
		new Setting(contentEl)
			.setName("Create new synced block")
			.setDesc("Create a new synced block that can be inserted in multiple notes")
			.addButton((button) => {
				button.setButtonText("New").onClick(() => {
					createNewSyncedBlock(this.app);
					this.close();
				});
			});

		// Insert Synced Block button
		new Setting(contentEl)
			.setName("Insert synced block")
			.setDesc("Insert an existing synced block at the current cursor position")
			.addButton((button) => {
				button.setButtonText("Insert").onClick(() => {
					new InsertSyncedBlockModal(this.app, this.plugin).open();
					this.close();
				});
			});

		// Check for conflicts and show them
		const blocksWithConflicts = this.plugin.syncManager.getAllBlocks().filter(
			(block) => block.conflict !== null
		);

		if (blocksWithConflicts.length > 0) {
			contentEl.createEl("hr");
			contentEl.createEl("h3", {
				text: `Conflicts (${blocksWithConflicts.length})`,
				attr: { style: "color: var(--text-error); margin-top: 1em;" }
			});

			contentEl.createEl("p", {
				text: "The following blocks have conflicts that need resolution:",
				attr: { style: "color: var(--text-muted); margin-bottom: 1em;" }
			});

			// Show each conflicted block
			for (const block of blocksWithConflicts) {
				const conflictSetting = new Setting(contentEl)
					.setName(block.blockName)
					.setDesc(`ID: ${block.blockId} • ${block.conflict?.variants.length || 0} variant(s)`);

				conflictSetting.addButton((button) => {
					button.setButtonText("Resolve")
						.setWarning()
						.onClick(() => {
							new ResolveConflictModal(this.app, this.plugin, block).open();
							this.close();
						});
				});
			}
		}

		// Build Index button
		contentEl.createEl("hr");
		new Setting(contentEl)
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

		// Add author promotion section with mascot
		contentEl.createEl("hr");
		const mascotPath = await getAssetPath(this.plugin, "assets/mascot.png");
		createAuthorPromo(contentEl, mascotPath);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

