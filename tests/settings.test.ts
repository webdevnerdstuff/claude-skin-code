import { describe as group, expect, test } from 'claude-code/testing';
import {
	describe,
	helpText,
	listText,
	optionText,
	parse,
	rawUrl,
	settingOf,
	settingText,
	statusText,
} from '../hooks/settings';
import { SKIN_THEMES } from '../hooks/themes';

const THEMES = ['dracula', 'github-dark', 'neon-bunny', 'one-dark-pro'];

group('settingOf', () => {
	test('nothing and on mean auto', () => {
		expect(settingOf('', THEMES)).toBe('auto');
		expect(settingOf('on', THEMES)).toBe('auto');
	});

	test('takes auto, off, a skin and a theme, in any case', () => {
		expect(settingOf('OFF', THEMES)).toBe('off');
		expect(settingOf('catppuccin', THEMES)).toBe('catppuccin');
		expect(settingOf('One-Dark-Pro', THEMES)).toBe('one-dark-pro');
	});

	test('refuses a name it does not know', () => {
		expect(settingOf('not-a-theme', THEMES)).toBeUndefined();
	});
});

group('parse', () => {
	test('no words is the status', () => {
		expect(parse('  ', THEMES)).toEqual({ kind: 'status' });
	});

	test('header and numbers take on or off', () => {
		expect(parse('header off', THEMES)).toEqual({
			kind: 'option',
			option: 'header',
			value: false,
		});
		expect(parse('numbers on', THEMES)).toEqual({
			kind: 'option',
			option: 'numbers',
			value: true,
		});
		expect(parse('header', THEMES)).toEqual({
			kind: 'unknown',
			word: 'header',
		});
		expect(parse('numbers maybe', THEMES)).toEqual({
			kind: 'unknown',
			word: 'numbers',
		});
	});

	test('list, add and remove', () => {
		expect(parse('list', THEMES)).toEqual({ kind: 'list' });
		expect(parse('help', THEMES)).toEqual({ kind: 'help' });
		expect(parse('themes', THEMES)).toEqual({ kind: 'list' });
		expect(parse('add https://example.com/theme.json', THEMES)).toEqual({
			kind: 'add',
			source: 'https://example.com/theme.json',
		});
		expect(parse('remove My-Theme', THEMES)).toEqual({
			kind: 'remove',
			name: 'my-theme',
		});
	});

	test('add and remove without a target are read as names', () => {
		expect(parse('add', THEMES)).toEqual({ kind: 'unknown', word: 'add' });
	});

	test('a theme or skin sets it', () => {
		expect(parse('dracula', THEMES)).toEqual({
			kind: 'set',
			setting: 'dracula',
		});
		expect(parse('nope', THEMES)).toEqual({ kind: 'unknown', word: 'nope' });
	});

	test('a pair added at run time is a setting', () => {
		expect(
			parse('my-skin', THEMES, {
				...SKIN_THEMES,
				'my-skin': ['dracula', 'dracula'],
			}),
		).toEqual({ kind: 'set', setting: 'my-skin' });
	});
});

