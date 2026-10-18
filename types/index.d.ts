// A VS Code color theme, as its .json file holds it.
export type VsCodeTheme = {
	name?: string;
	type?: 'dark' | 'light' | 'hc-dark' | 'hc-light';
	colors?: Record<string, string>;
	tokenColors?: unknown[];
	[key: string]: unknown;
};

// What /skin-code is set to: 'auto' follows the active skins skin, 'off' leaves code blocks
// to skins or the app, and any other value names a skin's theme pair or one theme.
export type Mode = string;

// What a code block shows besides the code: the header bar and the line numbers.
export type CardOptions = { header: boolean; numbers: boolean };

// How a code block is drawn on the desktop: rows of selectable text, or a card drawn in the
// theme's code font.
export type Style = 'text' | 'card';

// Which themes /skin-code gallery shows: every one, or those of one lightness.
export type GalleryFilter = 'all' | 'dark' | 'light';

// One theme's block in /skin-code gallery, worked out by the command so the pane only draws:
// its names, its colours and the sample's lines as runs of one style.
export type GalleryRun = { text: string; color: string; italic: boolean; bold: boolean };

export type GalleryCard = {
	theme: string;
	name: string;
	caption: string;
	isLight: boolean;
	foreground: string;
	background: string;
	gutter: string;
	lines: GalleryRun[][];
};

// What the gallery pane draws: the themes asked for, the one drawing now, and whether
// Claude Code is drawing light, which the terminal's pane filters by.
export type Gallery = {
	filter: GalleryFilter;
	// The page of blocks shown, from 0.
	page: number;
	current: string;
	light: boolean;
	cards: GalleryCard[];
};

// A theme for each lightness: [dark, light].
export type ThemePair = readonly [dark: string, light: string];

// A theme added after load, and who added it: 'user' through /skin-code add, else the plugin.
export type AddedTheme = { theme: VsCodeTheme; by: string };

// `$.skinCode.addTheme`'s argument. `skin` makes the theme that skin's code theme, for
// `lightness` ('dark' unless the theme says light).
export type AddThemeArgs = {
	theme: VsCodeTheme;
	skin?: string;
	lightness?: 'dark' | 'light';
};

// `$.skinCode.draws`'s argument: a reply's whole text.
export type DrawsArgs = { text: string };

// skins' markdown, when skins is installed: skin-code draws a reply's prose with it.
export type SkinsMarkdownArgs = {
	surface: 'terminal' | 'desktop' | 'vscode' | 'mobile';
	text: string;
	columns: number;
};

declare module 'claude-code' {
	interface EngineInterface {
		skinCode: {
			// Adds a VS Code theme for this session and resolves to the name it is listed under.
			addTheme: (args: AddThemeArgs) => Promise<string>;
			// Every theme skin-code can draw with.
			themes: (args?: Record<string, never>) => Promise<string[]>;
			// Whether skin-code draws this reply: it is on, and the reply holds a fence it draws.
			// Another mod that draws replies leaves these to skin-code.
			draws: (args: DrawsArgs) => Promise<boolean>;
		};
		skins: {
			markdown: (args: SkinsMarkdownArgs) => Promise<RenderElement | undefined>;
		};
	}

	interface PluginState {
		'skin-code': {
			mode: Mode;
			added: Record<string, AddedTheme>;
			pairs: Record<string, ThemePair>;
			options: CardOptions;
			style: Style;
			// The block whose copy control shows its checkmark: `<message id>:<block>`, or ''.
			copied: string;
			gallery: Gallery;
		};
	}
}
