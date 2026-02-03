import { OnboardingModal } from "../ui/modals/onboarding-modal";
import SyncedBlockBuddyPlugin from "../main";

/**
 * Manages onboarding flow state and logic
 */
export class OnboardingManager {
	/**
	 * Checks if user should see onboarding and shows it if needed
	 * @param plugin The plugin instance
	 */
	static async checkAndShowOnboarding(plugin: SyncedBlockBuddyPlugin): Promise<void> {
		// Wait a bit for Obsidian to finish loading
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Check if user has already completed onboarding
		if (plugin.settings.hasCompletedOnboarding) {
			return;
		}

		// Show onboarding
		this.showOnboarding(plugin);
	}

	/**
	 * Shows the onboarding modal
	 * @param plugin The plugin instance
	 */
	static showOnboarding(plugin: SyncedBlockBuddyPlugin): void {
		new OnboardingModal(plugin.app, plugin).open();
	}

	/**
	 * Marks onboarding as completed and saves settings
	 * @param plugin The plugin instance
	 */
	static async completeOnboarding(plugin: SyncedBlockBuddyPlugin): Promise<void> {
		plugin.settings.hasCompletedOnboarding = true;
		await plugin.saveSettings();
	}

	/**
	 * Resets onboarding (for testing or re-showing)
	 * @param plugin The plugin instance
	 */
	static async resetOnboarding(plugin: SyncedBlockBuddyPlugin): Promise<void> {
		plugin.settings.hasCompletedOnboarding = false;
		await plugin.saveSettings();
	}
}

