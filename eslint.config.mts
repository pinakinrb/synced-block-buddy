import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"esbuild.config.mjs",
			"eslint.config.js",
			"version-bump.mjs",
			"versions.json",
			"main.js",
		],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: __dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...(obsidianmd.configs?.recommended || []) as unknown as Parameters<typeof tseslint.config>[number][],
	{
		plugins: {
			obsidianmd,
		},
		rules: {
			"obsidianmd/ui/sentence-case": [
				"error",
				{
					brands: [],
					ignoreWords: [],
				},
			],
		},
	},
);
