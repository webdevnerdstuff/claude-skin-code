import { DEFAULT_PAIR, SKIN_THEMES } from './themes';
import type { ThemePair } from './themes';

// The words /skin-code takes, and what it answers: pure, so the tests read them directly.

export const COMMAND = 'skin-code';

// The parts of a code block that can be switched off, as /skin-code names them.
export type Option = 'header' | 'numbers';

export type Options = Readonly<Record<Option, boolean>>;

// How a code block is drawn on the desktop: 'text', rows of selectable text in the app's
// font, or 'card', a drawing in the theme's code font whose text selects less cleanly.
export type Style = 'text' | 'card';

export type Pairs = Readonly<Record<string, ThemePair>>;

// Which themes /skin-code gallery shows: every one, or those of one lightness.
export type GalleryFilter = 'all' | 'dark' | 'light';

export type Parsed =
	| { kind: 'status' }
	| { kind: 'list' }
	| { kind: 'gallery'; filter: GalleryFilter }
	| { kind: 'help' }
	| { kind: 'set'; setting: string }
	| { kind: 'add'; source: string }
	| { kind: 'remove'; name: string }
	| { kind: 'option'; option: Option; value: boolean }
	| { kind: 'style'; style: Style }
	| { kind: 'unknown'; word: string };

// The setting a word names: a skin's pair, one theme, auto or off; `on` and nothing are auto.
export function settingOf(
	word: string,
	themes: readonly string[],
	pairs: Pairs = SKIN_THEMES,
): string | undefined {
	const name = word.trim().toLowerCase();

	if (name === '' || name === 'on') {
		return 'auto';
	}

	return name === 'auto' ||
		name === 'off' ||
		pairs[name] !== undefined ||
		themes.includes(name)
		? name
		: undefined;
}

export function parse(
	args: string,
	themes: readonly string[],
	pairs: Pairs = SKIN_THEMES,
): Parsed {
	const [first = '', ...rest] = args.trim().split(/\s+/);
	const word = first.toLowerCase();
	const tail = rest.join(' ').trim();

	if (word === '' || word === 'status') {
		return { kind: 'status' };
	}

	if (word === 'list' || word === 'themes') {
		return { kind: 'list' };
	}

	if (word === 'help') {
		return { kind: 'help' };
	}

	const filter = tail.toLowerCase() || 'all';

	if (
		word === 'gallery' &&
		(filter === 'all' || filter === 'dark' || filter === 'light')
	) {
		return { kind: 'gallery', filter };
	}

	if (word === 'add' && tail !== '') {
		return { kind: 'add', source: tail };
	}

	if (word === 'remove' && tail !== '') {
		return { kind: 'remove', name: tail.toLowerCase() };
	}

	if (
		(word === 'header' || word === 'numbers') &&
		(tail === 'on' || tail === 'off')
	) {
		return { kind: 'option', option: word, value: tail === 'on' };
	}

	if (word === 'style' && (tail === 'text' || tail === 'card')) {
		return { kind: 'style', style: tail };
	}

	const setting = settingOf(word, themes, pairs);

	return setting === undefined
		? { kind: 'unknown', word: first }
		: { kind: 'set', setting };
}

// A theme's name in prose (`One Dark Pro`); the id itself when nothing better is known.
export type Names = (theme: string) => string;

const asIs: Names = (theme) => theme;

// What a setting draws, in words: the reply to /skin-code <setting>.
export function describe(
	setting: string,
	pairs: Pairs = SKIN_THEMES,
	names: Names = asIs,
): string {
	if (setting === 'off') {
		return 'Code theme: off. Code blocks are left to skins or the app.';
	}

	if (setting === 'auto') {
		return 'Code theme: auto, following your skin.';
	}

	const pair = pairs[setting];

	if (pair === undefined) {
		return `Code theme: ${names(setting)}.`;
	}

	return pair[0] === pair[1]
		? `Code theme: ${names(pair[0])}.`
		: `Code theme: ${names(pair[0])} (${names(pair[1])} in light mode).`;
}

// The reply to /skin-code alone: the setting, and the theme drawing when auto picks it.
// A setting, and the theme it draws with now when it could be more than one: auto, or a
// skin whose light half differs. `skin` is the skins skin auto followed.
export function settingText(
	setting: string,
	drawing: string | undefined,
	pairs: Pairs = SKIN_THEMES,
	names: Names = asIs,
	skin?: string,
): string {
	const pair = pairs[setting];
	const varies =
		setting === 'auto' || (pair !== undefined && pair[0] !== pair[1]);
	const from =
		setting === 'auto' && skin !== undefined ? ` (from your skin ${skin})` : '';
	const now =
		varies && drawing !== undefined
			? ` Drawing with ${names(drawing)}${from} now.`
			: '';

	return `${describe(setting, pairs, names)}${now}`;
}

