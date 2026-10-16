import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register, RenderChildren } from 'claude-code';
import type { AddedTheme } from '../types';
import { drawsReply, expandTabs, split } from './fences';
import {
	COMMAND,
	helpText,
	isUrl,
	listText,
	optionText,
	parse,
	rawUrl,
	settingText,
	statusText,
	styleText,
} from './settings';
import type { Pairs, Style } from './settings';
import { MAX_LINES, cardWidth, codeCard } from './card';
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
// The desktop control's label: blank cells over the icon drawn beneath it, so the press and
// the hover background land on the icon. Non-breaking, so the surface keeps their width.
const HIT_TARGET = '\u00a0\u00a0\u00a0\u00a0\u00a0';
// The desktop control's icon, drawn as the app draws its own: outline strokes on a 24-unit
// grid, round caps and joins, 12 pixels square in the middle of the control.
const COPY_ICON =
	'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
const CHECK_ICON = '<path d="M20 6 9 17l-5-5"/>';
const ICON_WIDTH = 24;
const ICON_HEIGHT = 20;

// The line under the header: one pixel DIVIDER_LINE down a strip of DIVIDER_HEIGHT under the
// header row, so the header sits about as far above it as below the block's edge, and the
// code a step below. Pixels, not cells, which are too coarse here. Wider than any block and
// stretched to its width; an Svg, so a selection never takes it in.
const DIVIDER_HEIGHT = 11;
const DIVIDER_LINE = 6;
// Cells of padding added before a line per column of its indent. The desktop's font draws
// a space at about a quarter of a cell, so an indent alone reads shallower than in the code
// font; the spaces stay in the text, so a copy keeps the indent exactly.
const INDENT_PAD = 0.375;

// The divider's strip with nothing drawn: room at the top of the line numbers' column.
const DIVIDER_SPACER = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${DIVIDER_HEIGHT}"/>`;

const DIVIDER_SVG = (color: string): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${DIVIDER_HEIGHT}" viewBox="0 0 4000 ${DIVIDER_HEIGHT}" preserveAspectRatio="none"><rect y="${DIVIDER_LINE}" width="4000" height="1" fill="${color}" fill-opacity=".35"/></svg>`;

const iconSvg = (isCopied: boolean, color: string): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_WIDTH}" height="${ICON_HEIGHT}" viewBox="0 0 ${ICON_WIDTH} ${ICON_HEIGHT}"><g transform="translate(6 4) scale(.5)" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${isCopied ? CHECK_ICON : COPY_ICON}</g></svg>`;
const options = atom({ plugin: 'skin-code', key: 'options' } as const, {
	header: true,
	numbers: true,
});
// How the desktop draws a block: rows of selectable text by default, or the card.
const style = atom({ plugin: 'skin-code', key: 'style' } as const, 'text' as Style);

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
		return ((await get()) as { value?: T; }).value;
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
			} catch { }
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
		await readOther<{ skin?: string; }>(() =>
			$.state.get(skinsPrefs as never),
		)
	)?.skin;

	return skin === 'off' ? undefined : skin;
}

