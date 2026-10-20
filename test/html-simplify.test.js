const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { simplifyHtml } = require('../src/html-simplify.js');

describe('html-simplify', () => {
    describe('simplifyHtml unit tests', () => {
        it('removes pandoc classes and unreferenced ids', () => {
            assert.strictEqual(
                simplifyHtml('<h2 id="setup">Setup</h2>\n<ul class="task-list">\n<li>x</li>\n</ul>'),
                '<h2>Setup</h2>\n<ul>\n<li>x</li>\n</ul>'
            );
        });

        it('preserves linked ids such as in-page links and footnotes', () => {
            const footnoteHtml =
                '<p>x<a href="#fn1" class="footnote-ref" id="fnref1" role="doc-noteref"><sup>1</sup></a></p>\n' +
                '<section id="footnotes" class="footnotes footnotes-end-of-document" role="doc-endnotes">\n' +
                '<ol>\n<li id="fn1"><p>note<a href="#fnref1" class="footnote-back" role="doc-backlink">↩︎</a></p></li>\n</ol>\n</section>';
            const footnoteOut = simplifyHtml(footnoteHtml);
            assert(
                footnoteOut.includes('<a href="#fn1" id="fnref1" role="doc-noteref">'),
                'Footnote ref keeps its linked id and role'
            );
            assert(footnoteOut.includes('<li id="fn1">'), 'Footnote target keeps its linked id');
            assert(
                footnoteOut.includes('<section role="doc-endnotes">'),
                'Unlinked footnotes section id and classes removed'
            );
            assert(!footnoteOut.includes('class='), 'No pandoc classes remain');
        });

        it('preserves author-written classes', () => {
            assert.strictEqual(
                simplifyHtml('<div class="content-box level1">Hi</div>'),
                '<div class="content-box">Hi</div>'
            );
        });

        it('removes default-valued attributes and keeps meaningful alignment', () => {
            assert.strictEqual(
                simplifyHtml('<ol type="1">\n<li>a</li>\n</ol>\n<ol type="a">\n<li>b</li>\n</ol>'),
                '<ol>\n<li>a</li>\n</ol>\n<ol type="a">\n<li>b</li>\n</ol>'
            );
            assert.strictEqual(
                simplifyHtml(
                    '<tr>\n<td style="text-align: left;">a</td>\n<td style="text-align: right;">1</td>\n</tr>'
                ),
                '<tr>\n<td>a</td>\n<td style="text-align: right;">1</td>\n</tr>'
            );
        });

        it('unwraps bare spans while keeping spans with attributes', () => {
            assert.strictEqual(
                simplifyHtml('<a href="mailto:a@b.edu"><span>a@b.edu</span></a> <span lang="es">hola</span>'),
                '<a href="mailto:a@b.edu">a@b.edu</a> <span lang="es">hola</span>'
            );
        });

        it('replaces task-list checkboxes with characters', () => {
            assert.strictEqual(
                simplifyHtml(
                    '<li><label><input type="checkbox" />Todo</label></li>\n<li><label><input type="checkbox" checked="" /><strong>Done</strong></label></li>'
                ),
                '<li>☐ Todo</li>\n<li>☑ <strong>Done</strong></li>'
            );
        });

        it('preserves untouched markup and leaves code text alone', () => {
            const untouched =
                '<hr />\n<pre>if (a &lt; b) { el.id = &quot;x&quot;; }</pre>\n<img src="x.png" alt="X" />';
            assert.strictEqual(simplifyHtml(untouched), untouched);
        });
    });

    describe('CLI end-to-end integration', () => {
        let tmpDir;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-simplify-test-'));
        });

        afterEach(() => {
            if (tmpDir && fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('produces plain HTML with no wrapper or inline styles by default', () => {
            const mdFile = path.join(tmpDir, 'page.md');
            fs.writeFileSync(
                mdFile,
                [
                    '# Week 1',
                    '',
                    '## Tasks',
                    '',
                    '- [ ] Read chapter 1',
                    '- [x] Install Node',
                    '',
                    '1. First',
                    '2. Second',
                    '',
                    '| Item | Points |',
                    '|:-----|-------:|',
                    '| Quiz | 10 |',
                    '',
                    'Email <teacher@school.edu>.',
                    ''
                ].join('\n'),
                'utf8'
            );

            const kerplunkBin = path.resolve(__dirname, '..', 'bin', 'kerplunk.js');
            execFileSync('node', [kerplunkBin, mdFile, '--html-only'], { encoding: 'utf8' });

            const html = fs.readFileSync(path.join(tmpDir, 'page.html'), 'utf8');
            assert.strictEqual(
                (html.match(/style="/g) || []).length,
                3,
                'Right-aligned cells and heading anchor carry styles'
            );
            assert(!html.includes('<div'), 'No wrapper div');
            assert(!html.includes('<section'), 'No section wrappers');
            assert(!html.includes('class='), 'No classes');
            assert.strictEqual((html.match(/ id=/g) || []).length, 1, 'Only the h2 keeps an id (for its permalink)');
            assert(
                html.includes(
                    '<h2 id="tasks">Tasks <a href="#tasks" style="color: #888; font-size: 0.8em; text-decoration: none;" aria-label="Link to section: Tasks">#</a></h2>'
                ),
                'h2 has a styled permalink'
            );
            assert(!html.includes('<input'), 'No inputs');
            assert(!html.includes('<span'), 'No spans');
            assert(html.startsWith('<h1>Week 1</h1>'), 'First heading is plain, with no permalink');
            assert(html.includes('<caption>Table: Item, Points</caption>'), 'Table caption has no inline style');
            assert(html.includes('<th scope="col">Item</th>'), 'Header scope kept');
            assert(
                html.includes('☐ Read chapter 1') && html.includes('☑ Install Node'),
                'Checkboxes rendered as characters'
            );
        });
    });
});
