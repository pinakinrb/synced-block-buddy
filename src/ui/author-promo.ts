/**
 * Creates an author promotion section with about me and Buy Me a Coffee link
 * @param container - The container element to append the promo to
 * @param mascotPath - Optional path to the mascot image to display on the left
 */
export function createAuthorPromo(container: HTMLElement, mascotPath?: string): void {
	const promoContainer = container.createDiv("synced-blocks-author-promo");
	
		// Add mascot on the left if provided
		if (mascotPath) {
			const mascotContainer = promoContainer.createDiv("synced-blocks-mascot-inline");
			mascotContainer.createEl("img", {
				attr: {
					src: mascotPath,
					alt: "Synced Block Buddy Mascot"
				}
			});
		}
	
	// Content section (about + links)
	const contentSection = promoContainer.createDiv("synced-blocks-author-content");
	
	// About section
	const aboutSection = contentSection.createDiv("synced-blocks-author-about");
	aboutSection.createEl("h3", { text: "About the author" });
	aboutSection.createEl("p", { 
		text: "Hello, I am Pinakin, the creator of Synced Block Buddy. I build tools to make your Obsidian workflow more efficient and enjoyable."
	});
	
	// Links section
	const linksSection = contentSection.createDiv("synced-blocks-author-links");
	
	// Website link
	const websiteLink = linksSection.createEl("a", {
		text: "Visit my website",
		href: "https://b50.dev",
		attr: {
			target: "_blank",
			rel: "noopener noreferrer"
		}
	});
	websiteLink.addClass("synced-blocks-author-link");
	
	// Buy Me a Coffee link
	const coffeeLink = linksSection.createEl("a", {
		text: "☕ buy me a coffee",
		href: "https://buymeacoffee.com/pinakin",
		attr: {
			target: "_blank",
			rel: "noopener noreferrer"
		}
	});
	coffeeLink.addClass("synced-blocks-author-link");
	coffeeLink.addClass("synced-blocks-coffee-link");
}