group('describe', () => {
	const names = (theme: string) =>
		({
			'one-dark-pro': 'One Dark Pro',
			'one-light': 'One Light',
			dracula: 'Dracula',
		})[theme] ?? theme;

	test('says what each setting draws, by theme name', () => {
		expect(describe('auto')).toBe('Code theme: auto, following your skin.');
		expect(describe('off')).toContain('left to skins or the app');
		expect(describe('one-dark', SKIN_THEMES, names)).toBe(
			'Code theme: One Dark Pro (One Light in light mode).',
		);
		expect(describe('dracula', SKIN_THEMES, names)).toBe(
			'Code theme: Dracula.',
		);
		expect(describe('one-dark-pro', SKIN_THEMES, names)).toBe(
			'Code theme: One Dark Pro.',
		);
	});

	test('names the theme drawing when the setting could be more than one', () => {
		expect(settingText('auto', 'dracula', SKIN_THEMES, names)).toBe(
			'Code theme: auto, following your skin. Drawing with Dracula now.',
		);
		expect(
			settingText('auto', 'dracula', SKIN_THEMES, names, 'my-skin'),
		).toContain('Drawing with Dracula (from your skin my-skin) now.');
		expect(settingText('one-dark', 'one-light', SKIN_THEMES, names)).toBe(
			'Code theme: One Dark Pro (One Light in light mode). Drawing with One Light now.',
		);
		expect(settingText('dracula', 'dracula', SKIN_THEMES, names)).toBe(
			'Code theme: Dracula.',
		);
		expect(
			settingText('one-dark-pro', 'one-dark-pro', SKIN_THEMES, names),
		).toBe('Code theme: One Dark Pro.');
		expect(settingText('off', undefined)).not.toContain('Drawing');
	});

	test('the status adds where the list is', () => {
		expect(statusText('auto', 'dracula', SKIN_THEMES, names)).toContain(
			'/skin-code list',
		);
	});
});

group('listText', () => {
	const text = listText({
		themes: [...THEMES, 'vitesse-black', 'mine'],
		pairs: SKIN_THEMES,
		added: ['mine'],
		current: 'one-dark',
	});
	const lines = text.split('\n');
	const row = (start: string, from = lines) =>
		from.find((line) => line.startsWith(`| ${start}`)) ?? '';

	test('a markdown table, a row per skin, columns padded to line up', () => {
		expect(row('catppuccin')).toMatch(
			/^\| catppuccin +\| catppuccin-mocha +\| catppuccin-latte +\|$/,
		);
		expect(row('dracula')).toMatch(/\(same\) +\|$/);
		expect(
			new Set(
				lines
					.filter((line) => line.startsWith('| ') && line.includes('-dark'))
					.map((line) => line.length),
			).size,
		).toBe(1);
	});

	test('Neon Bunny comes first, the row in use says (current)', () => {
		const rows = lines.filter(
			(line) =>
				line.startsWith('| ') &&
				!line.startsWith('| Skin') &&
				!line.startsWith('| --'),
		);

		expect(rows[0]).toMatch(/^\| neon-bunny /);
		expect(lines.filter((line) => line.includes('(current)'))).toEqual([
			expect.stringMatching(/^\| one-dark \(current\) /),
		]);
	});

	test('a single theme set marks the row holding it', () => {
		const set = listText({
			themes: THEMES,
			pairs: SKIN_THEMES,
			added: [],
			current: 'one-dark-pro',
		});

		expect(row('one-dark', set.split('\n'))).toContain('one-dark (current)');
	});

	test('auto marks the skin it follows, and names the theme drawing', () => {
		const auto = listText({
			themes: THEMES,
			pairs: SKIN_THEMES,
			added: [],
			current: 'auto',
			drawing: 'catppuccin-mocha',
			activeSkin: 'catppuccin',
		});

		expect(auto).toContain('now: auto (catppuccin-mocha)');
		expect(row('catppuccin', auto.split('\n'))).toContain(
			'catppuccin (current)',
		);
	});

	test('your own skins show the themes they resolve to', () => {
		const own = listText({
			themes: THEMES,
			pairs: SKIN_THEMES,
			added: [],
			current: 'auto',
			drawing: 'gruvbox-dark-medium',
			activeSkin: 'my-sunset',
			customSkins: {
				'my-sunset': 'gruvbox',
				'neon-bunny': 'noir',
				plain: undefined,
			},
		}).split('\n');

		expect(row('my-sunset', own)).toMatch(
			/^\| my-sunset \(your skin, gruvbox\) \(current\) +\| gruvbox-dark-medium +\| gruvbox-light-medium +\|$/,
		);
		expect(row('plain', own)).toMatch(
			/^\| plain \(your skin\) +\| neon-bunny +\| \(same\) +\|$/,
		);
		// A skin of yours named after a pair already has its row.
		expect(own.filter((line) => line.startsWith('| neon-bunny '))).toHaveLength(
			1,
		);
	});

	test('themes no skin uses are rows of their own, an added one marked', () => {
		expect(row('mine')).toMatch(
			/^\| mine \(added\) +\| mine +\| \(same\) +\|$/,
		);
		expect(
			lines.findIndex((line) => line.startsWith('| mine')),
		).toBeGreaterThan(
			lines.findIndex((line) => line.startsWith('| tokyo-night')),
		);
	});

	test('a light theme no skin uses sits in the Light column', () => {
		const light = listText({
			themes: ['solo-light'],
			pairs: SKIN_THEMES,
			added: [],
			current: 'auto',
			isLight: (theme) => theme === 'solo-light',
		});

		expect(row('solo-light', light.split('\n'))).toMatch(
			/^\| solo-light +\| +\| solo-light +\|$/,
		);
	});

	test('the themes, then where the commands are; no commands table', () => {
		expect(text).not.toContain('| Command');
		expect(lines.at(-1)).toBe('/skin-code help shows the commands.');
	});
});

