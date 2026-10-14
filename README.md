<h1 align="center">
	<picture>
		<source media="(prefers-color-scheme: dark)" srcset="docs/brand/banner-dark.svg">
		<img alt="skin-code" src="docs/brand/banner-light.svg" width="720">
	</picture>
</h1>

Real syntax highlighting for code blocks in Claude Code replies. skin-code tokenizes each fenced block with **VS Code's own grammars** through [Shiki](https://shiki.style) and colours it with **VS Code themes**, so code in Claude Code looks the way it does in your editor.

- 29 themes bundled, dark and light, including [Neon Bunny](https://github.com/webdevnerdstuff/neon-bunny-vscode-theme) and Neon Bunny Carrot
- Add any VS Code theme `.json` from a URL or a file: `/skin-code add <url or path>`
- Follows the [skins](https://github.com/hellosverre/claude-skins) mod when it is installed: change your skin and the code colours change with it, light or dark
- 39 languages, with PHP, Blade, Vue, TypeScript and JavaScript first among them
- Desktop app: each block is a card with the theme's background, line numbers, the language and a copy button; the header and numbers can be switched off
- Terminal: framed rows in the theme's colours, with the language on the frame and, in Claude Code's fullscreen layout, a Copy button
- An API so other mods can ship their own themes

## Install

In a Claude Code terminal session:

```bash
/plugin install skin-code --marketplace webdevnerdstuff/claude-skin-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session, the desktop app's included).

Needs Claude Code 2.1.287 or newer, the version the tests run on (the function-hooks mod API is early access and may change between releases). skins is optional.

## Use

| Command | What it does |
| --- | --- |
| `/skin-code` | Shows the current setting and the theme drawing now |
| `/skin-code auto` | Follows your skins skin, light or dark (the default) |
| `/skin-code <skin>` | A skin's theme pair, switching with light and dark, e.g. `/skin-code catppuccin` |
| `/skin-code <theme>` | One theme, always, e.g. `/skin-code github-dark` |
| `/skin-code off` | Leaves code blocks to skins or the app |
| `/skin-code list` or `themes` | Lists every skin pair and theme |
| `/skin-code help` | Lists the commands |
| `/skin-code add <url or path>` | Adds a VS Code theme `.json`; a GitHub file link works as is |
| `/skin-code remove <name>` | Removes a theme you added |
| `/skin-code header on\|off` | Shows or hides the bar with the language and line count |
| `/skin-code numbers on\|off` | Shows or hides the line numbers |

The setting, the header and numbers choices, and the themes you add are kept across sessions.

### Themes per skin

| Skin | Dark | Light |
| --- | --- | --- |
| `neon-bunny` (default) | Neon Bunny | Neon Bunny |
| `neon-bunny-carrot` | Neon Bunny Carrot | Neon Bunny Carrot |
| `ayu` | Ayu Dark | Ayu Light |
| `catppuccin` | Catppuccin Mocha | Catppuccin Latte |
| `dracula` | Dracula | Dracula |
| `everforest` | Everforest Dark | Everforest Light |
| `github` | GitHub Dark | GitHub Light |
| `gruvbox` | Gruvbox Dark Medium | Gruvbox Light Medium |
| `kanagawa` | Kanagawa Wave | Kanagawa Lotus |
| `mono` | Min Dark | Min Light |
| `night-owl` | Night Owl | Night Owl Light |
| `noir` | Vitesse Black | Vitesse Light |
| `nord` | Nord | Nord |
| `one-dark` | One Dark Pro | One Light |
| `rose-pine` | Rosé Pine | Rosé Pine Dawn |
| `solarized` | Solarized Dark | Solarized Light |
| `tokyo-night` | Tokyo Night | Tokyo Night |

A skin you made in skins uses its own name's pair when there is one, else the pair of the skin it was based on. Without skins, `auto` draws Neon Bunny.

Every theme is also available on its own by name, e.g. `/skin-code catppuccin-latte` stays light whatever the mode.

On the desktop a card carries its theme's background, so a dark theme reads in a light app. On the terminal the code sits on the terminal's background, so a theme of the wrong lightness gives way to GitHub Dark or GitHub Light.

### Light and dark

With skins installed, skin-code uses skins' answer (Claude Code's theme, the terminal, then the system's appearance). Without it, skin-code reads Claude Code's `theme` setting. Set `SKIN_CODE_THEME=light` or `dark` to force one.

### What it leaves alone

- `bash`, `sh`, `zsh` and `shell` fences: the desktop app's own block keeps its Run button
- `diff`, `mermaid` and `math` fences: skins draws those as cards of their own
- Languages it does not bundle, and everything outside fences: drawn by skins, or by the app

## Add your own theme

Any VS Code color theme works: the `.json` file a theme extension ships in its `themes/` folder.

```bash
/skin-code add https://github.com/you/your-theme/blob/main/themes/your-theme.json
/skin-code your-theme
```

A local file works too: `/skin-code add ~/themes/your-theme.json`. The name comes from the theme's `name`, lower-cased with dashes.

### From another mod

skin-code adds `$.skinCode` for other mods, the way skins adds `$.skins`:

```ts
// In your mod's session.start hook:
const name = await $.skinCode.addTheme({
  theme: myVsCodeTheme,   // a VS Code theme object
  skin: 'my-skin',        // optional: use it for this skins skin
  lightness: 'dark',      // optional: which half of that skin's pair; from the theme's `type` when left out
})

const all = await $.skinCode.themes()
```

A theme added this way lasts for the session; call it from `session.start`. Its types are in [`types/index.d.ts`](types/index.d.ts).

### Into the bundle

To ship a theme with skin-code itself, open a pull request: add its `.json` under `build/themes/` (or its Shiki name to `SHIKI_THEMES` in `build/build.mjs`), map a skin to it in `hooks/themes.ts` if one fits, and rebuild. See [AGENTS.md](AGENTS.md).

## How it works

A `ui.render` hook on assistant messages splits each reply on its fences. Text between fences goes to skins (`$.skins.markdown`) or the app's own markdown; each fence in a bundled language is tokenized by Shiki with the JavaScript regex engine and drawn as an SVG card on the desktop or as coloured rows on the terminal.

VS Code wraps a `.php` file in a `text.html.php` scope that Shiki's PHP grammar does not have, so theme rules written for it never match. skin-code copies each such rule under `source.php`, and draws `<?php` as one token, so PHP looks as it does in VS Code.

## Develop

```bash
pnpm build     # bundles Shiki, the grammars and the themes into hooks/vendor
pnpm validate  # claude plugin validate .
pnpm test      # claude plugin test .
```

Load it from the folder while you work on it: `claude --plugin-dir .`. More in [AGENTS.md](AGENTS.md).

## Credits

- [Shiki](https://shiki.style) and the TextMate grammars and themes it bundles
- [skins](https://github.com/hellosverre/claude-skins) by hellosverre, which skin-code follows and draws prose through
- Neon Bunny themes by [WebDevNerdStuff](https://github.com/webdevnerdstuff/neon-bunny-vscode-theme)

## License

MIT © WebDevNerdStuff. The bundled Shiki code, grammars and themes keep their own licences: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
