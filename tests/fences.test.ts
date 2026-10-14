import { describe, expect, test } from 'claude-code/testing';
import { drawsReply, expandTabs, split } from '../hooks/fences';

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;

// `$.skinCode.draws` answers with this; the kit cannot call a plugin noun from a test.
describe('drawsReply', () => {
	test('a reply with a fence skin-code draws is its own', () => {
		expect(drawsReply(`Here:\n${fence('ts', 'const a = 1')}`, 'auto')).toBe(true);
		expect(drawsReply(fence('php', '$a = 1;'), 'dracula')).toBe(true);
	});

	test('prose, and fences left alone, stay with skins or the app', () => {
		expect(drawsReply('No code here.', 'auto')).toBe(false);
		expect(
			drawsReply(`${fence('bash', 'ls')}\n${fence('mermaid', 'graph TD; A-->B')}`, 'auto'),
		).toBe(false);
	});

	test('off hands every reply back', () => {
		expect(drawsReply(fence('ts', 'const a = 1'), 'off')).toBe(false);
	});
});

describe('split', () => {
	test('a reply without a fence it draws is left whole', () => {
		expect(split('Just prose, **bold** and `inline`.')).toBeNull();
		expect(split(fence('mermaid', 'flowchart LR\n  A --> B'))).toBeNull();
	});

	test('splits prose and code around a fence', () => {
		const segments = split(`Before\n${fence('php', '$a = 1;')}\nAfter`);

		expect(segments).toEqual([
			{ kind: 'text', text: 'Before' },
			{ kind: 'code', lang: 'php', tag: 'php', code: '$a = 1;' },
			{ kind: 'text', text: 'After' },
		]);
	});

	test('resolves aliases and keeps the tag as written', () => {
		const [segment] = split(fence('ts', 'const a = 1')) ?? [];

		expect(segment).toEqual({
			kind: 'code',
			lang: 'ts',
			tag: 'ts',
			code: 'const a = 1',
		});
	});

	test('shell, diff and mermaid fences stay in the prose, whole', () => {
		// A fence-looking line inside a shell block is its body, not an opener (CommonMark).
		const text = `${fence('bash', 'ls\n```php\nnot code')}\n${fence('vue', '<template />')}`;
		const segments = split(text) ?? [];

		expect(segments[0]).toEqual({
			kind: 'text',
			text: '```bash\nls\n```php\nnot code\n```',
		});
		expect(
			segments.some(
				(segment) => segment.kind === 'code' && segment.lang === 'php',
			),
		).toBe(false);
		expect(segments[1]).toEqual({
			kind: 'code',
			lang: 'vue',
			tag: 'vue',
			code: '<template />',
		});
	});

	test('an unknown language is left to the prose', () => {
		expect(split(fence('brainfuck', '+++'))).toBeNull();
	});

	test('an unclosed fence, as a reply streams, runs to the end', () => {
		expect(split('```js\nconst a = 1\nconst b')).toEqual([
			{ kind: 'code', lang: 'js', tag: 'js', code: 'const a = 1\nconst b' },
		]);
	});

	test('tilde fences and longer backtick fences close by their own kind', () => {
		expect(split('~~~py\nx = 1\n~~~')).toEqual([
			{ kind: 'code', lang: 'py', tag: 'py', code: 'x = 1' },
		]);
		expect(split('````md\n```js\ninner\n```\n````')).toEqual([
			{ kind: 'code', lang: 'md', tag: 'md', code: '```js\ninner\n```' },
		]);
	});
});

describe('expandTabs', () => {
	test('tabs move to the next stop of four', () => {
		expect(expandTabs('\tx')).toBe('    x');
		expect(expandTabs('ab\t=')).toBe('ab  =');
		expect(expandTabs('abcd\t=')).toBe('abcd    =');
	});

	test('tab-aligned columns line up', () => {
		const [a, b] = expandTabs(
			'$this->username \t= 1;\n$this->oobRequest \t= 2;',
		).split('\n');

		expect(a?.indexOf('=')).toBe(b?.indexOf('='));
	});
});
