# AGENTS.md

Guidance for AI agents and contributors working on this repository.

## What this is

`skin-code` is a Claude Code **mod**: a plugin of function hooks (`hooks/hooks.json` names one hooks module, `hooks/register.tsx`). It redraws fenced code blocks in assistant replies with Shiki, VS Code's grammars and VS Code themes. The repository is also its own marketplace (`.claude-plugin/marketplace.json`, source `./`).

The mod API is early access. Its declarations are the authority: Claude Code lays them in `.claude-plugin/types/claude-code/index.d.ts` each time it loads the plugin from this folder (git-ignored). Grep that file for an event or noun before using it.

## Layout

| Path | What |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifest; `version` is the release version |
| `.claude-plugin/marketplace.json` | Makes the repo installable with `/plugin install skin-code --marketplace webdevnerdstuff/claude-skin-code` |
| `hooks/register.tsx` | The hooks module: `engine.create` (adds `$.skinCode`), `skinCode.*`, `session.start`, `command.run`, `ui.render` on `AssistantMessage` |
| `hooks/fences.ts` | Splits a reply into prose and the fences skin-code draws; tab expansion |
| `hooks/settings.ts` | `/skin-code` parsing and answers: pure functions, tested directly |
| `hooks/card.ts` | The SVG card for `/skin-code style card` on the desktop, VS Code and mobile surfaces |
| `hooks/themes.ts` | skins skin name to `[dark, light]` theme pair |
| `hooks/vendor/` | **Generated** by `build/build.mjs`: `shiki.js`, `langs/*.mjs`, `themes/*.mjs`; `shiki.d.ts` is hand-written |
| `build/` | The vendor build: `entry.mjs` (the highlighter's source), `build.mjs`, `themes/*.json` (Neon Bunny sources) |
| `types/index.d.ts` | The plugin's contract: its `$.state` keys and `$.skinCode` |
| `tests/` | `claude plugin test` suites |

## Commands

```bash
pnpm build      # rebuild hooks/vendor after changing build/
pnpm validate   # claude plugin validate .
pnpm test           # claude plugin test .
pnpm check      # both
```

Run `pnpm check` before every commit. A type-check needs the types Claude Code lays when it loads the plugin: `claude --plugin-dir .` once, then `npx tsc -p .`.

## Rules the mod loader enforces

These are refused at load, so `validate` catches them; they shape the code:

- **No file over 1 MB** is read. Grammars and themes are separate files under `hooks/vendor/`, imported statically; never bundle them into one file.
- **No `import()`**: a module holding one does not load. Every import is a static `import` declaration.
- **No DOM and no Node** in the module's environment. Reach files, network, env and settings through `$` (`$.fs.read`, `$.http.fetch`, `$.env.get`, `$.config.list`).
- **`$` is spelled `$.noun.method(...)` at the call site**: never store `$.skins` or another noun in a variable.
- **`$.state.get` takes a literal reference** (`{ plugin: 'p', key: 'k' }` written inline or in a `const` of the same file), never one passed in as a parameter.
- **The type contract is self-contained**: `types/index.d.ts` has no `import`.
- **A render hook never writes state.** Write from `command.run`, `session.start` or a noun's event hook.

## Behaviour to keep

- **Leave alone** what skins or the app draw better: shell fences (the desktop's Run button), `diff`/`patch`, `mermaid`, `math`. `fences.ts` `LEFT_ALONE` lists them.
- **Unknown languages are still drawn**: a fence whose tag Shiki does not bundle, or with no tag, is a block in the theme's colours with no highlighting (`PLAIN` in `fences.ts`); the header keeps the tag as written.
- **The terminal names `Svg` in its element table but draws it as nothing.** Only use `Svg` when `e.surface !== 'terminal'`.
- **By default, code is drawn as `Text`, not as an `Svg`**, on every surface. An SVG row is only as wide as its glyphs, so a drag that ends past a line's end selects from the top of the block. Nothing offers `user-select`, so on the remote surfaces the line numbers are kept out of reach. They are the block's first child, an absolute Box placed by row under the head, so no drag between the header and the code passes over them. The code is a layer over them, an absolute Box later in the block (a desktop paints absolute Boxes over the flow, so a `relative` layer lies under them), padded on the left by their width, with an empty Box as tall as the code holding its room. The head, each number and each code line are whole rows (`height`), so the numbers line up. All of it sits in a plain Box inside the bordered block: a desktop insets a bordered Box's content (about a cell across, less down) but places an absolute child from its outer edge, so numbers placed in the bordered Box itself drift up and left, out from under the code. Keep padding and offsets in whole cells: half a cell of padding on the code layer made the numbers vanish on the desktop. Never lay numbers inside a code row (a selection across rows takes in every one between), and never draw them as `Svg`s (a browser highlights images in a selection). The terminal keeps the numbers a column beside the code.
- **`/skin-code style card` draws the desktop block as the SVG card** (`card.ts`), for its code font, which `Text` cannot set. The card's `Svg` is `isInteractive` (a frame; an image's text cannot be selected) and must stay pure SVG: the app strips a `<foreignObject>`, so HTML inside the card draws nothing. Each line is one `<text>` across the card, `pointer-events="bounding-box"`: unselectable padding (`.pad`, a size that fills the row) before the code, then after it a tall unselectable space under a selectable space at the code's size, both stretched to the card's edge. So a drag can start or end anywhere in a row, a highlight is as tall as the code, and a copy takes one trailing space per line. A drag ending in the gap between rows under the code, or outside the frame, still resolves to the card's top: SVG text is hit by its glyphs. The copy control's icon is drawn by `register.tsx` over the card, never in it: a new card drawing reloads its frame, a visible flash.
- **PHP**: VS Code scopes a `.php` file under `text.html.php`; Shiki's grammar starts at `source.php`. `withPhpTwins` in `build/entry.mjs` copies each `text.html.php` rule under `source.php`, and `phpTags` draws `<?php` as one token. Keep both for every theme, bundled or added.
- **skins is optional.** Read its state (`skins.prefs`, `skins.custom`, `skins.isLight`) inside `try`; call `$.skins.markdown` inside `try` and fall back to the `Markdown` element.
- **Fences follow CommonMark**: a closer is the same character, at least as long, alone on its line; a fence-looking line inside another fence is body text.

## Adding a theme to the bundle

1. Shiki bundles it: add its name to `SHIKI_THEMES` in `build/build.mjs`. Otherwise drop its VS Code `.json` in `build/themes/` and add its file name to `NEON_BUNNY` (or a new list beside it) in `build/build.mjs`.
2. If it fits a skins skin, map the skin in `hooks/themes.ts` (`[dark, light]`; use the dark theme twice when there is no light one).
3. `pnpm build`, then `pnpm check`.
4. If the bundle's theme count changed, update it in `README.md`. Release notes come from PR titles, so give the PR a clear one.

## Adding a language

Add its Shiki grammar id to `LANGS` in `build/build.mjs` and rebuild; the build copies the grammars it embeds. Check no file under `hooks/vendor/langs/` passes 1 MB.

## Tests

- Pure logic (`settings.ts`, `fences.ts`) is tested by importing it directly.
- Rendering and commands go through the engine: `$.ui.mount({ plugin: 'skin-code', surface, component: 'AssistantMessage', props })` and `$.command.run({ command: 'skin-code', args })`.
- The test kit answers nothing beneath the plugin by itself: give each test `mock.store(on)`, `mock.env(on, {...})`, and answer `config.list` and `http.fetch` with `on(event, () => ({ value }))`. The `world()` helper in `tests/render.test.tsx` does this.
- Shiki writes colours in upper case (`#ABCDEF`); bundled theme files keep their own case.

## Style

- Comments say what the code holds or why, in plain sentences; no restating the code.
- No `else` after a `return`.
- Named exports; `register` is the hooks module's entry.

## Git

- **Never commit** without an explicit "commit this".
- **AI attribution is welcome.** A commit an AI agent helped write ends with its co-author trailer, e.g. `Co-Authored-By: Claude <noreply@anthropic.com>`, so it is credited in the contributors list.
- Commit messages: short and imperative.

## Releases

- Bump `version` in `.claude-plugin/plugin.json` and `package.json` in the PR that changes behaviour: `claude plugin update` compares it.
- After merging: tag `vX.Y.Z` on `main`, push the tag, and create a GitHub Release with generated notes (`gh release create vX.Y.Z --generate-notes`). There is no CHANGELOG file; the Releases page is the history.
