import { App, Modal, Setting } from "obsidian";
import SyncedBlockBuddyPlugin from "../../main";
import { getOnboardingSteps, OnboardingStep } from "../onboarding/onboarding-steps";
import { OnboardingManager } from "../../core/onboarding-manager";
import { MainSyncedBlocksModal } from "./main-synced-blocks-modal";

/**
 * Multi-step onboarding modal that guides users through the plugin features
 */
export class OnboardingModal extends Modal {
	private plugin: SyncedBlockBuddyPlugin;
	private steps: OnboardingStep[];
	private currentStepIndex: number = 0;
	private dontShowAgain: boolean = false;

	constructor(app: App, plugin: SyncedBlockBuddyPlugin) {
		super(app);
		this.plugin = plugin;
		this.steps = getOnboardingSteps(plugin);
	}

	onOpen() {
		this.renderStep();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Renders the current step
	 */
	private renderStep(): void {
		const { contentEl } = this;
		contentEl.empty();

		const currentStep = this.steps[this.currentStepIndex];
		if (!currentStep) {
			this.close();
			return;
		}

		// Progress indicator
		this.renderProgressIndicator(contentEl);

		// Step title
		contentEl.createEl("h2", {
			text: currentStep.title,
			attr: { style: "margin-top: 0.5em;" }
		});

		// Step content
		const contentContainer = contentEl.createDiv({
			attr: { style: "margin: 1.5em 0; min-height: 400px; width: 100%;" }
		});
		// Handle both sync and async content functions
		const contentResult = currentStep.content(contentContainer, this.plugin);
		if (contentResult instanceof Promise) {
			contentResult.catch((error) => {
				console.error("[Synced Blocks] Error rendering onboarding step content:", error);
			});
		}

		// "Don't show again" checkbox (only on first step)
		if (this.currentStepIndex === 0) {
			const checkboxContainer = contentEl.createDiv({
				attr: { style: "margin: 1em 0;" }
			});
			const checkbox = checkboxContainer.createEl("input", {
				type: "checkbox",
				attr: { id: "dont-show-again" }
			});
			checkbox.addEventListener("change", (e) => {
				this.dontShowAgain = (e.target as HTMLInputElement).checked;
			});
			checkboxContainer.createEl("label", {
				text: "Don't show this tutorial again",
				attr: {
					for: "dont-show-again",
					style: "margin-left: 0.5em; color: var(--text-muted); cursor: pointer;"
				}
			});
		}

		// Navigation buttons
		this.renderNavigationButtons(contentEl, currentStep);
	}

	/**
	 * Renders the progress indicator
	 */
	private renderProgressIndicator(containerEl: HTMLElement): void {
		const progressContainer = containerEl.createDiv({
			attr: { style: "margin-bottom: 1em; display: flex; align-items: center; gap: 0.5em;" }
		});

		progressContainer.createEl("span", {
			text: `${this.currentStepIndex + 1} of ${this.steps.length}`,
			attr: { style: "font-size: 0.9em; color: var(--text-muted); min-width: 60px;" }
		});

		const progressBar = progressContainer.createDiv({
			attr: {
				style: `flex: 1; height: 4px; background: var(--background-modifier-border); border-radius: 2px; overflow: hidden;`
			}
		});

		progressBar.createDiv({
			attr: {
				style: `width: ${((this.currentStepIndex + 1) / this.steps.length) * 100}%; height: 100%; background: var(--text-accent); transition: width 0.3s ease;`
			}
		});
	}

	/**
	 * Renders navigation buttons
	 */
	private renderNavigationButtons(containerEl: HTMLElement, step: OnboardingStep): void {
		const buttonContainer = containerEl.createDiv({
			attr: { style: "display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-top: 2em; gap: 1em;" }
		});

		// Left side: Previous
		const leftButtons = buttonContainer.createDiv({
			attr: { style: "display: flex; gap: 0.5em; justify-self: start;" }
		});

		if (step.showPrevious) {
			new Setting(leftButtons)
				.addButton((button) => {
					button.setButtonText(step.previousButtonText || "Previous")
						.onClick(() => {
							this.goToPreviousStep();
						});
				});
		}

		// Center: Skip button (only if both Previous and Skip are shown)
		if (step.showSkip && step.showPrevious) {
			const centerButtons = buttonContainer.createDiv({
				attr: { style: "display: flex; justify-self: center;" }
			});
			new Setting(centerButtons)
				.addButton((button) => {
					button.setButtonText(step.skipButtonText || "Skip")
						.onClick(() => {
							this.handleSkip();
						});
				});
		} else if (step.showSkip) {
			// If only Skip (no Previous), add it to left side
			new Setting(leftButtons)
				.addButton((button) => {
					button.setButtonText(step.skipButtonText || "Skip")
						.onClick(() => {
							this.handleSkip();
						});
				});
		}

		// Right side: Next/Get Started
		const rightButtons = buttonContainer.createDiv({
			attr: { style: "display: flex; justify-self: end;" }
		});

		if (step.showNext !== false) {
			new Setting(rightButtons)
				.addButton((button) => {
					const isLastStep = this.currentStepIndex === this.steps.length - 1;
					button.setButtonText(step.nextButtonText || (isLastStep ? "Get Started" : "Next"))
						.setCta()
						.onClick(() => {
							if (isLastStep) {
								this.handleCompletion();
							} else {
								this.goToNextStep();
							}
						});
				});
		}
	}

	/**
	 * Navigates to the next step
	 */
	private goToNextStep(): void {
		if (this.currentStepIndex < this.steps.length - 1) {
			this.currentStepIndex++;
			this.renderStep();
		}
	}

	/**
	 * Navigates to the previous step
	 */
	private goToPreviousStep(): void {
		if (this.currentStepIndex > 0) {
			this.currentStepIndex--;
			this.renderStep();
		}
	}

	/**
	 * Handles skip action
	 */
	private handleSkip(): void {
		if (this.dontShowAgain) {
			void OnboardingManager.completeOnboarding(this.plugin);
		}
		this.close();
	}

	/**
	 * Handles completion of onboarding
	 */
	private handleCompletion(): void {
		// Mark onboarding as completed
		void OnboardingManager.completeOnboarding(this.plugin);

		// Close onboarding modal
		this.close();

		// Optionally open the main modal to help user get started
		// Small delay to let the onboarding modal close smoothly
		setTimeout(() => {
			new MainSyncedBlocksModal(this.app, this.plugin).open();
		}, 300);
	}
}

