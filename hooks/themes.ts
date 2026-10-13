// Which code theme each skins skin gets, dark first, then light. A skin with no light
// counterpart keeps its dark theme: a code card carries its own background on the desktop.
// Neon Bunny is one of those.

export type ThemePair = readonly [dark: string, light: string];

export const DEFAULT_PAIR: ThemePair = ['neon-bunny', 'neon-bunny'];

export const SKIN_THEMES: Readonly<Record<string, ThemePair>> = {
	'neon-bunny': DEFAULT_PAIR,
	'neon-bunny-carrot': ['neon-bunny-carrot', 'neon-bunny-carrot'],
	ayu: ['ayu-dark', 'ayu-light'],
	catppuccin: ['catppuccin-mocha', 'catppuccin-latte'],
	dracula: ['dracula', 'dracula'],
	everforest: ['everforest-dark', 'everforest-light'],
	github: ['github-dark', 'github-light'],
	gruvbox: ['gruvbox-dark-medium', 'gruvbox-light-medium'],
	kanagawa: ['kanagawa-wave', 'kanagawa-lotus'],
	mono: ['min-dark', 'min-light'],
	'night-owl': ['night-owl', 'night-owl-light'],
	noir: ['vitesse-black', 'vitesse-light'],
	nord: ['nord', 'nord'],
	'one-dark': ['one-dark-pro', 'one-light'],
	'rose-pine': ['rose-pine', 'rose-pine-dawn'],
	solarized: ['solarized-dark', 'solarized-light'],
	'tokyo-night': ['tokyo-night', 'tokyo-night'],
};

// On the terminal the code sits on the terminal's own background, so a theme of the wrong
// lightness gives way to one that reads there.
export const TERMINAL_FALLBACK: ThemePair = ['github-dark', 'github-light'];
