// Builds hooks/vendor: Shiki's core and the highlighter in shiki.js, each grammar in langs/
// and each theme in themes/ beside it. The mod loader reads no file over 1 MB and no
// `import()`, so grammars and themes stay separate files, imported statically.
import { build } from 'esbuild';
import {
	copyFileSync,
	existsSync,
	readdirSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, '..', 'hooks', 'vendor');
const shikijs = join(here, 'node_modules', '@shikijs');

// Fence languages: web and PHP first, then the common rest.
const LANGS = [
	'astro',
	'blade',
	'c',
	'cpp',
	'csharp',
	'css',
	'diff',
	'dockerfile',
	'go',
	'graphql',
	'hcl',
	'html',
	'ini',
	'java',
	'javascript',
	'json',
	'jsonc',
	'jsx',
	'kotlin',
	'less',
	'lua',
	'make',
	'markdown',
	'php',
	'powershell',
	'python',
	'ruby',
	'rust',
	'scss',
	'shellscript',
	'sql',
	'svelte',
	'swift',
	'toml',
	'tsx',
	'typescript',
	'vue',
	'xml',
	'yaml',
];

// Shiki's bundled themes: one dark and, where it exists, one light per skins skin.
const SHIKI_THEMES = [
	'ayu-dark',
	'ayu-light',
	'catppuccin-latte',
	'catppuccin-mocha',
	'dracula',
	'everforest-dark',
	'everforest-light',
	'github-dark',
	'github-light',
	'gruvbox-dark-medium',
	'gruvbox-light-medium',
	'kanagawa-lotus',
	'kanagawa-wave',
	'min-dark',
	'min-light',
	'night-owl',
	'night-owl-light',
	'nord',
	'one-dark-pro',
	'one-light',
	'rose-pine',
	'rose-pine-dawn',
	'solarized-dark',
	'solarized-light',
	'tokyo-night',
	'vitesse-black',
	'vitesse-light',
];

// The Neon Bunny family, from github.com/webdevnerdstuff/neon-bunny-vscode-theme.
// File name to the name /skin-code shows; the files' own names are not consistent.
const NEON_BUNNY_NAMES = {
	'neon-bunny': 'Neon Bunny',
	'neon-bunny-carrot': 'Neon Bunny Carrot',
};
const NEON_BUNNY = Object.keys(NEON_BUNNY_NAMES);

const camel = (name) =>
	name
		.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase())
		.replace(/^(\d)/, '_$1');

// The sources come from build/node_modules: stop before clearing hooks/vendor when they are missing.
for (const pkg of ['langs', 'themes']) {
	if (!existsSync(join(shikijs, pkg, 'dist'))) {
		throw new Error(
			`@shikijs/${pkg} is not installed: run pnpm build from the repository root`,
		);
	}
}

for (const folder of ['langs', 'themes']) {
	rmSync(join(vendor, folder), { recursive: true, force: true });
	mkdirSync(join(vendor, folder), { recursive: true });
}

// Each grammar and the grammars it embeds.
const seen = new Set();
const todo = [...LANGS];

while (todo.length > 0) {
	const name = todo.pop();

	if (seen.has(name)) {
		continue;
	}

	seen.add(name);
	const file = join(shikijs, 'langs', 'dist', `${name}.mjs`);
	todo.push(
		...[
			...readFileSync(file, 'utf8').matchAll(
				/from '\.\/([a-z0-9-]+)\.mjs'/g,
			),
		].map((match) => match[1]),
	);
	copyFileSync(file, join(vendor, 'langs', `${name}.mjs`));
}

for (const name of SHIKI_THEMES) {
	copyFileSync(
		join(shikijs, 'themes', 'dist', `${name}.mjs`),
		join(vendor, 'themes', `${name}.mjs`),
	);
}

// The Neon Bunny themes as modules: comments and trailing commas dropped, named by file.
for (const name of NEON_BUNNY) {
	const raw = readFileSync(join(here, 'themes', `${name}.json`), 'utf8');
	const theme = JSON.parse(
		raw.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'),
	);
	writeFileSync(
		join(vendor, 'themes', `${name}.mjs`),
		`export default Object.freeze(${JSON.stringify({ ...theme, name, displayName: NEON_BUNNY_NAMES[name], type: theme.type ?? 'dark' })})\n`,
	);
}

// The two lists the highlighter loads, as static imports.
const listModule = (folder, names) =>
	`${names.map((name) => `import ${camel(name)} from './${folder}/${name}.mjs'`).join('\n')}\n\nexport const ${folder} = [${names.map(camel).join(', ')}]\n`;

writeFileSync(join(here, 'langs.mjs'), listModule('langs', LANGS));
writeFileSync(
	join(here, 'themes.mjs'),
	listModule('themes', [...NEON_BUNNY, ...SHIKI_THEMES]),
);

