# kerplunk

Compiles Markdown (`.md`) and Word (`.docx`) course material into plain, semantic HTML you can paste into
the Canvas rich-text editor. By default there is no styling of its own: no wrapper, classes, or inline
styles, so the institution's Canvas theme styles the page like any other.

Along the way it:

- strips the markup pandoc adds that Canvas doesn't need (section wrappers, its own classes, unused ids,
  default-valued attributes, bare spans) and turns task-list checkboxes into ☐ / ☑
- fixes tables for accessibility (`<caption>` from a following `: Caption` paragraph or the headers, `scope` on `<th>`)
- simplifies code blocks to a plain `<pre>` (no pandoc line anchors or highlighting spans)
- rewrites relative links against a `baseUrl`, so `../week2/notes.md` points at the published repo
- builds a Canvas QTI `.zip` for any `*-quiz.md` / `*_quiz.md` / `quiz*.md` file
- optionally writes a PDF (styled, via wkhtmltopdf if installed) and a DOCX

Derived from [Living Syllabus](https://github.com/ryanncode/living-syllabus) by Ryan N.

## Requirements

- Node.js 18+
- [pandoc](https://pandoc.org/installing.html) on `PATH`
- optional: `wkhtmltopdf` for PDFs that match the theme

## Install

```bash
npm install
npm run install-cli   # bundles to dist/kerplunk and copies it to ~/.local/bin/kerplunk
```

## Usage

```bash
kerplunk modules/week2/week2-reading.md        # HTML + PDF next to the source
kerplunk modules --html-only -o dist/          # whole folder, mirrored into dist/
kerplunk syllabus.md artzt                     # opt in to an inlined theme
kerplunk --list-themes
kerplunk --help
```

### Themes (optional)

Passing a theme inlines its CSS onto every element and wraps the output in `<div class="kerplunk">`.
`--auto-theme` picks one per file from the folder name (`syllabus` → latex, `pages` → sakura, …).

Theme lookup order: the current directory, `./themes/`, the source file's folder and its `themes/`,
the bundled `themes/`, then `~/.config/kerplunk/themes/`. A path to any `.css` file also works.

### Base URL

Relative links are rewritten when a base URL is known. In priority order:

1. `--base-url <url>`
2. `KERPLUNK_BASE_URL`
3. the nearest `package.json` with `kerplunk.baseUrl`, `baseUrl`, or `baseURL`
4. the nearest `.kerplunkrc` or `kerplunk.config.json` with `baseUrl`

The search walks up from the input and stops at the git root. Links resolve relative to the folder
containing that config.

## Library

```js
const { build, renderHtml, loadTheme } = require('kerplunk');
await build('modules', { theme: 'artzt', outDir: 'dist', formats: ['html'] });
```

## Development

```bash
npm test
npm run build:themes   # regenerate src/themes-data.js (embedded themes for the bundle)
```
