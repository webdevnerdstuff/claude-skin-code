# Changelog

## 0.1.0

First release.

- Code blocks in replies tokenized by Shiki with VS Code's grammars and drawn in VS Code themes: SVG cards on the desktop, VS Code and mobile; framed rows on the terminal
- 29 themes: Neon Bunny, Neon Bunny Carrot and 27 Shiki themes, dark and light
- `auto` follows the active skins skin and its light or dark mode; skins is optional
- `/skin-code` with `auto`, `off`, `list`, `add <url or path>`, `remove <name>`, a skin or a theme; the setting and added themes persist
- `$.skinCode.addTheme` and `$.skinCode.themes` for other mods
- 39 languages; PHP drawn as VS Code draws it (`text.html.php` theme rules, `<?php` as one token)
- Tabs expand to stops of four, so tab-aligned columns line up
- `/skin-code header on|off` and `/skin-code numbers on|off` for the block's header bar and line numbers
- `/skin-code list` as a table of skins and their dark and light themes, your own skins included