// How the code blocks are laid out, in words.
export const optionsText = (options: Options): string =>
	`Header ${options.header ? 'on' : 'off'} · line numbers ${options.numbers ? 'on' : 'off'}.`;

// The reply to an option change.
export const optionText = (option: Option, value: boolean): string =>
	`${option === 'header' ? 'Code block header' : 'Line numbers'} ${value ? 'on' : 'off'}.`;

// How the desktop draws code blocks, in words: the reply to /skin-code style, and a line of
// the status.
export const styleText = (style: Style): string =>
	style === 'card'
		? 'Desktop code blocks: card, drawn in the code font.'
		: "Desktop code blocks: text, selectable as the app's own.";

// The theme in a few words, for the status table: the setting and, when it could be more
// than one, the theme it draws with now.
export function themeNow(
	setting: string,
	drawing: string | undefined,
	pairs: Pairs = SKIN_THEMES,
	names: Names = asIs,
	skin?: string,
): string {
	if (setting === 'off') {
		return 'off (left to skins or the app)';
	}

	if (setting === 'auto') {
		const from = skin === undefined ? '' : `, from your skin ${skin}`;

		return drawing === undefined ? 'auto' : `auto: ${names(drawing)}${from}`;
	}

	const pair = pairs[setting];

	if (pair === undefined || pair[0] === pair[1]) {
		return names(pair?.[0] ?? setting);
	}

	const now = drawing === undefined ? '' : `, now ${names(drawing)}`;

	return `${names(pair[0])} / ${names(pair[1])} in light${now}`;
}

// The reply to /skin-code alone: what everything is set to, as a table. It opens with a
// line of text, as help does: Claude Code puts the plugin's name before a reply's first line.
export function statusText(
	setting: string,
	drawing: string | undefined,
	pairs: Pairs = SKIN_THEMES,
	names: Names = asIs,
	skin?: string,
	options: Options = { header: true, numbers: true },
	style: Style = 'text',
): string {
	const onOff = (on: boolean) => (on ? 'on' : 'off');

	return [
		'skin-code settings',
		'',
		markdownTable(
			['Setting', 'Now'],
			[
				['Theme', themeNow(setting, drawing, pairs, names, skin)],
				['Header', onOff(options.header)],
				['Line numbers', onOff(options.numbers)],
				['Style', style === 'card' ? 'card (code font)' : 'text (selectable)'],
			],
		),
		'',
		'`/skin-code help` shows the commands.',
		'',
		'`/skin-code list` shows every theme.',
	].join('\n');
}

// A markdown table whose cells are padded to line up: the desktop draws it as a table,
// the terminal shows it as text with its columns aligned.
export function markdownTable(
	head: readonly string[],
	rows: readonly (readonly string[])[],
): string {
	const widths = head.map((title, column) =>
		Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)),
	);
	const line = (cells: readonly string[]) =>
		`| ${widths.map((width, column) => (cells[column] ?? '').padEnd(width)).join(' | ')} |`;

	return [
		line(head),
		line(widths.map((width) => '-'.repeat(width))),
		...rows.map(line),
	].join('\n');
}

export type ListArgs = {
	// Every theme loaded, the themes /skin-code add brought, and the setting.
	themes: readonly string[];
	pairs: Pairs;
	added: readonly string[];
	current: string;
	// While `auto`: the theme drawing now and the skins skin that picked it.
	drawing?: string;
	activeSkin?: string;
	// The person's own skins skins, each by the built-in skin it was made from.
	customSkins?: Readonly<Record<string, string | undefined>>;
	isLight?: (theme: string) => boolean;
	options?: Options;
};

type Row = { key: string; label: string; dark: string; light: string };

const neonFirst = (a: string, b: string) =>
	a.startsWith('neon-bunny') === b.startsWith('neon-bunny')
		? a.localeCompare(b)
		: a.startsWith('neon-bunny')
			? -1
			: 1;