const bundled = await build({
	entryPoints: [join(here, 'entry.mjs')],
	bundle: true,
	format: 'esm',
	platform: 'neutral',
	mainFields: ['module', 'main'],
	minify: true,
	legalComments: 'none',
	external: ['./langs/*', './themes/*'],
	outfile: join(vendor, 'shiki.js'),
	// The plugin's tsconfig extends types Claude Code lays at load; the bundle needs none of it.
	tsconfigRaw: '{}',
	logLevel: 'warning',
	metafile: true,
});

// THIRD_PARTY_NOTICES.md: the licence of every package bundled into shiki.js, and of every
// grammar and theme copied into hooks/vendor, taken from the packages' own LICENSE files and
// from the notices tm-grammars and tm-themes keep for their upstream sources.
const packageOf = (input) => {
	const parts = input.split('node_modules/').pop().split('/');

	return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
};
const packageDir = (input, name) =>
	join(
		here,
		input.slice(0, input.lastIndexOf(`node_modules/${name}/`)),
		'node_modules',
		name,
	);
const libraries = new Map();

for (const input of Object.keys(bundled.metafile.inputs)) {
	if (!input.includes('node_modules/')) {
		continue;
	}

	const name = packageOf(input);

	if (!libraries.has(name)) {
		libraries.set(name, packageDir(input, name));
	}
}

const licenceText = (dir) => {
	const file = readdirSync(dir).find((entry) => /^licen[cs]e/i.test(entry));

	return file === undefined
		? undefined
		: readFileSync(join(dir, file), 'utf8').trim();
};

// tm-grammars' and tm-themes' NOTICE files: one section per upstream source, naming its files.
const sectionsOf = (notice) =>
	readFileSync(notice, 'utf8')
		.split(/\n=+\n/)
		.slice(1)
		.map((section) => {
			const files = /^Files:\s+(.+)$/m.exec(section)?.[1] ?? '';

			return {
				files: files
					.split(/,\s*/)
					.map((file) => file.replace(/\.json$/, '')),
				text: section.trim(),
			};
		});
const noticesFor = (notice, names) => {
	const sections = sectionsOf(notice);
	const covered = new Set();
	const kept = sections.filter((section) => {
		const hits = section.files.filter((file) => names.includes(file));

		hits.forEach((file) => covered.add(file));

		return hits.length > 0;
	});

	return { kept, missing: names.filter((name) => !covered.has(name)).sort() };
};

const grammarNames = [...seen].sort();
const grammars = noticesFor(
	join(here, 'node_modules', 'tm-grammars', 'NOTICE'),
	grammarNames,
);
const themes = noticesFor(
	join(here, 'node_modules', 'tm-themes', 'NOTICE'),
	[...SHIKI_THEMES].sort(),
);
const fence = (text) => ['```text', text, '```'].join('\n');

writeFileSync(
	join(here, '..', 'THIRD_PARTY_NOTICES.md'),
	[
		'# Third-party notices',
		'',
		'skin-code bundles code by other authors in `hooks/vendor/`. Each part keeps its own licence, set out below. `build/build.mjs` writes this file; do not edit it by hand.',
		'',
		'## Libraries bundled into `hooks/vendor/shiki.js`',
		'',
		...[...libraries]
			.sort(([a], [b]) => a.localeCompare(b))
			.flatMap(([name, dir]) => {
				const meta = JSON.parse(
					readFileSync(join(dir, 'package.json'), 'utf8'),
				);
				const text = licenceText(dir);

				return [
					`### ${name} ${meta.version} (${meta.license ?? 'see licence'})`,
					'',
					text === undefined
						? 'No licence file shipped; see the package.'
						: fence(text),
					'',
				];
			}),
		'## Grammars in `hooks/vendor/langs/`',
		'',
		'From Shiki (`@shikijs/langs`, MIT), which collects them from their upstream projects; their licences, as tm-grammars records them:',
		'',
		...grammars.kept.flatMap((section) => [fence(section.text), '']),
		...(grammars.missing.length === 0
			? []
			: [
					`No notice recorded by tm-grammars (an alias of a grammar above, or a source that states no licence; Shiki redistributes these too): ${grammars.missing.join(', ')}.`,
					'',
				]),
		'## Themes in `hooks/vendor/themes/`',
		'',
		'From Shiki (`@shikijs/themes`, MIT), which collects them from their upstream projects; their licences, as tm-themes records them:',
		'',
		...themes.kept.flatMap((section) => [fence(section.text), '']),
		...(themes.missing.length === 0
			? []
			: [`No notice recorded: ${themes.missing.join(', ')}.`, '']),
		'The Neon Bunny themes (`neon-bunny`, `neon-bunny-carrot`) are by WebDevNerdStuff, from https://github.com/webdevnerdstuff/neon-bunny-vscode-theme.',
		'',
	].join('\n'),
);

console.log(
	`vendor built: shiki.js, ${seen.size} grammars, ${SHIKI_THEMES.length + NEON_BUNNY.length} themes; notices for ${libraries.size} libraries`,
);