group('helpText', () => {
	test('every command, then where the themes are; no themes table', () => {
		const help = helpText();

		for (const command of [
			'/skin-code auto',
			'/skin-code off',
			'/skin-code list',
			'/skin-code add <url or path>',
			'/skin-code remove <name>',
		]) {
			expect(help).toContain(command);
		}

		expect(help).not.toContain('| Skin');
		// Claude Code prefixes a reply's first line with the plugin's name: a table can't start there.
		expect(help.split('\n')[0]).not.toMatch(/^\|/);
		expect(help.split('\n').at(-1)).toBe('/skin-code list shows the themes.');
	});
});

group('list tables', () => {
	test('every row has as many columns as its header', () => {
		const text = [
			listText({
				themes: THEMES,
				pairs: SKIN_THEMES,
				added: [],
				current: 'auto',
			}),
			helpText(),
		].join('\n\n');
		// A table row's cells are split on |: a | inside a cell adds a column.
		const columns = (line: string) => line.split('|').length;
		const tables = text.split('\n\n').filter((block) => block.startsWith('| '));

		expect(tables).toHaveLength(2);

		for (const table of tables) {
			const lines = table.split('\n');

			for (const line of lines) {
				expect(columns(line)).toBe(columns(lines[0] ?? ''));
			}
		}
	});
});

group('rawUrl', () => {
	test('a GitHub file page reads its raw file', () => {
		expect(
			rawUrl(
				'https://github.com/webdevnerdstuff/neon-bunny-vscode-theme/blob/main/themes/neon-bunny-theme.json',
			),
		).toBe(
			'https://raw.githubusercontent.com/webdevnerdstuff/neon-bunny-vscode-theme/main/themes/neon-bunny-theme.json',
		);
	});

	test('any other URL is kept', () => {
		expect(rawUrl('https://example.com/a.json')).toBe(
			'https://example.com/a.json',
		);
	});
});

group('options', () => {
	test('say what changed, and how the blocks are laid out', () => {
		expect(optionText('header', false)).toBe('Code block header off.');
		expect(optionText('numbers', true)).toBe('Line numbers on.');
		expect(
			statusText('dracula', 'dracula', SKIN_THEMES, undefined, undefined, {
				header: false,
				numbers: true,
			}),
		).toContain('Header off · line numbers on.');
	});

	test('the list shows them, and help how to switch them', () => {
		const text = listText({
			themes: THEMES,
			pairs: SKIN_THEMES,
			added: [],
			current: 'auto',
			options: { header: true, numbers: false },
		});

		expect(text.split('\n')[0]).toContain('header on · line numbers off.');
		expect(helpText()).toContain('/skin-code header on/off');
		expect(helpText()).toContain('/skin-code numbers on/off');
	});
});
