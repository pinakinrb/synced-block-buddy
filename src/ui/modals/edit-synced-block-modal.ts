import { App, ButtonComponent, Modal, Setting, TFile } from "obsidian";
import SyncedBlockBuddyPlugin from "../../main";
import { SyncedBlockEntry } from "../../types/synced-block-registry";
import { parseBlocksFromFile, patchFileText } from "../../utils/file-patch";

export class EditSyncedBlockModal extends Modal {
	private plugin: SyncedBlockBuddyPlugin;
	private blockEntry: SyncedBlockEntry;
	private blockName: string;
	private blockContent: string;
	private nameErrorEl: HTMLElement | null = null;
	private saveButton: ButtonComponent | null = null;
	private nameValidationTimeout: number | null = null;
	private readonly VALIDATION_DEBOUNCE_MS = 300;

	constructor(app: App, plugin: SyncedBlockBuddyPlugin, blockEntry: SyncedBlockEntry) {
		super(app);
		this.plugin = plugin;
		this.blockEntry = blockEntry;
		this.blockName = blockEntry.blockName;
		// Use canonical content
		this.blockContent = blockEntry.canonicalContent;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Set modal title
		contentEl.createEl("h2", { text: "Edit synced block" });

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
					this.updateSaveButton();
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
					this.updateSaveButton();
				});
			textArea.inputEl.rows = 8;
		});

		// Save button
		const buttonSetting = new Setting(contentEl);
		buttonSetting.addButton((button) => {
			this.saveButton = button;
			button.setButtonText("Save").setCta().onClick(async () => {
				if (this.validateName()) {
					await this.saveBlock();
				}
			});
			this.updateSaveButton();
		});

		// Cancel button
		buttonSetting.addButton((button) => {
			button.setButtonText("Cancel").onClick(() => {
				this.close();
			});
		});
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

		// Allow same name (editing existing block)
		if (name.toLowerCase() === this.blockEntry.blockName.toLowerCase()) {
			this.hideError(this.nameErrorEl);
			return true;
		}

		// Check if block name already exists (only if changed)
		// Use optimized registry lookup instead of scanning all blocks
		const exists = this.blockNameExists(name);
		if (exists) {
			this.showError(this.nameErrorEl, "Block name already exists. Please choose a unique name.");
			return false;
		}

		this.hideError(this.nameErrorEl);
		return true;
	}

	/**
	 * Checks if a block name already exists using optimized registry lookup
	 * Excludes the current block being edited from the check
	 */
	private blockNameExists(name: string): boolean {
		// Use optimized registry lookup
		const normalizedName = name.toLowerCase();
		const allBlocks = this.plugin.syncManager.getAllBlocks();
		
		// Check if any other block (not this one) has the same name
		return allBlocks.some(
			(block) => 
				block.blockId !== this.blockEntry.blockId && 
				block.blockName.toLowerCase() === normalizedName
		);
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

	private updateSaveButton(): void {
		if (this.saveButton) {
			const nameValid = this.blockName.trim().length > 0;
			this.saveButton.setDisabled(!nameValid);
		}
	}

	private async saveBlock(): Promise<void> {
		try {
		// Find any location to update (all locations are valid since we delete entries instead of tombstoning)
		const filePath = Object.keys(this.blockEntry.locations)[0];

			if (!filePath) {
				throw new Error("No valid location found for block");
			}

			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				throw new Error("File not found");
			}

			// Read file and parse blocks
			const fileContent = await this.app.vault.read(file);
			const blocks = parseBlocksFromFile(fileContent);
			const block = blocks.find((b) => b.blockId === this.blockEntry.blockId);

			if (!block) {
				throw new Error("Block not found in file");
			}

			// Patch the file
			const newFileContent = patchFileText(
				fileContent,
				blocks,
				[{ blockId: this.blockEntry.blockId, newContent: this.blockContent }]
			);

			// Write the updated content
			await this.app.vault.modify(file, newFileContent);

			// The registry will be updated automatically via the file modify event
			this.close();
		} catch (error) {
			// Log error for debugging
			console.error("[Synced Blocks] Error saving block:", error);
			// Show user-friendly error message
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.showError(this.nameErrorEl, `Failed to save block: ${errorMessage}. Please try again.`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		
		// Clear validation timeout if pending
		if (this.nameValidationTimeout !== null) {
			window.clearTimeout(this.nameValidationTimeout);
			this.nameValidationTimeout = null;
		}
		
		this.nameErrorEl = null;
		this.saveButton = null;
	}
}

