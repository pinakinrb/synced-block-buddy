import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SyncedBlockBuddySettings,
	SyncedBlocksSettingTab,
} from "./settings";
import { registerContextMenu } from "./ui/context-menu";
import { MainSyncedBlocksModal } from "./ui/modals/main-synced-blocks-modal";
import { CreateSyncedBlockConfigArea } from "./ui/modals/create-synced-block-config-area-modal";
import { InsertSyncedBlockModal } from "./ui/modals/insert-synced-block-modal";
import { SyncedBlockManager } from "./core/synced-block-manager";
import { OnboardingManager } from "./core/onboarding-manager";

export default class SyncedBlockBuddyPlugin extends Plugin {
	settings: SyncedBlockBuddySettings;
	syncManager: SyncedBlockManager;

	async onload() {
		await this.loadSettings();

		// Initialize synced block manager
		this.syncManager = new SyncedBlockManager(this.app, this);
		await this.syncManager.initialize();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon("refresh-ccw", "Synced Block Buddy", (evt: MouseEvent) => {
			new MainSyncedBlocksModal(this.app, this).open();
		});

		// Register context menu items
		registerContextMenu(this);

		// Register commands
		this.addCommand({
			id: "create-new-synced-block",
			name: "Create new synced block",
			callback: () => {
				new CreateSyncedBlockConfigArea(this.app, this).open();
			},
		});

		this.addCommand({
			id: "insert-existing-synced-block",
			name: "Insert existing synced block",
			callback: () => {
				new InsertSyncedBlockModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "show-onboarding-tutorial",
			name: "Show onboarding tutorial",
			callback: () => {
				OnboardingManager.showOnboarding(this);
			},
		});

		// Add settings tab
		this.addSettingTab(new SyncedBlocksSettingTab(this.app, this));

		// Check and show onboarding if needed
		void OnboardingManager.checkAndShowOnboarding(this);
	}

	onunload(): void {
		// Clean up sync manager
		if (this.syncManager) {
			void this.syncManager.unload();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<SyncedBlockBuddySettings>);
	}

	async saveSettings() {
		try {
			await this.saveData(this.settings);
		} catch (error) {
			// Log error for debugging
			console.error("[Synced Blocks] Error saving settings:", error);
			// Re-throw so caller can handle it if needed
			throw error;
		}
	}
}
