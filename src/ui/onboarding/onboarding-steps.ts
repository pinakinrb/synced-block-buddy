import { loadAndRenderLottie } from "../../utils/lottie-loader";
import SyncedBlockBuddyPlugin from "../../main";

/**
 * Onboarding step definitions and content
 * Each step represents a screen in the onboarding flow
 */

export interface OnboardingStep {
	id: string;
	title: string;
	content: (containerEl: HTMLElement, plugin?: SyncedBlockBuddyPlugin) => void | Promise<void>;
	showNext?: boolean;
	showPrevious?: boolean;
	showSkip?: boolean;
	nextButtonText?: string;
	previousButtonText?: string;
	skipButtonText?: string;
}

/**
 * Creates the welcome step content
 * Uses golden ratio (1.618) for layout: animation ~61.8%, text ~38.2%
 */
async function createWelcomeStep(containerEl: HTMLElement, plugin?: SyncedBlockBuddyPlugin): Promise<void> {
	// Main container with golden ratio layout
	const mainContainer = containerEl.createDiv({
		attr: {
			style: "display: flex; flex-direction: column; width: 100%; min-height: 400px;"
		}
	});

	// Animation section - 61.8% of visual space (golden ratio)
	const animationSection = mainContainer.createDiv({
		attr: {
			style: "flex: 0 0 61.8%; display: flex; justify-content: center; align-items: center; min-height: 0; padding: 1em 0;"
		}
	});

	// Animation container with proper sizing
	const animationContainer = animationSection.createDiv({
		attr: {
			style: "width: 100%; height: 60%; max-width: 150px; max-height: 150px; display: flex; justify-content: center; align-items: center;"
		}
	});

	// Try to load and render Lottie animation
	// On mobile, the animation may not be available, so we always show fallback content
	let animationLoaded = false;
	if (plugin) {
		try {
			const animation = await loadAndRenderLottie(
				plugin,
				animationContainer,
				"assets/onboarding-welcome.json",
				{
					loop: true,
					autoplay: true,
					renderer: "svg"
				}
			);

			// Check if animation loaded successfully
			if (animation) {
				animationLoaded = true;
			}
		} catch {
			// Animation loading failed (expected on mobile)
			console.debug("[Synced Blocks] Animation not available, showing fallback content");
		}
	}

	// Show fallback content if animation didn't load (mobile or error case)
	if (!animationLoaded) {
		animationContainer.empty();
		// Create a simple icon or emoji as visual element
		const fallbackIcon = animationContainer.createDiv({
			attr: { 
				style: "font-size: 4em; text-align: center; margin: 0.5em 0; color: var(--text-accent);" 
			}
		});
		fallbackIcon.createEl("span", { text: "🔄" });
		
		animationContainer.createEl("p", {
			text: "Synced block buddy lets you create content once and reuse it across multiple notes.",
			attr: { style: "text-align: center; color: var(--text-muted); padding: 1em 2em; margin: 0;" }
		});
	}

	// Text section - 38.2% of visual space (golden ratio)
	const textSection = mainContainer.createDiv({
		attr: {
			style: "flex: 0 0 38.2%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 1.5em 2em; min-height: 0;"
		}
	});

	// Description text
	textSection.createEl("p", {
		text: "Synced block buddy lets you create content once and reuse it across multiple notes. When you update the content, all instances update automatically.",
		attr: {
			style: "text-align: center; line-height: 1.8; color: var(--text-normal); margin: 0; max-width: 500px;"
		}
	});
}

/**
 * Creates the core concept explanation step content
 */
function createConceptsStep(containerEl: HTMLElement, plugin?: SyncedBlockBuddyPlugin): void {
	containerEl.createEl("p", {
		text: "Synced block buddy works in two simple steps:",
		attr: { style: "margin-bottom: 1.5em; line-height: 1.6;" }
	});

	const stepsContainer = containerEl.createDiv({
		attr: { style: "margin: 1.5em 0;" }
	});

	// Step 1
	const step1 = stepsContainer.createDiv({
		attr: { style: "margin-bottom: 1.5em; padding: 1em; background: var(--background-secondary); border-radius: 4px;" }
	});
	step1.createEl("div", {
		text: "1. Create",
		attr: { style: "font-weight: 600; margin-bottom: 0.5em; color: var(--text-accent);" }
	});
	step1.createEl("div", {
		text: "To create a synced block, click the ribbon icon and select 'create new synced block' or run a command 'create new synced block' in the command palette",
		attr: { style: "color: var(--text-muted);" }
	});

	// Step 2
	const step2 = stepsContainer.createDiv({
		attr: { style: "padding: 1em; background: var(--background-secondary); border-radius: 4px;" }
	});
	step2.createEl("div", {
		text: "2. Insert",
		attr: { style: "font-weight: 600; margin-bottom: 0.5em; color: var(--text-accent);" }
	});
	step2.createEl("div", {
		text: "To insert a synced block, click the ribbon icon and select 'insert existing synced block' or run a command 'insert existing synced block' in the command palette",
		attr: { style: "color: var(--text-muted);" }
	});
}

/**
 * Creates the access methods step content
 */
