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

// The tree as the test kit hands it back: enough of it to walk.
type Node = {
	props?: Record<string, unknown>;
	children?: readonly Node[];
};

type Mounted = {
	find: (query: object) => Promise<unknown>;
	findAll: (query: object) => Promise<{ props: Record<string, unknown> }[]>;
};

// The colour a desktop block fills with: the Box holding the theme's background.
async function backgroundOf(ui: Mounted): Promise<unknown> {
	const walk = (node: Node | undefined): unknown =>
		node?.props?.backgroundColor ??
		node?.children?.map(walk).find((found) => found !== undefined);

	return walk((await ui.find({ type: 'Box' })) as Node);
}

// The line under a desktop block's header: a thin Svg, its margin drawn in.
async function dividerOf(ui: Mounted): Promise<unknown> {
	return (await ui.findAll({ type: 'Svg' })).find(
		(found) => String(found.props.source).includes('preserveAspectRatio'),
	);
}

describe('desktop', () => {
	test('a PHP fence is a block in Neon Bunny by default', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(`Here:\n${PHP}`),
		});
		// The token's own colour: a line of one token is a row whose text matches too.
		const color = async (text: RegExp) =>
			(await ui.findAll({ type: 'Text', text }))
				.map((found) => found.props.color)
				.find((found) => found !== undefined);

		expect(await backgroundOf(ui)).toBe('#000000');
		// The class name and the parent class in the theme's PHP colours.
		expect(await color(/^Platform$/)).toBe('#DF00DF');
		expect(await color(/^Model$/)).toBe('#80FCFF');
		// `<?php` as one red token, as VS Code draws it.
		expect(await color(/^<\?php$/)).toBe('#e10000');
		expect(await ui.find({ key: 'skin-code-copy-1' })).toBeDefined();
	});

	test('the code is drawn as text, so it can be selected', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		// An SVG's rows were only as wide as their glyphs: a drag that ended past a line's
		// end selected from the top of the block. Only the icon, the divider and its spacer
		// beside the numbers are drawings.
		const drawings = (await ui.findAll({ type: 'Svg' })).map((found) =>
			String(found.props.source),
		);

		expect(drawings).toHaveLength(3);
		expect(drawings.some((source) => source.includes('Platform'))).toBe(false);
		expect(await ui.find({ type: 'Text', text: /^Platform$/ })).toBeDefined();
	});

	test('the code is a layer over the numbers, so a selection never takes them in', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});
		const find = (
			node: Node | undefined,
			is: (node: Node) => boolean,
		): Node | undefined =>
			node === undefined
				? undefined
				: is(node)
					? node
					: node.children
							?.map((child) => find(child, is))
							.find((found) => found !== undefined);
		const root = (await ui.find({ type: 'Box' })) as Node;
		const block = find(root, (node) => node.props?.borderStyle === 'round');
		// Everything sits in a plain Box inside the bordered one, which insets its content
		// but places an absolute child from its outer edge.
		const [inner] = block?.children ?? [];
		const [gutter, head] = inner?.children ?? [];
		const layer = find(
			block,
			(node) =>
				node.props?.position === 'absolute' && node.props.paddingRight !== undefined,
		);

		// The numbers come first, before the header: no drag between the header and the
		// code passes over them. Placed by row under the header row, then the divider's strip
		// in pixels, as tall as the divider itself.
		expect(gutter?.props).toMatchObject({
			position: 'absolute',
			top: 1,
			left: 0,
			paddingLeft: 1,
		});
		const [spacer, ...numbers] = gutter?.children ?? [];
		const divider = JSON.stringify(head).match(/"alt":"Divider"[^}]*"height":(\d+)/)?.[1];

		expect(spacer?.props?.height).toBe(Number(divider));
		expect(numbers).toHaveLength(6);
		expect(JSON.stringify(gutter)).not.toContain('Platform');
		// The code, absolute and later, so painted over the numbers, padded by their width
		// and a gap: the pointer over a number is over the code.
		expect(layer?.props).toMatchObject({ top: 0, left: 0, paddingLeft: 3 });
		expect(JSON.stringify(layer)).toContain('Platform');
		expect(JSON.stringify(layer)).not.toMatch(/"[1-6]"/);
	});

	test('an indented line is padded to read as deep as in the code font', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});
		// The row Box around a line of code: one row high, holding its Text.
		const rowOf = (node: Node | undefined, word: string): Node | undefined =>
			node?.props?.height === 1 &&
			JSON.stringify(node).includes(word) &&
			!node.children?.some((child) => JSON.stringify(child).includes('"height":1'))
				? node
				: node?.children
						?.map((child) => rowOf(child, word))
						.find((found) => found !== undefined);
		const root = (await ui.find({ type: 'Box' })) as Node;

		// Four spaces of indent, two cells of padding; the spaces stay in the text, so a
		// copy keeps the indent. An unindented line takes none.
		expect(rowOf(root, 'protected')?.props?.paddingLeft).toBe(2);
		expect(rowOf(root, 'Platform')?.props?.paddingLeft).toBe(0);
	});

	test('a reply without code is left to what draws beneath', async ($, on) => {
		world(on);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply('No code here.'),
		});

		expect(await ui.find({ type: 'Text', text: /^Platform$/ })).toBeUndefined();
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

		expect(await backgroundOf(ui)).toBe('#000000');
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

		expect(await backgroundOf(ui)).toBe('#eff1f5');
	});
});

