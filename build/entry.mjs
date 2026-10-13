import { createHighlighterCoreSync } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import { langs } from './langs.mjs';
import { themes as loaded } from './themes.mjs';

// VS Code wraps a .php file in `text.html.php`; Shiki's php grammar starts at `source.php`.
// Each theme rule scoped under the wrapper gets a twin under the grammar's own root.
const PHP_WRAPPER = /(^|\s)text\.html\.php(?=\s|$)/;

function withPhpTwins(theme) {
	const tokenColors = (theme.tokenColors ?? theme.settings ?? []).map(
		(rule) => {
			if (rule.scope === undefined) {
				return rule;
			}

			const scopes = (
				Array.isArray(rule.scope) ? rule.scope : rule.scope.split(',')
			).map((scope) => scope.trim());
			const twins = scopes
				.filter((scope) => PHP_WRAPPER.test(scope))
				.map((scope) =>
					scope.replace(new RegExp(PHP_WRAPPER, 'g'), '$1source.php'),
				);

			return twins.length === 0
				? rule
				: { ...rule, scope: [...scopes, ...twins] };
		},
	);

	return { ...theme, tokenColors };
}

const themes = loaded.map(withPhpTwins);
const byName = new Map(themes.map((theme) => [theme.name, theme]));

// Every theme loaded: the bundled ones and those added since.
export const themeNames = () => [...byName.keys()].sort();

export const hasTheme = (name) => byName.has(name);

// The name a theme goes by in prose (`One Dark Pro`), else its id.
export const displayNameOf = (name) => byName.get(name)?.displayName ?? name;

// A VS Code theme file's text as a theme: comments and trailing commas allowed, as VS Code allows them.
export function parseTheme(text) {
	const stripped = text
		.replace(
			/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
			(match, string) => string ?? '',
		)
		.replace(/,(\s*[}\]])/g, '$1');

	return JSON.parse(stripped);
}

// Loads a theme next to the bundled ones; it must carry a `name` and `tokenColors`.
// Resolves to the name it is listed under.
export function addTheme(theme) {
	if (
		theme === null ||
		typeof theme !== 'object' ||
		!Array.isArray(theme.tokenColors ?? theme.settings)
	) {
		throw new Error(
			'A theme needs a tokenColors list, as a VS Code theme file has',
		);
	}

	const name = String(theme.name ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	if (name === '') {
		throw new Error('A theme needs a name');
	}

	const type =
		theme.type === 'light' || theme.type === 'hc-light' ? 'light' : 'dark';
	const displayName = String(theme.displayName ?? theme.name ?? name);
	const prepared = withPhpTwins({ ...theme, name, displayName, type });

	get().loadThemeSync(prepared);
	byName.set(name, prepared);

	return name;
}

let highlighter;

function get() {
	if (highlighter === undefined) {
		highlighter = createHighlighterCoreSync({
			themes,
			langs,
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		});
	}

	return highlighter;
}

// The editor's own background, text and line-number colours for a theme, and whether it is light.
export function colorsOf(name) {
	const theme = byName.get(name);
	const colors = theme?.colors ?? {};
	const isLight = theme?.type === 'light';
	// Shiki's reading of the theme: the colours it gives text no rule covers.
	const resolved = theme === undefined ? undefined : get().getTheme(name);
	const background =
		colors['editor.background'] ??
		resolved?.bg ??
		(isLight ? '#ffffff' : '#1e1e1e');
	const foreground =
		colors['editor.foreground'] ??
		resolved?.fg ??
		(isLight ? '#333333' : '#d4d4d4');

	return {
		background,
		foreground,
		gutter:
			colors['editorLineNumber.foreground'] ??
			(isLight ? '#999999' : '#858585'),
		isLight,
	};
}

// The grammar id for a fence's language tag, or undefined when none is bundled.
export function resolveLang(lang) {
	const id = (lang || '').toLowerCase().trim();

	return id !== '' && get().getLoadedLanguages().includes(id)
		? id
		: undefined;
}

// The colour VS Code gives `<?php`, read by the HTML wrapper Shiki lacks.
function embeddedOf(name) {
	const rule = byName.get(name)?.tokenColors.find((one) =>
		[]
			.concat(one.scope ?? [])
			.join(',')
			.includes('punctuation.section.embedded.begin'),
	);

	return rule?.settings?.foreground;
}

// Without that wrapper `<?php` lexes as `<`, `?` and `php`: those tokens are swapped for one.
function phpTags(line, color) {
	const text = line.map((token) => token.content).join('');
	const open = /^(\s*)<\?(php|=)?/.exec(text);

	if (open === null) {
		return line;
	}

	const end = open[0].length;
	const rest = [];
	let at = 0;

	for (const token of line) {
		const from = at;
		at += token.content.length;

		if (at <= end) {
			continue;
		}

		rest.push(
			from >= end
				? token
				: { ...token, content: token.content.slice(end - from) },
		);
	}

	const lead = open[1] === '' ? [] : [{ content: open[1], fontStyle: 0 }];

	return [
		...lead,
		{ content: open[0].slice(open[1].length), color, fontStyle: 0 },
		...rest,
	];
}

// Lines of { content, color, fontStyle }; fontStyle bits: 1 italic, 2 bold, 4 underline.
export function tokenize(code, lang, theme) {
	const lines = get().codeToTokensBase(code, { lang, theme });
	const embedded = lang === 'php' ? embeddedOf(theme) : undefined;

	return embedded === undefined
		? lines
		: lines.map((line) => phpTags(line, embedded));
}