function createAccessMethodsStep(containerEl: HTMLElement, plugin?: SyncedBlockBuddyPlugin): void {
	containerEl.createEl("p", {
		text: "You can access synced block buddy in four ways:",
		attr: { style: "margin-bottom: 1.5em; line-height: 1.6;" }
	});

	const methodsContainer = containerEl.createDiv({
		attr: { style: "margin: 1.5em 0;" }
	});

	// Method 1: Ribbon icon
	const method1 = methodsContainer.createDiv({
		attr: { style: "margin-bottom: 1em; padding: 1em; background: var(--background-secondary); border-radius: 4px;" }
	});
	method1.createEl("div", {
		text: "🔄 ribbon icon",
		attr: { style: "font-weight: 600; margin-bottom: 0.5em;" }
	});
	method1.createEl("div", {
		text: "Click the refresh icon in the left sidebar to open the main menu",
		attr: { style: "color: var(--text-muted); font-size: 0.9em;" }
	});

	// Method 2: Command palette
	const method2 = methodsContainer.createDiv({
		attr: { style: "margin-bottom: 1em; padding: 1em; background: var(--background-secondary); border-radius: 4px;" }
	});
	method2.createEl("div", {
		text: "⌘ command palette",
		attr: { style: "font-weight: 600; margin-bottom: 0.5em;" }
	});
	method2.createEl("div", {
		text: "Use 'create new synced block' or 'insert existing synced block' commands",
		attr: { style: "color: var(--text-muted); font-size: 0.9em;" }
	});

	// Method 3: Context menu
	const method3 = methodsContainer.createDiv({
		attr: { style: "margin-bottom: 1em; padding: 1em; background: var(--background-secondary); border-radius: 4px;" }
	});
	method3.createEl("div", {
		text: "🖱️ context menu",
		attr: { style: "font-weight: 600; margin-bottom: 0.5em;" }
	});
	method3.createEl("div", {
		text: "Right-click in the editor and select 'create new synced block'",
		attr: { style: "color: var(--text-muted); font-size: 0.9em;" }
	});

	// Method 4: Settings
	const method4 = methodsContainer.createDiv({
		attr: { style: "padding: 1em; background: var(--background-secondary); border-radius: 4px;" }
	});
	method4.createEl("div", {
		text: "⚙️ settings tab",
		attr: { style: "font-weight: 600; margin-bottom: 0.5em;" }
	});
		method4.createEl("div", {
			text: "Go to settings and synced block buddy to build index and manage blocks",
			attr: { style: "color: var(--text-muted); font-size: 0.9em;" }
		});
}


/**
 * Creates the completion step content
 */
function createCompletionStep(containerEl: HTMLElement, plugin?: SyncedBlockBuddyPlugin): void {
	containerEl.createEl("p", {
		text: "You're ready to start using synced block buddy!",
		attr: { style: "margin-bottom: 1.5em; line-height: 1.6; font-size: 1.1em;" }
	});

	const suggestionsContainer = containerEl.createDiv({
		attr: { style: "margin: 1.5em 0;" }
	});

	suggestionsContainer.createEl("div", {
		text: "Quick start:",
		attr: { style: "font-weight: 600; margin-bottom: 0.75em; color: var(--text-accent);" }
	});

	const suggestionsList = suggestionsContainer.createEl("ul", {
		attr: { style: "margin: 0.5em 0; padding-left: 1.5em; color: var(--text-muted); line-height: 1.8;" }
	});
	suggestionsList.createEl("li", { text: "Create your first synced block" });
	suggestionsList.createEl("li", { text: "Build index to find existing blocks" });
	suggestionsList.createEl("li", { text: "Explore the main menu from the ribbon icon" });

	// Tips section
	const tipsContainer = containerEl.createDiv({
		attr: { style: "margin-top: 1.5em; padding: 1em; background: var(--background-modifier-border); border-radius: 4px; border-left: 3px solid var(--text-accent);" }
	});
	tipsContainer.createEl("div", {
		text: "💡 tips",
		attr: { style: "font-weight: 600; margin-bottom: 0.5em;" }
	});
	const tipsList = tipsContainer.createEl("ul", {
		attr: { style: "margin: 0.5em 0; padding-left: 1.5em; color: var(--text-muted);" }
	});
	tipsList.createEl("li", { text: "Blocks sync automatically when you edit them" });
	tipsList.createEl("li", { text: "Each block has a unique ID" });
	tipsList.createEl("li", { text: "Block names must be unique" });
	tipsList.createEl("li", { text: "Use build index to scan all files and find existing synced blocks in your vault" });
}

/**
 * All onboarding steps in order
 */
export function getOnboardingSteps(plugin: SyncedBlockBuddyPlugin): OnboardingStep[] {
	return [
		{
			id: "welcome",
			title: "Welcome to Synced block buddy",
			content: (el) => createWelcomeStep(el, plugin),
			showNext: true,
			showSkip: true,
			nextButtonText: "Start tutorial",
		},
		{
			id: "concepts",
			title: "How Synced block buddy works",
			content: (el) => createConceptsStep(el, plugin),
			showNext: true,
			showPrevious: true,
			showSkip: true,
		},
		{
			id: "access",
			title: "How to use Synced block buddy",
			content: (el) => createAccessMethodsStep(el, plugin),
			showNext: true,
			showPrevious: true,
			showSkip: true,
		},
		{
			id: "completion",
			title: "You're All Set!",
			content: (el) => createCompletionStep(el, plugin),
			showPrevious: true,
			nextButtonText: "Get started",
		},
	];
}

