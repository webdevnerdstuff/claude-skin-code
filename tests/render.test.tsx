import { describe, expect, mock, test } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import type { On } from 'claude-code';

// The plugin drawing replies: a card on the desktop, framed rows on the terminal, the
// reply left alone when it holds no fence, and the theme following /skin-code.

const PHP =
	"```php\n<?php\n\nclass Platform extends Model\n{\n    protected $fillable = ['name'];\n}\n```";

const reply = (text: string) => ({ text, isFirstOfReply: true });

// The world beneath the plugin: a store and environment in memory, Claude Code's settings
// with no theme set, and the engine's own drawing of a reply as a plain marker.
function world(on: On, env: Record<string, string> = {}) {
	mock.store(on);
	mock.env(on, env);
	on('config.list', () => ({ value: [] }));
	on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
		const { Text } = $.ui.resolve(e);

		return <Text>engine reply</Text>;
	});
}

// Runs /skin-code with the words given, as typed in the composer.
const run = ($: Engine, args: string) =>
	$.command.run({
		command: 'skin-code',
		args,
		origin: { kind: 'composer' },
		presentation: { isFullscreen: false, columns: 100 },
	});

describe('desktop', () => {
	test('a PHP fence is a card in Neon Bunny by default', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(`Here:\n${PHP}`),
		});
		const source = String((await ui.find({ type: 'Svg' }))?.props.source);

		expect(source).toContain('fill="#000000"');
		// The class name and the parent class in the theme's PHP colours.
		expect(source).toContain('fill:#DF00DF">Platform<');
		expect(source).toContain('fill:#80FCFF">Model<');
		// `<?php` as one red token, as VS Code draws it.
		expect(source).toContain('fill:#e10000">&lt;?php<');
		expect(await ui.find({ key: 'skin-code-copy-1' })).toBeDefined();
	});

	test('a reply without code is left to what draws beneath', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply('No code here.'),
		});

		expect(await ui.find({ type: 'Svg' })).toBeUndefined();
		expect(
			await ui.find({ type: 'Text', text: 'engine reply' }),
		).toBeDefined();
	});

	test('Neon Bunny has no light half: a light setting keeps it', async ($, on) => {
		world(on, { SKIN_CODE_THEME: 'light' });

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		expect(
			String((await ui.find({ type: 'Svg' }))?.props.source),
		).toContain('fill="#000000"');
	});

	test('a skin with a light half switches to it when light', async ($, on) => {
		world(on, { SKIN_CODE_THEME: 'light' });

		await run($, 'catppuccin');

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		expect(
			String((await ui.find({ type: 'Svg' }))?.props.source),
		).toContain('fill="#eff1f5"');
	});
});

describe('/skin-code', () => {
	test('a theme switches the cards, and off hands code back', async ($, on) => {
		world(on);

		expect((await run($, 'dracula')).text).toBe(
			'Code theme: Dracula Theme.',
		);

		const drawn = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		expect(
			String((await drawn.find({ type: 'Svg' }))?.props.source),
		).toContain('fill="#282A36"');

		await run($, 'off');

		const left = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		expect(await left.find({ type: 'Svg' })).toBeUndefined();
	});

	test('refuses an unknown theme and lists the rest', async ($, on) => {
		world(on);

		expect((await run($, 'nope')).text).toContain('No theme named "nope"');

		const list = (await run($, 'list')).text ?? '';

		expect(list).toContain('neon-bunny');
		expect(list).toContain('catppuccin');
	});

	test('add loads a theme from a GitHub link, and remove takes it out', async ($, on) => {
		world(on);

		const asked: string[] = [];

		on('http.fetch', (_$, e) => {
			asked.push(e.url);

			return {
				value: {
					status: 200,
					ok: true,
					headers: {},
					text: '{ // a comment, as VS Code allows\n "name": "Test Theme", "type": "dark", "colors": { "editor.background": "#123456" }, "tokenColors": [{ "scope": "storage.type", "settings": { "foreground": "#abcdef" } },], }',
				},
			};
		});

		const added = await run(
			$,
			'add https://github.com/someone/themes/blob/main/test-theme.json',
		);

		expect(asked).toEqual([
			'https://raw.githubusercontent.com/someone/themes/main/test-theme.json',
		]);
		expect(added.text).toBe(
			'Added Test Theme and switched to it. /skin-code auto goes back to following your skin.',
		);
		expect((await run($, 'list')).text).toMatch(
			/\| test-theme \(added\) \(current\) +\| test-theme +\|/,
		);

		// No /skin-code test-theme needed: adding it switched to it.
		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply('```ts\nconst a = 1\n```'),
		});
		const source = String((await ui.find({ type: 'Svg' }))?.props.source);

		expect(source).toContain('fill="#123456"');
		expect(source).toContain('fill:#ABCDEF">const<');

		expect((await run($, 'remove test-theme')).text).toContain(
			'Removed test-theme',
		);
		expect((await run($, 'remove dracula')).text).toContain(
			'not a theme you added',
		);
	});
});

