import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register, RenderChildren } from 'claude-code';
import type { AddedTheme } from '../types';
import { MAX_LINES, cardWidth, codeCard } from './card';
import { expandTabs, split } from './fences';
import {
	COMMAND,
	isUrl,
	listText,
	optionText,
	parse,
	rawUrl,
	settingText,
	statusText,
} from './settings';
import type { Pairs } from './settings';
import { DEFAULT_PAIR, SKIN_THEMES, TERMINAL_FALLBACK } from './themes';
import type { ThemePair } from './themes';
import {
	addTheme,
	colorsOf,
	displayNameOf,
	hasTheme,
	parseTheme,
	themeNames,
	tokenize,
} from './vendor/shiki';
import type { ThemedToken, VsCodeTheme } from './vendor/shiki';

// skin-code: fenced code in replies drawn with VS Code's grammars and themes through Shiki.
// `auto` follows the active skins skin, light or dark; `/skin-code <name>` picks one;
// `/skin-code add` and `$.skinCode.addTheme` bring more themes.

const mode = atom({ plugin: 'skin-code', key: 'mode' } as const, 'auto');
const added = atom({ plugin: 'skin-code', key: 'added' } as const, {});
const pairs = atom({ plugin: 'skin-code', key: 'pairs' } as const, {});
// The block just copied, whose control shows a checkmark for COPIED_MS.
const copied = atom({ plugin: 'skin-code', key: 'copied' } as const, '');
const COPIED_MS = 2000;
// The desktop control's label: blank cells over the icon the card draws, so the press and
// the hover background land on the icon. Non-breaking, so the surface keeps their width.
const HIT_TARGET = '\u00a0\u00a0\u00a0\u00a0\u00a0';
const options = atom({ plugin: 'skin-code', key: 'options' } as const, {
	header: true,
	numbers: true,
});

// skins' own values, read when it is installed: the skin in use, the skins made from a
// built-in one, and whether Claude Code is drawing light.
const skinsPrefs = { plugin: 'skins', key: 'prefs' } as const;
const skinsCustom = { plugin: 'skins', key: 'custom' } as const;
const skinsLight = { plugin: 'skins', key: 'isLight' } as const;

type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile';

// Another plugin's value, undefined when that plugin is not installed.
async function readOther<T>(
	get: () => Promise<unknown>,
): Promise<T | undefined> {
	try {
		return ((await get()) as { value?: T }).value;
	} catch {
		return undefined;
	}
}

// Themes added since load live in state; a reload of this module loads them again.
async function loadAdded(
	$: EngineInterface,
): Promise<Record<string, AddedTheme>> {
	const all = await read($, added);

	for (const [name, entry] of Object.entries(all)) {
		if (!hasTheme(name)) {
			try {
				addTheme({ ...entry.theme, name });
			} catch {}
		}
	}

	return all;
}

async function pairsOf($: EngineInterface): Promise<Pairs> {
	return { ...SKIN_THEMES, ...(await read($, pairs)) };
}

// Light when skins says so, else when SKIN_CODE_THEME or Claude Code's theme names light.
async function isLight($: EngineInterface): Promise<boolean> {
	const fromSkins = await readOther<boolean>(() =>
		$.state.get(skinsLight as never),
	);

	if (fromSkins !== undefined) {
		return fromSkins;
	}

	try {
		const theme =
			(await $.env.get('SKIN_CODE_THEME')) ??
			(await $.config.list()).find((row) => row.key === 'theme')?.value;

		return (
			typeof theme === 'string' && theme.toLowerCase().includes('light')
		);
	} catch {
		return false;
	}
}

// The pair the active skin maps to: its own name first, then the built-in it was made from.
// The skins skin in use, undefined when skins is off or not installed.
async function activeSkinOf($: EngineInterface): Promise<string | undefined> {
	const skin = (
		await readOther<{ skin?: string }>(() =>
			$.state.get(skinsPrefs as never),
		)
	)?.skin;

	return skin === 'off' ? undefined : skin;
}

// The person's own skins skins, each by the built-in skin it was made from.
async function customSkinsOf(
	$: EngineInterface,
): Promise<Record<string, string | undefined>> {
	const custom = await readOther<Record<string, { base?: string }>>(() =>
		$.state.get(skinsCustom as never),
	);

	return Object.fromEntries(
		Object.entries(custom ?? {}).map(([name, skin]) => [name, skin.base]),
	);
}

