import { App, MarkdownView, Modal, Notice, Setting } from "obsidian";
import { createSyncedBlockMarkdown, blockIdExistsInFile } from "../../utils/synced-block-format";
import { ResolveConflictModal } from "./resolve-conflict-modal";
import SyncedBlockBuddyPlugin from "../../main";
import { SyncedBlockEntry } from "../../types/synced-block-registry";

/**
 * Modal for inserting an existing synced block at the current cursor position
 */
export class InsertSyncedBlockModal extends Modal {
	private plugin: SyncedBlockBuddyPlugin;

	constructor(app: App, plugin: SyncedBlockBuddyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Set modal title
		contentEl.createEl("h2", { text: "Insert synced block" });

		// Check if there's an active editor
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			contentEl.createEl("p", {
				text: "Open a Markdown file in edit mode to insert a synced block",
				attr: { style: "color: var(--text-warning); margin-top: 1em;" }
			});
			return;
		}

		// Get all synced block entries (only blocks that have at least one location)
		const blocks = this.plugin.syncManager.getAllBlocks().filter(
			(block) => Object.keys(block.locations).length > 0
		);

		if (blocks.length === 0) {
			contentEl.createEl("p", {
				text: "No synced blocks found. Create a synced block first.",
				attr: { style: "color: var(--text-muted);" }
			});
			return;
		}

		// Create a container for the block list
		const blocksContainer = contentEl.createDiv({
			cls: "synced-blocks-list",
			attr: { style: "margin-top: 1em;" }
		});

		// Display each block with an Insert button
		for (const block of blocks) {
			const blockSetting = new Setting(blocksContainer)
				.setName(block.blockName)
				.setDesc(
					block.conflict
						? `ID: ${block.blockId} • ⚠️ Conflict: ${block.conflict.variants.length} variant(s)`
						: `ID: ${block.blockId}`
				);

			// Add resolve button if there's a conflict
			if (block.conflict) {
				blockSetting.addButton((button) => {
					button
						.setButtonText("Resolve")
						.setWarning()
						.onClick(() => {
							new ResolveConflictModal(this.app, this.plugin, block).open();
							this.close();
						});
				});
			}

			// Add insert button
			blockSetting.addButton((button) => {
				button
					.setButtonText("Insert")
					.setCta()
					.onClick(() => {
						void this.insertBlock(block);
					});
			});
		}
	}

	private async insertBlock(block: SyncedBlockEntry): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		
		if (!activeView) {
			// Show a notification instead of just logging
			new Notice("Open a Markdown file in edit mode to insert a synced block", 3000);
			return;
		}

		if (!activeView.file) {
			new Notice("No file is open. Open a Markdown file to insert a synced block", 3000);
			return;
		}

		// Check if this block ID already exists in the file
		try {
			const fileText = await this.app.vault.read(activeView.file);
			if (blockIdExistsInFile(fileText, block.blockId)) {
				new Notice(
					`This synced block (${block.blockName}) already exists in this file. Each file should only contain one instance of a synced block to avoid sync conflicts.`,
					5000
				);
				return;
			}
		} catch (error) {
			// If we can't read the file, log error but allow insertion to proceed
			// (file might be locked or have permission issues)
			console.error("[Synced Blocks] Error reading file to check for duplicates:", error);
		}

		// Use canonical content
		const content = block.canonicalContent;

		// Create the synced block markdown using the content
		const markdown = createSyncedBlockMarkdown(
			block.blockName,
			block.blockId,
			content
		);

		// Insert at current cursor position
		const editor = activeView.editor;
		const cursor = editor.getCursor();
		
		// Insert the block markdown at cursor position
		editor.replaceRange(markdown, cursor);

		// Process the file to register the block
		// The registry will handle this automatically when the file is modified,
		// but we can also process it immediately
		if (this.plugin?.syncManager) {
			void this.plugin.syncManager.processFile(activeView.file).catch((error) => {
				// Log error for debugging
				console.error("[Synced Blocks] Error processing file after block insertion:", error);
				// Show user-friendly error notification
				new Notice("Synced blocks: failed to register block. It will be registered automatically when the file is saved", 5000);
			});
		}

		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