describe('desktop card style', () => {
	// The card's drawing: the Svg holding the code, not the control's icon.
	const cardOf = async (ui: Mounted) =>
		(await ui.findAll({ type: 'Svg' })).find((found) =>
			String(found.props.source).includes('<text'),
		);

	test('style card draws the block as a card in the code font, a frame you can select', async ($, on) => {
		world(on);

		expect((await run($, 'style card')).text).toBe(
			'Desktop code blocks: card, drawn in the code font.',
		);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});
		const card = await cardOf(ui);
		const source = String(card?.props.source);

		// A frame, not an image: an image's text cannot be selected.
		expect(card?.props.isInteractive).toBe(true);
		expect(source).toContain('fill:#DF00DF">Platform<');
		// Each line spans the card, its padding and the numbers and header unselectable.
		expect(source).toContain('pointer-events="bounding-box"');
		expect(source).toContain('.chrome,.pad{-webkit-user-select:none;user-select:none}');
		expect(source).toMatch(/<text class="chrome"[^>]*>1<\/text>/);
		// No rows of text: the card draws the code itself.
		expect(await ui.find({ type: 'Text', text: /^Platform$/ })).toBeUndefined();
	});

	test('a copy redraws the icon over the card, never the card', async ($, on) => {
		world(on);

		const clock = mock.clock(on);

		on('ui.copy', () => ({ value: { isCopied: true } }));
		await run($, 'style card');

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});
		const icon = async () =>
			(await ui.findAll({ type: 'Svg' }))
				.map((found) => String(found.props.source))
				.find((source) => source.includes('stroke-linecap')) ?? '';
		const before = String((await cardOf(ui))?.props.source);

		expect(await icon()).toContain('<rect width="14" height="14" x="8" y="8"');

		await ui.press({ key: 'skin-code-copy-0' });
		await clock.advance(0);

		expect(await icon()).toContain('<path d="M20 6 9 17l-5-5"/>');
		// A new drawing of the card would reload its frame: a flash.
		expect(String((await cardOf(ui))?.props.source)).toBe(before);

		await clock.advance(2000);

		expect(await icon()).toContain('<rect width="14" height="14" x="8" y="8"');
		expect(String((await cardOf(ui))?.props.source)).toBe(before);
	});

	test('style text goes back to rows of text', async ($, on) => {
		world(on);
		await run($, 'style card');

		expect((await run($, 'style text')).text).toBe(
			"Desktop code blocks: text, selectable as the app's own.",
		);

		const ui = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		expect(await cardOf(ui)).toBeUndefined();
		expect(await ui.find({ type: 'Text', text: /^Platform$/ })).toBeDefined();
	});
});

describe('/skin-code', () => {
	test('a theme switches the blocks, and off hands code back', async ($, on) => {
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

		expect(await backgroundOf(drawn)).toBe('#282A36');

		await run($, 'off');

		const left = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		expect(await left.find({ type: 'Text', text: /^Platform$/ })).toBeUndefined();
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
		expect(await backgroundOf(ui)).toBe('#123456');
		expect(
			(await ui.find({ type: 'Text', text: /^const$/ }))?.props.color,
		).toBe('#ABCDEF');

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
		const icon = async () =>
			(await ui.findAll({ type: 'Svg' }))
				.map((found) => String(found.props.source))
				.find((source) => source.includes('stroke-linecap')) ?? '';
		const COPY = '<rect width="14" height="14" x="8" y="8"';
		const CHECK = '<path d="M20 6 9 17l-5-5"/>';

		// The icon is drawn beneath; the control over it is a blank target.
		expect(await icon()).toContain(COPY);
		expect((await ui.find({ key: 'skin-code-copy-0' }))?.props.label).toBe(
			'\u00a0\u00a0\u00a0\u00a0\u00a0',
		);

		await ui.press({ key: 'skin-code-copy-0' });
		await clock.advance(0);

		expect(copiedText[0]).toContain('class Platform extends Model');
		expect(await icon()).toContain(CHECK);
		expect(await icon()).not.toContain(COPY);
		expect(toasts).toEqual([]);

		await clock.advance(2000);

		expect(await icon()).toContain(COPY);
		expect(await icon()).not.toContain(CHECK);
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
	test('off, the block is the code alone, the copy control still on it', async ($, on) => {
		world(on);

		const full = await $.ui.mount({
			plugin: 'skin-code',
			surface: 'desktop',
			component: 'AssistantMessage',
			props: reply(PHP),
		});

		expect(await full.find({ type: 'Text', text: 'PHP' })).toBeDefined();
		expect(await full.find({ type: 'Text', text: '6 lines' })).toBeDefined();
		expect(await full.find({ type: 'Text', text: /^ *1$/ })).toBeDefined();
		expect(await full.find({ key: 'skin-code-copy-0' })).toBeDefined();
		// A line under the header rules it off from the code.
		expect(await dividerOf(full)).toBeDefined();

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

		expect(await bare.find({ type: 'Text', text: 'PHP' })).toBeUndefined();
		expect(await bare.find({ type: 'Text', text: '6 lines' })).toBeUndefined();
		expect(await bare.find({ type: 'Text', text: /^ *1$/ })).toBeUndefined();
		// No header, so no line under it.
		expect(await dividerOf(bare)).toBeUndefined();
		expect(
			(await bare.find({ type: 'Text', text: /^Platform$/ }))?.props.color,
		).toBe('#DF00DF');
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

		expect(await ui.find({ type: 'Text', text: /^ *1$/ })).toBeUndefined();
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
		expect((await run($, '')).text).toMatch(/\| Theme +\| Dracula Theme +\|/);
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
