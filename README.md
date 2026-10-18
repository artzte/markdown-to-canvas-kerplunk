# kerplunk

Compiles Markdown (`.md`) course material into plain, semantic HTML you can paste into
the Canvas rich-text editor. By default there is no styling of its own: no wrapper, classes, or inline
styles, so the institution's Canvas theme styles the page like any other.

Along the way it:

- strips the markup pandoc adds that Canvas doesn't need (section wrappers, its own classes, unused ids,
  default-valued attributes, bare spans) and turns task-list checkboxes into ☐ / ☑
- adds a `#` permalink after each h2–h6 heading, so you can right-click → copy a link to that section
  (always visible: Canvas strips the `<style>` a hover effect would need; `--no-anchors` turns it off)
- fixes tables for accessibility (`<caption>` from a following `: Caption` paragraph or the headers, `scope` on `<th>`)
- simplifies code blocks to a plain `<pre>` (no pandoc line anchors or highlighting spans)
- rewrites relative links against a `baseUrl`, so `../week2/notes.md` points at the published repo
- builds a Canvas QTI `.zip` for any `*-quiz.md` / `*_quiz.md` / `quiz*.md` file
- optionally writes a PDF (styled, via wkhtmltopdf if installed, opt-in with `--pdf`)

Derived from [Living Syllabus](https://github.com/ryanncode/living-syllabus) by Ryan N.

## Requirements

- Node.js 18+
- [pandoc](https://pandoc.org/installing.html) on `PATH`
  - Linux: `sudo apt install pandoc`
  - macOS: `brew install pandoc`
  - Windows: `winget install JohnMacFarlane.Pandoc` (or `choco install pandoc` / `scoop install pandoc`)
- optional: `wkhtmltopdf` for PDFs that match the theme (`sudo apt install wkhtmltopdf` or `winget install wkhtmltopdf`)

## Install

```bash
npm install
npm run install-cli   # bundles to dist/kerplunk and installs to user PATH (~/.local/bin)
```

Alternatively, link globally via npm (creates native Windows `.cmd`/`.ps1` wrappers or Unix symlinks):
```bash
npm link
```

## Usage

```bash
kerplunk modules/week2/week2-reading.md        # Canvas HTML next to the source
kerplunk modules/week2/week2-reading.md --pdf  # Canvas HTML + styled PDF
kerplunk modules -o dist/                      # whole folder, mirrored into dist/
kerplunk syllabus.md --theme artzt.css         # opt in to an inlined theme
kerplunk --list-themes                         # list sample starter themes
kerplunk --help
```

### Themes (optional)

By default, kerplunk outputs plain, semantic HTML styled directly by your Canvas theme.

If you specify a theme, its CSS is inlined onto each element and the output is wrapped in `<div class="kerplunk">`. Themes can be set via:
1. CLI option: `--theme <path>` (e.g. `--theme artzt.css` or `--theme ./themes/water.css`), resolved relative to the current working directory (`process.cwd()`).
2. Config file: `"theme": "artzt.css"` in `kerplunk.config.json` (or `.kerplunkrc` / `package.json`), resolved relative to the folder containing the config file.

Starter sample stylesheets are provided in the `themes/` folder (view with `kerplunk --list-themes`). You can copy any sample theme into your course folder and customize it.

### Base URL

Relative links are rewritten when a base URL is known. In priority order:

1. `--base-url <url>`
2. `KERPLUNK_BASE_URL`
3. the nearest `package.json` with `kerplunk.baseUrl`, `baseUrl`, or `baseURL`
4. the nearest `.kerplunkrc` or `kerplunk.config.json` with `baseUrl`

The search walks up from the input and stops at the git root. Links resolve relative to the folder
containing that config.

### Project Configuration (`kerplunk.config.json`)

You can create a `kerplunk.config.json` (or `.kerplunkrc` or in `package.json` under `"kerplunk"`) in your course root:

```json
{
  "theme": "artzt.css",
  "baseUrl": "https://username.github.io/my-course",
  "formats": ["html", "pdf"]
}
```

- **`theme`**: default theme CSS to inline.
- **`baseUrl`**: base URL to rewrite relative links against.
- **`formats`**: default outputs to generate (e.g. `["html"]`, `["html", "pdf"]`, or `["pdf"]`). CLI flags (`--pdf`, `--pdf-only`, `--html-only`) override this setting.

## Library

```js
const { build, renderHtml, loadTheme } = require('kerplunk');
await build('modules', { theme: 'artzt.css', outDir: 'dist', formats: ['html'] });
```

## Development

```bash
npm test
npm run bundle
```
