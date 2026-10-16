import type { ThemedToken } from './vendor/shiki';

// A code block as a vector card for the surfaces that draw Svg: the theme's own background,
// a header with the language and line count, line numbers, and each token in its colour.
// The header and the numbers can be left out.

export type Colors = { background: string; foreground: string; gutter: string };

export type CardOptions = {
	header: boolean;
	numbers: boolean;
	// A copy control is laid over the card's top right; the card keeps room for it. Its
	// icon is drawn by the control, not the card: the card is a frame, and a new drawing of
	// it on each copy would reload the frame, a visible flash.
	hasControl: boolean;
};

const MONO = `ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace`;
const FONT = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Inter, sans-serif`;
// Where the copy control, laid one text row down, centres in the image, in pixels. Rows
// come in whole cells, so the card starts INSET below the image's top (a transparent strip)
// to put that line at the middle of a compact header; without a header the first line of
// code sits on it.
const CONTROL_MID = 29;
const INSET = 10;
const LINE_MID = CONTROL_MID - INSET;
const HEADER_H = LINE_MID * 2;
const LINE_H = 20;
// The padding's size: a monospace cell this size is about a row tall.
const PAD = 22;
const CODE = 12.5;
const RADIUS = 12;
const MAX_SOURCE = 131072;

// Room on the card's right for the copy control laid over it.
export const CONTROL_SLOT = 40;

// Space above the first line when there is no header: its middle on the control's line.
const BARE_TOP = LINE_MID - 10;

export const MAX_LINES = 80;

const escape = (text: string): string =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

export const cardWidth = (columns: number): number =>
	Math.round(Math.min(1600, Math.max(480, columns * 6.4)));

function spansOf(
	tokens: readonly ThemedToken[],
	maxChars: number,
	foreground: string,
): string {
	let room = maxChars;
	const spans: string[] = [];

	for (const token of tokens) {
		if (room <= 0) {
			break;
		}

		const chars = [...token.content];
		const text =
			chars.length > room
				? `${chars.slice(0, Math.max(0, room - 1)).join('')}…`
				: token.content;
		const style = token.fontStyle ?? 0;
		const extra = `${style & 1 ? ';font-style:italic' : ''}${style & 2 ? ';font-weight:600' : ''}${style & 4 ? ';text-decoration:underline' : ''}`;

		room -= chars.length;
		spans.push(
			`<tspan style="fill:${token.color ?? foreground}${extra}">${escape(text)}</tspan>`,
		);
	}

	return spans.join('');
}

// Where the first line's box starts, and the card's height for `kept` lines of `total`.
const topOf = (header: boolean): number => (header ? HEADER_H + 8 : BARE_TOP);

const heightOf = (header: boolean, kept: number, total: number): number =>
	topOf(header) + kept * LINE_H + (total > kept ? 28 : 10);

function draw(
	lines: readonly (readonly ThemedToken[])[],
	lang: string,
	colors: Colors,
	width: number,
	shown: number,
	{ header, numbers, hasControl }: CardOptions,
): string {
	const { background, foreground, gutter } = colors;
	const kept = lines.slice(0, shown);
	const gutterW = numbers ? String(lines.length).length * 8 + 24 : 16;
	// Without a header the copy control sits beside the code, so lines stop short of it.
	const reserve = !header && hasControl ? CONTROL_SLOT : 0;
	const maxChars = Math.floor((width - gutterW - 24 - reserve) / (CODE * 0.6));
	const hidden = lines.length - kept.length;
	const top = topOf(header);
	const height = heightOf(header, kept.length, lines.length);
	const clip = `skin-code-${width}x${height}`;
	const mid = LINE_MID + 4;

	// Each line is one <text> across the whole card: unselectable padding before the code
	// (over the numbers) and after it, at PAD size so the line is as tall as its row. A drag
	// that ends anywhere in a row lands on that row, never on the drawing beneath.
	const lead = ' '.repeat(Math.ceil(gutterW / (PAD * 0.6)));
	const rows = kept.map((tokens, i) => {
		const y = top + i * LINE_H + 14;
		const number = numbers
			? `<text class="chrome" x="${gutterW - 12}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="11" style="fill:${gutter}">${i + 1}</text>`
			: '';

		// After the code, two spaces stretched to the card's edge, one over the other: a tall
		// unselectable one that fills the row, so a drag ending in the gap between rows lands
		// on it, and a selectable one at the code's size, so a drag can start right of a line
		// and the highlight is as tall as the code's. A copy takes that single space, no more.
		const chars = Math.min(maxChars, tokens.reduce((n, token) => n + [...token.content].length, 0));
		const end = gutterW + chars * CODE * 0.6;
		const room = Math.max(1, width - end);

		return `${number}<text x="0" y="${y}" font-family="${MONO}" font-size="${CODE}" xml:space="preserve" pointer-events="bounding-box"><tspan class="pad" font-size="${PAD}">${lead}</tspan><tspan x="${gutterW}">${spansOf(tokens, maxChars, foreground)}</tspan><tspan class="pad" x="${end}" font-size="${PAD}" textLength="${room}" lengthAdjust="spacingAndGlyphs"> </tspan><tspan x="${end}" textLength="${room}" lengthAdjust="spacingAndGlyphs"> </tspan></text>`;
	});
	const footer =
		hidden > 0
			? `<text class="chrome" x="${gutterW}" y="${top + kept.length * LINE_H + 14}" font-size="11.5" style="fill:${gutter}">${hidden} more line${hidden === 1 ? '' : 's'} (copy takes all of it)</text>`
			: '';
	const head = header
		? [
				`<text class="chrome" x="16" y="${mid}" font-size="11" style="fill:${gutter};letter-spacing:.1em;font-weight:600">${escape(lang.toUpperCase())}</text>`,
				`<text class="chrome" x="${width - 16 - (hasControl ? CONTROL_SLOT : 0)}" y="${mid}" text-anchor="end" font-size="11" style="fill:${gutter}">${lines.length} line${lines.length === 1 ? '' : 's'}</text>`,
				`<line x1="0" y1="${HEADER_H - 0.5}" x2="${width}" y2="${HEADER_H - 0.5}" stroke="${gutter}" stroke-opacity=".35"/>`,
			].join('')
		: '';

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + INSET}" viewBox="0 0 ${width} ${height + INSET}">`,
		`<defs><clipPath id="${clip}"><rect width="${width}" height="${height}" rx="${RADIUS}"/></clipPath></defs>`,
		`<style>text{fill:${foreground}}text:not([font-family]){font-family:${FONT}}.chrome,.pad{-webkit-user-select:none;user-select:none}</style>`,
		`<g transform="translate(0 ${INSET})">`,
		`<g clip-path="url(#${clip})">`,
		`<rect width="${width}" height="${height}" fill="${background}"/>`,
		head,
		rows.join(''),
		footer,
		`</g>`,
		`<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="${RADIUS - 0.5}" fill="none" stroke="${foreground}" stroke-opacity=".16"/>`,
		`</g>`,
		`</svg>`,
	].join('');
}

// The card at most MAX_LINES long, and shorter while its markup runs past the Svg limit.
export function codeCard(
	lines: readonly (readonly ThemedToken[])[],
	lang: string,
	colors: Colors,
	width: number,
	options: CardOptions,
) {
	let shown = MAX_LINES;
	let source = draw(lines, lang, colors, width, shown, options);

	while (source.length > MAX_SOURCE && shown > 10) {
		shown = Math.floor(shown * 0.7);
		source = draw(lines, lang, colors, width, shown, options);
	}

	const kept = Math.min(shown, lines.length);

	return {
		source,
		width,
		height: INSET + heightOf(options.header, kept, lines.length),
	};
}