describe('copy control', () => {
	test('copies, draws a checkmark for two seconds, then the copy icon again', async ($, on) => {
		world(on);

		const clock = mock.clock(on);
		const copiedText: string[] = [];
		const toasts: string[] = [];

		on('ui.copy', (_$, e) => {
			copiedText.push(e.text);

			return { value: { isCopied: true } };
		});
		on('ui.toast', (_$, e) => {
			toasts.push(String(e.text));

			return { value: undefined };
		});

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});
		const card = async () =>
			String((await ui.find({ type: 'Svg' }))?.props.source);
		const COPY = '<rect width="14" height="14" x="8" y="8"';
		const CHECK = '<path d="M20 6 9 17l-5-5"/>';

		// The icon is drawn in the card; the control over it is a blank target.
		expect(await card()).toContain(COPY);
		expect((await ui.find({ key: 'skin-code-copy-0' }))?.props.label).toBe(
			'\u00a0\u00a0\u00a0\u00a0\u00a0',
		);

		await ui.press({ key: 'skin-code-copy-0' });
		await clock.advance(0);

		expect(copiedText[0]).toContain('class Platform extends Model');
		expect(await card()).toContain(CHECK);
		expect(await card()).not.toContain(COPY);
		expect(toasts).toEqual([]);

		await clock.advance(2000);

		expect(await card()).toContain(COPY);
		expect(await card()).not.toContain(CHECK);
	});

	test('the terminal labels its control Copy, then Copied for two seconds', async ($, on) => {
		world(on);

		const clock = mock.clock(on);

		on('ui.copy', () => ({ value: { isCopied: true } }));

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'terminal',
			component: 'AssistantMessage',
			props: reply(PHP),
			viewport: { columns: 100, rows: 40 },
		});
		const label = async () =>
			(await ui.find({ key: 'skin-code-copy-0' }))?.props.label;

		// Words, as skins writes them: a glyph is drawn wider than its cell in many fonts.
		expect(await label()).toBe(' Copy ');

		await ui.press({ key: 'skin-code-copy-0' });
		await clock.advance(0);

		expect(await label()).toBe(' Copied ');

		await clock.advance(2000);

		expect(await label()).toBe(' Copy ');
	});

	test('the main screen reports no clicks, so it draws no copy control', async ($, on) => {
		world(on);

		const mount = (isFullscreen: boolean) =>
			$.ui.mount({
				plugin: 'skin-code',
				surface: 'terminal',
				component: 'AssistantMessage',
				props: reply(PHP),
				viewport: { columns: 100, rows: 40, isFullscreen },
			});

		const main = await mount(false);
		const full = await mount(true);

		expect(await main.find({ key: 'skin-code-copy-0' })).toBeUndefined();
		expect(await main.find({ type: 'Text', text: ' php ' })).toBeDefined();
		expect((await full.find({ key: 'skin-code-copy-0' }))?.props.label).toBe(' Copy ');
	});
});

