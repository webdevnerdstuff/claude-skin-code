// Builds hooks/vendor: Shiki's core and the highlighter in shiki.js, each grammar in langs/
// and each theme in themes/ beside it. The mod loader reads no file over 1 MB and no
// `import()`, so grammars and themes stay separate files, imported statically.
import { build } from 'esbuild';
import {
	copyFileSync,
	existsSync,
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
	'nginx',
	'php',
	'powershell',
	'python',
	'ruby',
	'rust',
	'sass',
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

await build({
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
});

console.log(
	`vendor built: shiki.js, ${seen.size} grammars, ${SHIKI_THEMES.length + NEON_BUNNY.length} themes`,
);