// The person's own skins skins, each by the built-in skin it was made from.
async function customSkinsOf(
	$: EngineInterface,
): Promise<Record<string, string | undefined>> {
	const custom = await readOther<Record<string, { base?: string; }>>(() =>
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

// The columns of space a line starts with; a footer row, or none, starts with none.
const indentOf = (tokens: readonly ThemedToken[] | undefined): number =>
	/^ */.exec((tokens ?? []).map((token) => token.content).join(''))?.[0].length ?? 0;

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
			skinCode: {
				addTheme: async () => '',
				themes: async () => [],
				draws: async () => false,
			},
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

	on('skinCode.draws', async ($, e) => ({
		value:
			typeof e.text === 'string' && drawsReply(e.text, await read($, mode)),
	}));

	on('session.start', async ($, e, next) => {
		await $.command.register({
			name: COMMAND,
			description:
				'Colour code blocks with VS Code themes: auto, off, list, add, or a theme',
			argumentHint:
				'[status | auto | off | list | themes | help | add <url or path> | remove <name> | style text|card | <theme>]',
			immediate: true,
		});

		const layout = (await $.store.get('options')) as
			| Partial<Record<'header' | 'numbers', boolean>>
			| undefined;

		if (layout !== undefined) {
			await update($, options, (current) => ({ ...current, ...layout }));
		}

		const drawn = await $.store.get('style');

		if (drawn === 'text' || drawn === 'card') {
			await update($, style, () => drawn);
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
			} catch { }
		}

		return next(e);
	});

	on('command.run', { command: COMMAND }, async ($, e) => {
		const all = await pairsOf($);
		const loaded = await loadAdded($);
		const asked = parse(e.args, themeNames(), all);

		if (asked.kind === 'help') {
			return { text: helpText() };
		}

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
					await read($, style),
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

				// Adding a theme is asking to see it: switch to it, as /skin-code <name> would.
				await update($, mode, () => name);
				await $.store.set('mode', name);

				return {
					text: `Added ${displayNameOf(name)} and switched to it. /skin-code auto goes back to following your skin.`,
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

		if (asked.kind === 'style') {
			await update($, style, () => asked.style);
			await $.store.set('style', asked.style);

			return { text: styleText(asked.style) };
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
		const isTerminal = e.surface === 'terminal';
		// Every surface's table names Svg, but the terminal draws it as nothing.
		const Svg = !isTerminal && 'Svg' in ui ? ui.Svg : undefined;
		const columns = e.viewport?.columns ?? 100;
		const colors = colorsOf(theme);
		const { header, numbers } = await read($, options);
		const drawStyle = await read($, style);
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
		// The control's background under the pointer, a step off the block's own.
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
					} catch { }

					return prose ?? <Markdown text={segment.text} />;
				}

				const label = segment.tag || segment.lang;
				const lines = tokensOf(segment.code, segment.lang, theme);
				const block = `${e.requestId}:${i}`;
				const isCopied = justCopied === block;
				const press = () => void copy(segment.code, block);
				// On the terminal the control is a word, as skins writes it (a glyph is drawn
				// wider than its cell in many fonts), with no hover: a terminal has no
				// translucent colours, and it inverts a button under the pointer by itself.
				const copyButton = (
					<Button
						key={`skin-code-copy-${i}`}
						label={isCopied ? ' Copied ' : ' Copy '}
						plain
						dimColor
						onPress={press}
					/>
				);
				// Elsewhere it is the app's copy icon, a checkmark just after a copy, under a
				// blank target with a hover of its own.
				const copyIcon =
					Svg === undefined ? (
						copyButton
					) : (
						<Box key={`skin-code-copy-scope-${i}`}>
							<Svg
								source={iconSvg(isCopied, colors.foreground)}
								alt={isCopied ? 'Copied' : 'Copy'}
								width={ICON_WIDTH}
								height={ICON_HEIGHT}
							/>
							<Box position="absolute" top={0} left={0}>
								<Button
									key={`skin-code-copy-${i}`}
									label={HIT_TARGET}
									plain
									dimColor
									hover={{
										backgroundColor: hoverBackground,
										dimColor: false,
									}}
									onPress={press}
								/>
							</Box>
						</Box>
					);
				const shown = lines.slice(0, MAX_LINES);
				// Every surface draws the code as text, so it selects as the app's own code
				// blocks do. In an SVG a row was only as wide as its glyphs, and a drag that
				// ended past a line's end selected from the top. The numbers are a column of
				// their own beside the code, so a drag through the code never takes them in.
				const lineTexts = shown.map((tokens) => (
						<Text wrap="truncate-end">
							{tokens.length === 0
								? ' '
								: tokens.map((token) => (
									// Every token unwrapped too: a desktop wraps a line between its
									// tokens, which a one-row line then cuts in half.
									<Text
										wrap="truncate-end"
										color={token.color ?? colors.foreground}
										italic={((token.fontStyle ?? 0) & 1) !== 0}
										bold={((token.fontStyle ?? 0) & 2) !== 0}
										underline={
											((token.fontStyle ?? 0) & 4) !== 0
										}
									>
										{token.content}
									</Text>
								))}
						</Text>
				));
				const more =
					lines.length > shown.length ? (
						<Text
							color={colors.gutter}
						>{`${lines.length - shown.length} more lines (copy takes all of it)`}</Text>
					) : (
						''
					);
				const digits = String(shown.length).length;
				const code = [...lineTexts, more];
				// Right-aligned by the column, not padded with spaces: in the desktop's font a space
				// is narrower than a digit.
				const gutter = shown.map((_tokens, n) => (
					<Text color={colors.gutter}>{String(n + 1)}</Text>
				));
				// The terminal's rows: the numbers a column beside the code.
				const rows = (
					<Box flexDirection="row">
						{numbers ? (
							<Box
								flexDirection="column"
								alignItems="flex-end"
								flexShrink={0}
								marginRight={1}
							>
								{gutter}
							</Box>
						) : (
							''
						)}
						<Box
							flexDirection="column"
							flexGrow={1}
							flexShrink={1}
							overflow="hidden"
						>
							{code}
						</Box>
					</Box>
				);

				const count = `${lines.length} line${lines.length === 1 ? '' : 's'}`;

				if (drawStyle === 'card' && Svg !== undefined) {
					// The card: the block drawn whole, in the theme's code font, and shown as a
					// frame, not an image, so its text can be selected (card.ts says how). The
					// control and its icon lie over it, outside the drawing, so a copy redraws
					// them alone: a new drawing of the card would reload its frame, a flash.
					const card = codeCard(lines, label, colors, cardWidth(columns), {
						header,
						numbers,
						hasControl: true,
					});

					return (
						<Box marginY={1} alignSelf="flex-start">
							<Svg
								isInteractive
								source={card.source}
								alt={`${label}:\n${segment.code.slice(0, 4000)}`}
								width={card.width}
								height={card.height}
							/>
							<Box position="absolute" top={1} right={1}>
								{copyIcon}
							</Box>
						</Box>
					);
				}

				if (!isTerminal) {
					// The remote surfaces: the theme's own background, so a dark theme reads in a
					// light app, and a header row with the language, the line count and the copy
					// control, ruled off from the code. Without the header the control sits at
					// the top right on its own.
					//
					// No element offers user-select, so the line numbers are kept out of reach:
					// - They come first in the block, before the header, so no drag between the
					//   header and the code passes over them.
					// - The code is a layer over them, absolute and later, so painted on top: the
					//   pointer over a number is over the code, and a drag starting there selects
					//   code. An empty Box as tall as the code holds its room in the block.
					// - The head, every number and every line of code are whole rows, so the
					//   numbers, placed by row, line up with the code.
					// - All of it sits in a plain Box inside the bordered one: a desktop insets a
					//   bordered Box's content (about a cell across, less down) but places an
					//   absolute child from its outer edge, so placed there the numbers drifted
					//   up and left, out from under the code.
					const headRows = 1;
					const codeRows = more === '' ? lineTexts : [...lineTexts, more];

					return (
						<Box
							flexDirection="column"
							marginY={1}
							borderStyle="round"
							borderColor={colors.gutter}
							backgroundColor={colors.background}
						>
							<Box flexDirection="column">
								{numbers ? (
									// Left-aligned and inset by padding, as the header's label is, so every
									// number starts under the language label.
									<Box
										position="absolute"
										top={headRows}
										left={0}
										paddingLeft={1}
										flexDirection="column"
										alignItems="flex-start"
									>
										{/* The divider's strip, in pixels, which an offset in rows cannot say. */}
										{header && Svg !== undefined ? (
											<Svg
												source={DIVIDER_SPACER}
												alt="Divider"
												width={1}
												height={DIVIDER_HEIGHT}
											/>
										) : (
											''
										)}
										{shown.map((_tokens, n) => (
											<Box height={1} flexDirection="row" alignItems="center">
												<Text color={colors.gutter}>{String(n + 1)}</Text>
											</Box>
										))}
									</Box>
								) : (
									''
								)}
								<Box flexDirection="column">
									<Box
										height={1}
										flexDirection="row"
										justifyContent={header ? 'space-between' : 'flex-end'}
										alignItems="center"
										paddingX={1}
									>
										{header ? (
											<Text color={colors.gutter} bold>
												{label.toUpperCase()}
											</Text>
										) : (
											''
										)}
										<Box flexDirection="row" gap={1}>
											{header ? (
												<Text color={colors.gutter}>{count}</Text>
											) : (
												''
											)}
											{copyIcon}
										</Box>
									</Box>
									{/* The line under the header runs edge to edge: the block has no padding
									    of its own, only the header and the code do. */}
									{header && Svg !== undefined ? (
										<Box width="100%">
											<Svg
												source={DIVIDER_SVG(colors.gutter)}
												alt="Divider"
												height={DIVIDER_HEIGHT}
											/>
										</Box>
									) : (
										''
									)}
								</Box>
								<Box flexDirection="column">
									<Box height={codeRows.length} />
									<Box
										position="absolute"
										top={0}
										left={0}
										right={0}
										flexDirection="column"
										paddingLeft={numbers ? digits + 2 : 1}
										paddingRight={1}
									>
										{codeRows.map((row, n) => (
											<Box
												height={1}
												flexDirection="row"
												alignItems="center"
												overflow="hidden"
												paddingLeft={Math.round(
													indentOf(shown[n]) * INDENT_PAD,
												)}
											>
												{row}
											</Box>
										))}
									</Box>
								</Box>
							</Box>
						</Box>
					);
				}

				// The terminal: a rounded frame, the language on its top border, a dim gutter. The
				// label and copy mark are laid over the border from a plain Box around the frame:
				// inside the bordered Box, the border was drawn over them.
				return (
					<Box flexDirection="column" marginY={1}>
						<Box flexDirection="column">
							<Box
								flexDirection="column"
								borderStyle="round"
								borderColor={colors.gutter}
								paddingX={1}
							>
								{rows}
							</Box>
							{header ? (
								<Box position="absolute" top={0} left={2}>
									<Text color={colors.gutter}>{` ${label} `}</Text>
								</Box>
							) : (
								''
							)}
							{/* Only the fullscreen layout reports clicks; on the main screen the control could not be pressed. */}
							{e.viewport?.isFullscreen === false ? (
								''
							) : (
								<Box
									key={`skin-code-copy-scope-${i}`}
									position="absolute"
									top={0}
									right={2}
								>
									{copyButton}
								</Box>
							)}
						</Box>
					</Box>
				);
			}),
		);

		return <Box flexDirection="column">{drawn}</Box>;
	});
};
