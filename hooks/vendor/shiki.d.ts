// The bundled highlighter (built by build/build.mjs): Shiki with VS Code's grammars and themes.

export type ThemedToken = {
	content: string;
	color?: string;
	fontStyle?: number;
};

import type { VsCodeTheme } from '../../types';

export type { VsCodeTheme };

export function themeNames(): string[];
export function hasTheme(name: string): boolean;
export function displayNameOf(name: string): string;
export function parseTheme(text: string): VsCodeTheme;
export function addTheme(theme: VsCodeTheme): string;
export function colorsOf(theme: string): {
	background: string;
	foreground: string;
	gutter: string;
	isLight: boolean;
};
export function resolveLang(lang: string): string | undefined;
export function tokenize(
	code: string,
	lang: string,
	theme: string,
): ThemedToken[][];
