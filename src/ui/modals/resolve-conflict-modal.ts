import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import SyncedBlockBuddyPlugin from "../../main";
import { SyncedBlockEntry } from "../../types/synced-block-registry";

/**
 * Modal for resolving conflicts in synced blocks
 * Allows users to choose which variant to keep as canonical content
 */
export class ResolveConflictModal extends Modal {
	private plugin: SyncedBlockBuddyPlugin;
	private blockEntry: SyncedBlockEntry;
	private selectedVariantHash: string | null = null;
	private resolveButton: ButtonComponent | null = null;

	constructor(app: App, plugin: SyncedBlockBuddyPlugin, blockEntry: SyncedBlockEntry) {
		super(app);
		this.plugin = plugin;
		this.blockEntry = blockEntry;
		
		// Pre-select first variant if available
		if (blockEntry.conflict && blockEntry.conflict.variants.length > 0) {
			const firstVariant = blockEntry.conflict.variants[0];
			if (firstVariant) {
				this.selectedVariantHash = firstVariant.hash;
			}
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.blockEntry.conflict) {
			contentEl.createEl("p", {
				text: "This block has no conflicts to resolve.",
				attr: { style: "color: var(--text-muted);" }
			});
			return;
		}

		const conflict = this.blockEntry.conflict;

		// Set modal title
		contentEl.createEl("h2", { text: "Resolve conflict" });

		// Block information
		contentEl.createEl("p", {
			text: `Block: ${this.blockEntry.blockName}`,
			attr: { style: "font-weight: bold; margin-bottom: 0.5em;" }
		});
		contentEl.createEl("p", {
			text: `ID: ${this.blockEntry.blockId}`,
			attr: { style: "color: var(--text-muted); font-size: 0.9em; margin-bottom: 1em;" }
		});

		contentEl.createEl("p", {
			text: `This block has ${conflict.variants.length} conflicting variant(s). Choose which version to keep:`,
			attr: { style: "margin-bottom: 1em;" }
		});

		// Create container for variants
		const variantsContainer = contentEl.createDiv({
			cls: "conflict-variants-container",
			attr: { style: "margin-bottom: 1.5em;" }
		});

		// Display each variant
		for (const variant of conflict.variants) {
			const variantDiv = variantsContainer.createDiv({
				cls: "conflict-variant",
				attr: {
					"data-variant-hash": variant.hash,
					style: `
						border: 1px solid var(--background-modifier-border);
						border-radius: 4px;
						padding: 1em;
						margin-bottom: 1em;
						cursor: pointer;
						transition: background-color 0.2s;
					`
				}
			});

			// Highlight selected variant
			if (variant.hash === this.selectedVariantHash) {
				variantDiv.addClass("conflict-variant-selected");
			}

			// Variant header
			const variantHeader = variantDiv.createDiv({
				attr: { style: "display: flex; align-items: center; margin-bottom: 0.5em;" }
			});

			// Radio button (visual)
			const radioSpan = variantHeader.createEl("span", {
				text: variant.hash === this.selectedVariantHash ? "●" : "○",
				cls: "conflict-variant-radio"
			});
			if (variant.hash === this.selectedVariantHash) {
				radioSpan.addClass("conflict-variant-selected");
			}

			// File path or label
			variantHeader.createEl("strong", {
				text: variant.filePath === "canonical" ? "Canonical (current)" : this.formatFilePath(variant.filePath),
				attr: { style: "flex: 1;" }
			});

			// Content preview (truncated)
			variantDiv.createEl("div", {
				text: this.truncateContent(variant.content),
				attr: {
					style: `
						color: var(--text-muted);
						font-size: 0.9em;
						margin-top: 0.5em;
						white-space: pre-wrap;
						max-height: 100px;
						overflow: hidden;
					`
				}
			});

			// Click handler to select variant
			variantDiv.onclick = () => {
				this.selectedVariantHash = variant.hash;
				this.updateVariantSelection(variantsContainer);
				this.updateResolveButton();
			};
		}

		// Resolve button
		const buttonSetting = new Setting(contentEl);
		buttonSetting.addButton((button) => {
			this.resolveButton = button;
			button.setButtonText("Resolve conflict")
				.setCta()
				.onClick(async () => {
					await this.resolveConflict();
				});
			this.updateResolveButton();
		});

		// Cancel button
		buttonSetting.addButton((button) => {
			button.setButtonText("Cancel")
				.onClick(() => {
					this.close();
				});
		});
	}

	private formatFilePath(filePath: string): string {
		// Extract just the filename for display
		const parts = filePath.split("/");
		const lastPart = parts[parts.length - 1];
		return lastPart !== undefined ? lastPart : filePath;
	}

	private truncateContent(content: string, maxLength: number = 150): string {
		if (content.length <= maxLength) {
			return content;
		}
		return content.substring(0, maxLength) + "...";
	}

	private updateVariantSelection(container: HTMLElement): void {
		const variants = container.querySelectorAll(".conflict-variant");
		variants.forEach((variantEl) => {
			const variantDiv = variantEl as HTMLElement;
			const radio = variantDiv.querySelector(".conflict-variant-radio");
			const variantHash = variantDiv.dataset.variantHash;
			const isSelected = variantHash !== undefined && variantHash === this.selectedVariantHash;

			if (isSelected) {
				variantDiv.addClass("conflict-variant-selected");
				if (radio) {
					radio.textContent = "●";
					radio.addClass("conflict-variant-selected");
				}
			} else {
				variantDiv.removeClass("conflict-variant-selected");
				if (radio) {
					radio.textContent = "○";
					radio.removeClass("conflict-variant-selected");
				}
			}
		});
	}

	private updateResolveButton(): void {
		if (this.resolveButton) {
			this.resolveButton.setDisabled(this.selectedVariantHash === null);
		}
	}

	private async resolveConflict(): Promise<void> {
		if (!this.selectedVariantHash || !this.blockEntry.conflict) {
			return;
		}

		try {
			const success = await this.plugin.syncManager.resolveConflict(
				this.blockEntry.blockId,
				this.selectedVariantHash
			);

			if (success) {
				new Notice(`Conflict resolved successfully. All instances will sync to the chosen version.`, 5000);
				this.close();
			} else {
				new Notice("Failed to resolve conflict. The variant may no longer exist.", 5000);
			}
		} catch (error) {
			console.error("[Synced Blocks] Error resolving conflict:", error);
			new Notice("An error occurred while resolving the conflict. Please try again.", 5000);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.selectedVariantHash = null;
		this.resolveButton = null;
	}
}

