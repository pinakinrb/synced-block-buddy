import { App, ButtonComponent, MarkdownView, Modal, Notice, Setting } from "obsidian";
import {
	createSyncedBlockMarkdown,
	generateSyncedBlockId,
	blockIdExistsInFile,
} from "../../utils/synced-block-format";
import SyncedBlockBuddyPlugin from "../../main";

export class CreateSyncedBlockConfigArea extends Modal {
	private plugin: SyncedBlockBuddyPlugin;
	private blockName: string = "";
	private blockContent: string = "";
	private nameErrorEl: HTMLElement | null = null;
	private contentErrorEl: HTMLElement | null = null;
	private createButton: ButtonComponent | null = null;
	private nameValidationTimeout: number | null = null;
	private readonly VALIDATION_DEBOUNCE_MS = 300;

	constructor(app: App, plugin: SyncedBlockBuddyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Get selected text from editor if available
		this.getSelectedText();

		// Set modal title
		contentEl.createEl("h2", { text: "Create new synced block" });

		// Name input field
		const nameSetting = new Setting(contentEl)
			.setName("Block name")
			.setDesc("Enter a name for the synced block");
		
		nameSetting.addText((text) => {
			text.setPlaceholder("Enter block name")
				.setValue(this.blockName)
				.onChange((value) => {
					this.blockName = value;
					this.scheduleNameValidation();
					this.updateCreateButton();
				});
		});

		// Error message container for name
		this.nameErrorEl = contentEl.createEl("div", {
			cls: "synced-block-error",
			attr: { style: "color: var(--text-error); font-size: 0.9em; margin-top: -0.5em; margin-bottom: 1em; display: none;" }
		});

		// Synced Content text area
		const contentSetting = new Setting(contentEl)
			.setName("Synced content")
			.setDesc("Enter the content for the synced block");
		
		contentSetting.addTextArea((textArea) => {
			textArea.setPlaceholder("Enter synced block content")
				.setValue(this.blockContent)
				.onChange((value) => {
					this.blockContent = value;
					this.validateContent();
					this.updateCreateButton();
				});
			textArea.inputEl.rows = 8;
		});

		// Error message container for content
		this.contentErrorEl = contentEl.createEl("div", {
			cls: "synced-block-error",
			attr: { style: "color: var(--text-error); font-size: 0.9em; margin-top: -0.5em; margin-bottom: 1em; display: none;" }
		});

		// Create button
		const buttonSetting = new Setting(contentEl);
		buttonSetting.addButton((button) => {
			this.createButton = button;
			button.setButtonText("Create").setCta().onClick(() => {
				void (async () => {
					if (this.validateAll()) {
						await this.createBlock();
					}
				})();
			});
			this.updateCreateButton();
		});
	}

	private getSelectedText(): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const editor = activeView.editor;
			const selectedText = editor.getSelection();
			if (selectedText && selectedText.trim()) {
				this.blockContent = selectedText;
			}
		}
	}

	/**
	 * Schedules name validation with debouncing to avoid checking on every keystroke
	 */
	private scheduleNameValidation(): void {
		// Clear existing timeout
		if (this.nameValidationTimeout !== null) {
			window.clearTimeout(this.nameValidationTimeout);
		}

		// Schedule validation after debounce delay
		this.nameValidationTimeout = window.setTimeout(() => {
			this.validateName();
			this.nameValidationTimeout = null;
		}, this.VALIDATION_DEBOUNCE_MS);
	}

	private validateName(): boolean {
		const name = this.blockName.trim();
		
		if (!name) {
			this.showError(this.nameErrorEl, "Block name is required");
			return false;
		}

		// Check if block name already exists using optimized registry lookup
		const exists = this.blockNameExists(name);
		if (exists) {
			this.showError(this.nameErrorEl, "Block name already exists. Please choose a unique name.");
			return false;
		}

		this.hideError(this.nameErrorEl);
		return true;
	}

	private validateContent(): boolean {
		const content = this.blockContent.trim();
		
		if (!content) {
			this.showError(this.contentErrorEl, "Synced content is required");
			return false;
		}

		this.hideError(this.contentErrorEl);
		return true;
	}

	private validateAll(): boolean {
		const nameValid = this.validateName();
		const contentValid = this.validateContent();
		return nameValid && contentValid;
	}

	/**
	 * Checks if a block name already exists using optimized registry lookup
	 * Uses the registry's indexed lookup for O(n) performance where n = number of blocks
	 * (much better than scanning all files which would be O(files * blocks))
	 */
	private blockNameExists(name: string): boolean {
		// Use the manager's optimized method for efficient lookup
		// This avoids scanning files and uses in-memory registry data
		return this.plugin.syncManager.hasBlockName(name);
	}

	private showError(errorEl: HTMLElement | null, message: string): void {
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.addClass("synced-block-error-visible");
		}
	}

	private hideError(errorEl: HTMLElement | null): void {
		if (errorEl) {
			errorEl.removeClass("synced-block-error-visible");
			errorEl.textContent = "";
		}
	}

	private updateCreateButton(): void {
		if (this.createButton) {
			const nameValid = this.blockName.trim().length > 0;
			const contentValid = this.blockContent.trim().length > 0;
			this.createButton.setDisabled(!(nameValid && contentValid));
		}
	}

	private async createBlock(): Promise<void> {
		const blockId = generateSyncedBlockId();
		
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) {
			new Notice("Open a Markdown file in edit mode to create a synced block", 3000);
			return;
		}

		// Check if this block ID already exists in the file (defensive check, though unlikely with unique ID generation)
		try {
			const fileText = await this.app.vault.read(activeView.file);
			if (blockIdExistsInFile(fileText, blockId)) {
				// This should be extremely rare, but handle it gracefully
				new Notice(
					"A synced block with this ID already exists in this file. Please try again.",
					5000
				);
				return;
			}
		} catch (error) {
			// If we can't read the file, log error but allow creation to proceed
			// (file might be locked or have permission issues)
			console.error("[Synced Blocks] Error reading file to check for duplicates:", error);
		}

		const markdown = createSyncedBlockMarkdown(
			this.blockName.trim(),
			blockId,
			this.blockContent
		);

		const editor = activeView.editor;
		editor.replaceSelection(markdown);
		
		// Process the file to register the block
		// The registry will handle this automatically when the file is modified,
		// but we can also process it immediately
		if (this.plugin?.syncManager) {
			try {
				await this.plugin.syncManager.processFile(activeView.file);
			} catch (error) {
				// Log error for debugging
				console.error("[Synced Blocks] Error processing file after block creation:", error);
				// Show user-friendly error notification
				new Notice("Synced blocks: failed to register block. It will be registered automatically when the file is saved", 5000);
			}
		}

		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		
		// Clear validation timeout if pending
		if (this.nameValidationTimeout !== null) {
			window.clearTimeout(this.nameValidationTimeout);
			this.nameValidationTimeout = null;
		}
		
		this.blockName = "";
		this.blockContent = "";
		this.nameErrorEl = null;
		this.contentErrorEl = null;
		this.createButton = null;
	}
}

