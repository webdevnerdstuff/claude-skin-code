import { resolveLang } from './vendor/shiki';

// A reply split on the fences skin-code draws: everything else stays text for skins or the
// app to draw.

export type Segment =
	| { kind: 'text'; text: string }
	| { kind: 'code'; lang: string; tag: string; code: string };

// Fences these tags open are left alone: shell keeps the desktop's Run button, and
// diagrams, formulas and diffs have cards of their own in skins.
const LEFT_ALONE = new Set([
	'bash',
	'sh',
	'shell',
	'zsh',
	'fish',
	'cmd',
	'bat',
	'shellscript',
	'console',
	'mermaid',
	'math',
	'diff',
	'patch',
]);

// A fence in a language skin-code does not bundle, or with none named, is still its block:
// the theme's colours, with no highlighting.
const PLAIN = 'text';

const OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;

// The reply's segments, or null when it holds no fence skin-code draws. An unclosed fence
// (a reply still streaming) runs to the end.
export function split(text: string): Segment[] | null {
	const lines = text.split('\n');
	const segments: Segment[] = [];
	let prose: string[] = [];
	let isDrawn = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const open = OPEN.exec(line);
		const tag = open?.[2] ?? '';
		const lang = open === null ? undefined : (resolveLang(tag) ?? PLAIN);

		if (
			open === null ||
			lang === undefined ||
			LEFT_ALONE.has(tag.toLowerCase()) ||
			LEFT_ALONE.has(lang)
		) {
			prose.push(line);

			// A fence left alone keeps its body as text, so a fence-looking line inside it is not read as an opener.
			if (open !== null) {
				const close = closerOf(open[1] ?? '```');
				let end = i + 1;

				while (end < lines.length && !close.test(lines[end] ?? '')) {
					end++;
				}

				prose.push(...lines.slice(i + 1, end + 1));
				i = end;
			}

			continue;
		}

		const close = closerOf(open[1] ?? '```');
		let end = i + 1;

		while (end < lines.length && !close.test(lines[end] ?? '')) {
			end++;
		}

		if (prose.length > 0) {
			segments.push({ kind: 'text', text: prose.join('\n') });
			prose = [];
		}

		segments.push({
			kind: 'code',
			lang,
			tag,
			code: lines.slice(i + 1, end).join('\n'),
		});
		isDrawn = true;
		i = end;
	}

	if (prose.length > 0) {
		segments.push({ kind: 'text', text: prose.join('\n') });
	}

	return isDrawn ? segments : null;
}

// Whether skin-code draws a reply under the /skin-code setting `mode`: the render hook's own
// test, answered to other mods by `$.skinCode.draws`.
export function drawsReply(text: string, mode: string): boolean {
	return mode !== 'off' && split(text) !== null;
}

function closerOf(fence: string): RegExp {
	return new RegExp(
		`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`,
	);
}

// Tabs to the next stop, as an editor lays them, so tab-aligned columns line up.
export function expandTabs(code: string, size = 4): string {
	return code
		.split('\n')
		.map((line) => {
			let out = '';

			for (const char of line) {
				out += char === '\t' ? ' '.repeat(size - (out.length % size)) : char;
			}

			return out;
		})
		.join('\n');
}
