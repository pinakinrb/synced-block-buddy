# Synced Block Buddy

Synced Block Buddy is a plugin for Obsidian that allows you to sync blocks between your notes. Create a block once, reference it in multiple places, and when you update it in one location, all instances stay synchronized automatically.

## Features

- **Create synced blocks**: Define reusable content blocks that can be shared across multiple notes
- **Automatic synchronization**: Changes to a synced block in one location automatically update all other instances
- **Easy insertion**: Quickly insert existing synced blocks into any note
- **Block management**: View and manage all your synced blocks from a central location
- **Index building**: Scan your vault to rebuild the synced blocks registry
- **Interactive tutorial**: Built-in onboarding to help you get started
- **Cross-platform**: Works on desktop and mobile devices

## Installation

### From Obsidian

1. Open **Settings → Community plugins**
2. Make sure Safe mode is **off**
3. Click **Browse** and search for "Synced Block Buddy"
4. Click **Install**
5. After installation, click **Enable** to activate the plugin

### Manual Installation

1. Download the latest release from the [Releases page](https://github.com/pinakinrb/synced-block-buddy/releases)
2. Extract the files and place them in your vault's `.obsidian/plugins/synced-blocks/` folder:
   - `main.js`
   - `manifest.json`
   - `styles.css` (if present)
3. Reload Obsidian
4. Enable the plugin in **Settings → Community plugins**

## Usage

### Creating a New Synced Block

1. Open the command palette (`Ctrl+P` / `Cmd+P`)
2. Run **"Create new synced block"**
3. Enter a name for your block
4. Add the content you want to sync
5. Click **Create**

The synced block will be inserted at your cursor position in the format:
```
%% synced-block-start {"id":"unique-id", "name":"Your Block Name"} %%

Your content here

%% synced-block-end %%
```

### Inserting an Existing Synced Block

1. Open the command palette (`Ctrl+P` / `Cmd+P`)
2. Run **"Insert existing synced block"**
3. Select the block you want to insert from the list
4. The block will be inserted at your cursor position

### Managing Synced Blocks

- Click the **refresh icon** in the left ribbon to open the main synced blocks manager
- View all your synced blocks and their locations
- See which files contain each synced block

### Context Menu

Right-click on a synced block in your notes to access quick actions:
- View block details
- Navigate to other instances of the block

## Commands

The plugin provides the following commands (accessible via `Ctrl+P` / `Cmd+P`):

- **Create new synced block**: Create a new synced block with a name and content
- **Insert existing synced block**: Insert an existing synced block into the current note
- **Show onboarding tutorial**: Re-open the interactive tutorial

## Settings

Access plugin settings via **Settings → Synced Block Buddy**:

- **Build Index**: Scan all files in your vault and rebuild the synced blocks registry. Useful if you've manually edited synced blocks or imported notes with synced blocks.
- **Show tutorial again**: Re-open the onboarding tutorial to learn how to use the plugin

## How It Works

Synced blocks use Obsidian's comment syntax to mark block boundaries. Each synced block has:
- A unique ID that identifies the block across all instances
- A name for easy identification
- Content that is synchronized across all instances

When you edit a synced block in one location, the plugin automatically updates all other instances of that block throughout your vault.

## Requirements

- Obsidian version 0.15.0 or higher
- Works on desktop and mobile

## Support

- **Repository**: [GitHub](https://github.com/pinakinrb/synced-block-buddy)
- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/pinakinrb/synced-block-buddy/issues)
- **Author**: [Pinakin](https://b50.dev)
- **Support the project**: [Buy Me a Coffee](https://buymeacoffee.com/pinakin)

## Development

If you want to contribute or build from source:

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode with watch
npm run dev

# Lint code
npm run lint
```

## License

This project is licensed under the 0-BSD license.

## Changelog

### 1.5.0
- Prepare for next release

### 1.4
- Improve sentence case consistency and simplify UI text

### 1.3
- Fix async/await issues, sentence case, and ESLint configuration

### 1.2
- Add onboarding tutorial

### 1.1
- Fix description alignment with community plugin listing

### 1.0.0
- Initial release
- Create and manage synced blocks
- Automatic synchronization
- Interactive onboarding tutorial
- Block index building
- Cross-platform support