// Every theme: one row per skin with its dark and light themes, then the person's own
// skins with the themes they resolve to, then each theme no skin uses (an added one says
// so) in the column of its lightness, then how to pick one. The row in use says so.
export function listText({
	themes,
	pairs,
	added,
	current,
	drawing,
	activeSkin,
	customSkins = {},
	isLight = () => false,
	options = { header: true, numbers: true },
}: ListArgs): string {
	const skinRows: Row[] = Object.keys(pairs)
		.sort(neonFirst)
		.map((skin) => {
			const [dark, light] = pairs[skin] ?? [skin, skin];

			return { key: skin, label: skin, dark, light };
		});
	const customRows: Row[] = Object.keys(customSkins)
		.filter((skin) => pairs[skin] === undefined)
		.sort()
		.map((skin) => {
			const base = customSkins[skin];
			const [dark, light] =
				(base === undefined ? undefined : pairs[base]) ?? DEFAULT_PAIR;

			return {
				key: skin,
				label: `${skin} (your skin${base === undefined ? '' : `, ${base}`})`,
				dark,
				light,
			};
		});
	const used = new Set(Object.values(pairs).flat());
	const looseRows: Row[] = themes
		.filter((name) => !used.has(name))
		.sort(
			(a, b) =>
				Number(added.includes(a)) - Number(added.includes(b)) ||
				a.localeCompare(b),
		)
		.map((name) => {
			const label = `${name}${added.includes(name) ? ' (added)' : ''}`;

			return isLight(name)
				? { key: name, label, dark: '', light: name }
				: { key: name, label, dark: name, light: name };
		});
	const rows = [...skinRows, ...customRows, ...looseRows];

	// The row in use: the skin set, else the one auto follows, else the first holding the theme.
	const holding = (theme: string | undefined) =>
		rows.find((row) => row.dark === theme || row.light === theme)?.key;
	const inUse =
		current === 'auto'
			? rows.some((row) => row.key === activeSkin)
				? activeSkin
				: holding(drawing)
			: rows.some((row) => row.key === current)
				? current
				: holding(current);
	const now =
		current === 'auto' && drawing !== undefined ? `auto (${drawing})` : current;

	return [
		`Code themes · now: ${now} · ${optionsText(options).toLowerCase()}`,
		'',
		markdownTable(
			['Skin', 'Dark', 'Light'],
			rows.map((row) => [
				`${row.label}${row.key === inUse ? ' (current)' : ''}`,
				row.dark,
				row.light === row.dark ? '(same)' : row.light,
			]),
		),
		'',
		'`/skin-code status` shows what everything is set to.',
		'',
		'`/skin-code help` shows the commands.',
	].join('\n');
}

// The snippet every theme in the gallery draws: a comment, keywords, a type, a string, a
// number and a call, so the themes differ where they differ most.
export const GALLERY_SAMPLE = {
	lang: 'typescript',
	code: [
		'// Pick the crunchiest snack',
		'type Snack = { name: string; crunch: number };',
		'const pick = (all: Snack[]) =>',
		"  all.find((s) => s.crunch > 7)?.name ?? 'carrot';",
	].join('\n'),
} as const;

// The themes /skin-code gallery shows, Neon Bunny first, then by name.
export function galleryThemes(
	themes: readonly string[],
	filter: GalleryFilter,
	isLight: (theme: string) => boolean,
): string[] {
	return themes
		.filter((theme) => filter === 'all' || isLight(theme) === (filter === 'light'))
		.sort(neonFirst);
}

// The skins whose dark or light half is this theme, for a caption under its name.
export const skinsOf = (theme: string, pairs: Pairs): string[] =>
	Object.keys(pairs)
		.filter((skin) => pairs[skin]?.includes(theme))
		.sort();

// Every /skin-code command and what it does: the reply to /skin-code help. It opens with a
// line of text: Claude Code puts the plugin's name before a reply's first line, which would
// break a table that started there.
export function helpText(): string {
	return [
		'skin-code commands',
		'',
		markdownTable(
			['Command', 'What it does'],
			[
				['`/skin-code` (or `status`)', 'what everything is set to'],
				['`/skin-code <skin>`', 'follows light and dark'],
				['`/skin-code <theme>`', 'that theme, always'],
				['`/skin-code auto`', 'follow your skins skin'],
				['`/skin-code off`', 'leave code blocks to skins or the app'],
				['`/skin-code list` (or `themes`)', 'every skin and theme'],
				['`/skin-code gallery [dark/light]`', 'a sample of code in every theme'],
				['`/skin-code add <url or path>`', 'add a VS Code theme .json'],
				['`/skin-code remove <name>`', 'remove a theme you added'],
				['`/skin-code header on/off`', 'the language and line count bar'],
				['`/skin-code numbers on/off`', 'the line numbers'],
				['`/skin-code style text/card`', 'desktop blocks as selectable text, or a card in the code font'],
			],
		),
		'',
		'`/skin-code status` shows what everything is set to.',
		'',
		'`/skin-code list` shows every theme.',
	].join('\n');
}

// A GitHub page link to a file, as its raw file; any other URL as given.
export function rawUrl(url: string): string {
	const blob = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(
		url.trim(),
	);

	return blob === null
		? url.trim()
		: `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`;
}

export const isUrl = (source: string): boolean =>
	/^https?:\/\//i.test(source.trim());