describe('header and numbers', () => {
	test('off, the card is the code alone, the copy control still on it', async ($, on) => {
		world(on);

		const full = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});
		const fullSource = String(
			(await full.find({ type: 'Svg' }))?.props.source,
		);
		// Read now: the mounted card redraws when the setting changes.
		const fullHeight = Number(
			(await full.find({ type: 'Svg' }))?.props.height,
		);

		expect(fullSource).toContain('>PHP<');
		expect(fullSource).toMatch(/>1<\/text>/);
		expect(await full.find({ key: 'skin-code-copy-0' })).toBeDefined();

		expect((await run($, 'header off')).text).toBe(
			'Code block header off.',
		);
		expect((await run($, 'numbers off')).text).toBe('Line numbers off.');

		const bare = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});
		const card = await bare.find({ type: 'Svg' });
		const source = String(card?.props.source);

		expect(source).not.toContain('>PHP<');
		expect(source).not.toContain(' lines<');
		expect(source).not.toMatch(/>1<\/text>/);
		expect(source).toContain('fill:#DF00DF">Platform<');
		expect(Number(card?.props.height)).toBeLessThan(fullHeight);
		expect(await bare.find({ key: 'skin-code-copy-0' })).toBeDefined();
	});

	test('the terminal drops the gutter and the label too', async ($, on) => {
		world(on);

		await run($, 'header off');
		await run($, 'numbers off');

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'terminal',
			component: 'AssistantMessage',
			props: reply(PHP),
			viewport: { columns: 100, rows: 40 },
		});

		expect(await ui.find({ type: 'Text', text: /^1 +$/ })).toBeUndefined();
		expect(await ui.find({ type: 'Text', text: ' php ' })).toBeUndefined();
		expect(
			(await ui.find({ type: 'Text', text: /^Platform$/ }))?.props.color,
		).toBe('#DF00DF');
	});
});

describe('/skin-code add, when it fails', () => {
	test('keeps the setting as it was', async ($, on) => {
		world(on);
		on('http.fetch', () => ({
			value: { status: 404, ok: false, headers: {}, text: '' },
		}));

		await run($, 'dracula');

		expect(
			(await run($, 'add https://example.com/missing.json')).text,
		).toContain('Could not add a theme');
		expect((await run($, '')).text).toContain('Code theme: Dracula Theme.');
	});
});

describe('terminal', () => {
	test('a fence is framed rows in the theme colours', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'terminal',
			component: 'AssistantMessage',
			props: reply(PHP),
			viewport: { columns: 100, rows: 40 },
		});

		expect(
			(await ui.find({ type: 'Text', text: /^Platform$/ }))?.props.color,
		).toBe('#DF00DF');
		expect(await ui.find({ type: 'Svg' })).toBeUndefined();
	});

	test('the label and copy control sit on the top border, laid from outside the frame', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'terminal',
			component: 'AssistantMessage',
			props: reply(PHP),
			viewport: { columns: 100, rows: 40 },
		});

		type Node = {
			props?: { position?: unknown; top?: unknown; borderStyle?: unknown };
			children?: readonly Node[];
		};
		// The reply, then the block: a plain Box holding the bordered frame and, over it, the
		// label and the copy mark. Drawn inside the bordered Box, the border covered them.
		const block = ((await ui.find({ type: 'Box' })) as Node).children?.[0];
		const parts = block?.children?.[0]?.children ?? [];
		const [frame, ...over] = parts;

		expect(frame?.props?.borderStyle).toBe('round');
		expect(
			frame?.children?.some((child) => child.props?.position === 'absolute'),
		).toBe(false);
		expect(over.map((part) => [part.props?.position, part.props?.top])).toEqual([
			['absolute', 0],
			['absolute', 0],
		]);
		expect(await ui.find({ type: 'Text', text: ' php ' })).toBeDefined();
		expect((await ui.find({ key: 'skin-code-copy-0' }))?.props.label).toBe(' Copy ');
	});
});