async function skinPair($: EngineInterface, all: Pairs): Promise<ThemePair> {
	const skin = await activeSkinOf($);

	if (skin === undefined) {
		return DEFAULT_PAIR;
	}

	const base = (await customSkinsOf($))[skin];

	return (
		all[skin] ??
		(base === undefined ? undefined : all[base]) ??
		DEFAULT_PAIR
	);
}

// The theme to draw with now, or undefined while skin-code is off. On the terminal the code
// sits on the terminal's own background, so a theme of the wrong lightness gives way.
async function themeOf(
	$: EngineInterface,
	setting: string,
	surface: Surface,
): Promise<string | undefined> {
	if (setting === 'off') {
		return undefined;
	}

	await loadAdded($);
	const all = await pairsOf($);
	const light = await isLight($);
	const pair = setting === 'auto' ? await skinPair($, all) : all[setting];
	const chosen = pair === undefined ? setting : pair[light ? 1 : 0];
	const theme = hasTheme(chosen) ? chosen : DEFAULT_PAIR[light ? 1 : 0];

	return surface === 'terminal' && colorsOf(theme).isLight !== light
		? TERMINAL_FALLBACK[light ? 1 : 0]
		: theme;
}

// A reply redraws as it streams; the same block tokenizes once per theme.
const tokenCache = new Map<string, ThemedToken[][]>();

function tokensOf(code: string, lang: string, theme: string): ThemedToken[][] {
	const key = `${theme}\u0000${lang}\u0000${code}`;
	const kept = tokenCache.get(key);

	if (kept !== undefined) {
		return kept;
	}

	const tokens = tokenize(expandTabs(code), lang, theme);

	if (tokenCache.size > 300) {
		tokenCache.clear();
	}

	tokenCache.set(key, tokens);

	return tokens;
}

// A theme file's text from a URL (a GitHub page link reads its raw file) or a path.
async function themeText($: EngineInterface, source: string): Promise<string> {
	if (isUrl(source)) {
		const response = await $.http.fetch(rawUrl(source));

		if (!response.ok) {
			throw new Error(`${source} answered ${response.status}`);
		}

		return response.text;
	}

	const home = (await $.env.get('HOME')) ?? '';
	const path = source.startsWith('~/')
		? `${home}${source.slice(1)}`
		: source.startsWith('/')
			? source
			: `${await $.session.cwd()}/${source}`;

	return $.fs.read(path);
}

// Records a theme for the session (and, from the user, for later sessions) and loads it.
async function keepTheme(
	$: EngineInterface,
	theme: VsCodeTheme,
	by: string,
): Promise<string> {
	const name = addTheme(theme);

	await update($, added, (all) => ({
		...all,
		[name]: { theme: { ...theme, name }, by },
	}));

	if (by === 'user') {
		const stored = (await $.store.get('themes')) as
			| Record<string, VsCodeTheme>
			| undefined;

		await $.store.set('themes', {
			...(stored ?? {}),
			[name]: { ...theme, name },
		});
	}

	return name;
}

