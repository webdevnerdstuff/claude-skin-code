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
| `hooks/card.ts` | The SVG code card for the desktop, VS Code and mobile surfaces |
| `hooks/settings.ts` | `/skin-code` parsing and answers: pure functions, tested directly |
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

- **Leave alone** what skins or the app draw better: shell fences (the desktop's Run button), `diff`, `mermaid`, `math`, unknown languages. `fences.ts` `LEFT_ALONE` lists them.
- **The terminal names `Svg` in its element table but draws it as nothing.** Only use `Svg` when `e.surface !== 'terminal'`.
- **PHP**: VS Code scopes a `.php` file under `text.html.php`; Shiki's grammar starts at `source.php`. `withPhpTwins` in `build/entry.mjs` copies each `text.html.php` rule under `source.php`, and `phpTags` draws `<?php` as one token. Keep both for every theme, bundled or added.
- **skins is optional.** Read its state (`skins.prefs`, `skins.custom`, `skins.isLight`) inside `try`; call `$.skins.markdown` inside `try` and fall back to the `Markdown` element.
- **Fences follow CommonMark**: a closer is the same character, at least as long, alone on its line; a fence-looking line inside another fence is body text.

## Adding a theme to the bundle

1. Shiki bundles it: add its name to `SHIKI_THEMES` in `build/build.mjs`. Otherwise drop its VS Code `.json` in `build/themes/` and add its file name to `NEON_BUNNY` (or a new list beside it) in `build/build.mjs`.
2. If it fits a skins skin, map the skin in `hooks/themes.ts` (`[dark, light]`; use the dark theme twice when there is no light one).
3. `pnpm build`, then `pnpm check`.
4. Note it in `README.md` (the per-skin table). Release notes come from PR titles, so give the PR a clear one.

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