export const register: Register = (on) => {
	// Adds `$.skinCode` for other mods. Each call is the event of its name, answered below;
	// the methods here are the chain's floor.
	on('engine.create', async ($, e, next) => {
		const built = await next(e);

		return {
			...built,
			skinCode: { addTheme: async () => '', themes: async () => [] },
		};
	});

	on('skinCode.addTheme', async ($, e) => {
		const name = await keepTheme($, e.theme, 'plugin');

		if (e.skin !== undefined) {
			const lightness =
				e.lightness ?? (colorsOf(name).isLight ? 'light' : 'dark');
			const skin = e.skin.toLowerCase();

			await update($, pairs, (all) => {
				const was: ThemePair = all[skin] ??
					SKIN_THEMES[skin] ?? [name, name];
				const pair: ThemePair =
					lightness === 'light' ? [was[0], name] : [name, was[1]];

				return { ...all, [skin]: pair };
			});
		}

		return { value: name };
	});

	on('skinCode.themes', async ($) => {
		await loadAdded($);

		return { value: themeNames() };
	});

	on('session.start', async ($, e, next) => {
		await $.command.register({
			name: COMMAND,
			description:
				'Colour code blocks with VS Code themes: auto, off, list, add, or a theme',
			argumentHint:
				'[auto | off | list | add <url or path> | remove <name> | <theme>]',
			immediate: true,
		});

		const layout = (await $.store.get('options')) as
			| Partial<Record<'header' | 'numbers', boolean>>
			| undefined;

		if (layout !== undefined) {
			await update($, options, (current) => ({ ...current, ...layout }));
		}

		const stored = await $.store.get('mode');

		if (typeof stored === 'string') {
			await update($, mode, () => stored);
		}

		// The themes the person added in earlier sessions.
		const themes = (await $.store.get('themes')) as
			| Record<string, VsCodeTheme>
			| undefined;

		for (const theme of Object.values(themes ?? {})) {
			try {
				await keepTheme($, theme, 'user');
			} catch {}
		}

		return next(e);
	});

	on('command.run', { command: COMMAND }, async ($, e) => {
		const all = await pairsOf($);
		const loaded = await loadAdded($);
		const asked = parse(e.args, themeNames(), all);

		if (asked.kind === 'list') {
			const current = await read($, mode);

			return {
				text: listText({
					themes: themeNames(),
					pairs: all,
					added: Object.keys(loaded),
					current,
					drawing: await themeOf($, current, 'desktop'),
					activeSkin: await activeSkinOf($),
					customSkins: await customSkinsOf($),
					options: await read($, options),
					isLight: (theme) => colorsOf(theme).isLight,
				}),
			};
		}

		if (asked.kind === 'status') {
			const current = await read($, mode);
			const drawing = await themeOf($, current, 'desktop');

			return {
				text: statusText(
					current,
					drawing,
					all,
					displayNameOf,
					await activeSkinOf($),
					await read($, options),
				),
			};
		}

		if (asked.kind === 'add') {
			try {
				const name = await keepTheme(
					$,
					parseTheme(await themeText($, asked.source)),
					'user',
				);

				return {
					text: `Added ${name}. /skin-code ${name} draws with it.`,
				};
			} catch (error) {
				return {
					text: `Could not add a theme from ${asked.source}: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
		}

		if (asked.kind === 'remove') {
			if (loaded[asked.name]?.by !== 'user') {
				return {
					text: `${asked.name} is not a theme you added. /skin-code list marks those "(added)".`,
				};
			}

			const stored = ((await $.store.get('themes')) ?? {}) as Record<
				string,
				VsCodeTheme
			>;
			const { [asked.name]: _gone, ...kept } = stored;

			await $.store.set('themes', kept);
			await update($, added, (current) =>
				Object.fromEntries(
					Object.entries(current).filter(
						([name]) => name !== asked.name,
					),
				),
			);

			if ((await read($, mode)) === asked.name) {
				await update($, mode, () => 'auto');
				await $.store.set('mode', 'auto');
			}

			return {
				text: `Removed ${asked.name}. It stays drawable until the session ends.`,
			};
		}

		if (asked.kind === 'unknown') {
			return {
				text: `No theme named "${asked.word}". /skin-code list shows the themes.`,
			};
		}

		if (asked.kind === 'option') {
			await update($, options, (current) => ({
				...current,
				[asked.option]: asked.value,
			}));
			await $.store.set('options', await read($, options));

			return { text: optionText(asked.option, asked.value) };
		}

		await update($, mode, () => asked.setting);
		await $.store.set('mode', asked.setting);

		return {
			text: settingText(
				asked.setting,
				await themeOf($, asked.setting, 'desktop'),
				all,
				displayNameOf,
				await activeSkinOf($),
			),
		};
	});

	on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
		const text = e.props.text;
		const segments =
			typeof text === 'string' && /```|~~~/.test(text)
				? split(text)
				: null;

		if (segments === null) {
			return next(e);
		}

		const theme = await themeOf($, await read($, mode), e.surface);

		if (theme === undefined) {
			return next(e);
		}

		const ui = $.ui.resolve(e);
		const { Box, Button, Markdown, Text } = ui;
		// Every surface's table names Svg, but the terminal draws it as nothing.
		const Svg =
			e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined;
		const columns = e.viewport?.columns ?? 100;
		const colors = colorsOf(theme);
		const { header, numbers } = await read($, options);
		const justCopied = await read($, copied);
		// As the app's own copy control: a checkmark for a moment, a toast only on failure.
		const copy = async (text: string, block: string) => {
			const result = await $.ui.copy({ text, surface: e.surface });

			if (!result.isCopied) {
				await $.ui.toast('Could not copy here');
				return;
			}

			await update($, copied, () => block);
			await $.clock.sleep(COPIED_MS);
			await update($, copied, (current) =>
				current === block ? '' : current,
			);
		};
		// The control's background under the pointer, a step off the card's own.
		const hoverBackground = colors.isLight ? '#0000000f' : '#ffffff14';

		const drawn = await Promise.all(
			segments.map(async (segment, i): Promise<RenderChildren> => {
				if (segment.kind === 'text') {
					if (segment.text.trim() === '') {
						return '';
					}

					let prose: RenderChildren | undefined;

					try {
						prose = await $.skins.markdown({
							surface: e.surface,
							text: segment.text,
							columns,
						});
					} catch {}

					return prose ?? <Markdown text={segment.text} />;
				}

				const label = segment.tag || segment.lang;
				const lines = tokensOf(segment.code, segment.lang, theme);
				const block = `${e.requestId}:${i}`;
				const isCopied = justCopied === block;
				// On a card the icon is drawn in the image, so the control is a blank target over
				// it; on the terminal it is the glyph itself.
				const copyButton = (
					<Button
						key={`skin-code-copy-${i}`}
						label={
							Svg === undefined
								? isCopied
									? '✓'
									: '⧉'
								: HIT_TARGET
						}
						plain
						dimColor
						hover={{
							backgroundColor: hoverBackground,
							dimColor: false,
						}}
						onPress={() => void copy(segment.code, block)}
					/>
				);

				if (Svg !== undefined) {
					const card = codeCard(
						lines,
						label,
						colors,
						cardWidth(columns),
						{
							header,
							numbers,
							hasControl: true,
							copied: isCopied,
						},
					);

					return (
						<Box marginY={1} alignSelf="flex-start">
							<Svg
								source={card.source}
								alt={`${label}:\n${segment.code.slice(0, 4000)}`}
								width={card.width}
								height={card.height}
							/>
							<Box
								key={`skin-code-copy-scope-${i}`}
								position="absolute"
								top={1}
								right={1}
							>
								{copyButton}
							</Box>
						</Box>
					);
				}

				// The terminal: a rounded frame, the language on its top border, a dim gutter.
				const shown = lines.slice(0, MAX_LINES);
				const digits = String(lines.length).length;

				return (
					<Box flexDirection="column" marginY={1}>
						<Box
							flexDirection="column"
							borderStyle="round"
							borderColor={colors.gutter}
							paddingX={1}
						>
							{shown.map((tokens, n) => (
								<Text wrap="truncate-end">
									{numbers ? (
										<Text
											color={colors.gutter}
										>{`${String(n + 1).padStart(digits)}  `}</Text>
									) : (
										''
									)}
									{tokens.length === 0
										? ' '
										: tokens.map((token) => (
												<Text
													color={
														token.color ??
														colors.foreground
													}
													italic={
														((token.fontStyle ??
															0) &
															1) !==
														0
													}
													bold={
														((token.fontStyle ??
															0) &
															2) !==
														0
													}
													underline={
														((token.fontStyle ??
															0) &
															4) !==
														0
													}
												>
													{token.content}
												</Text>
											))}
								</Text>
							))}
							{lines.length > shown.length ? (
								<Text
									color={colors.gutter}
								>{`${lines.length - shown.length} more lines (copy takes all of it)`}</Text>
							) : (
								''
							)}
							{header ? (
								<Box position="absolute" top={-1} left={1}>
									<Text
										color={colors.gutter}
									>{` ${label} `}</Text>
								</Box>
							) : (
								''
							)}
							<Box
								key={`skin-code-copy-scope-${i}`}
								position="absolute"
								top={-1}
								right={1}
							>
								{copyButton}
							</Box>
						</Box>
					</Box>
				);
			}),
		);

		return <Box flexDirection="column">{drawn}</Box>;
	});
};
