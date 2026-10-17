const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { simplifyHtml } = require('../src/html-simplify.js');

console.log('🧪 Testing html-simplify.js...');

// 1. Pandoc classes and unreferenced ids are removed
assert.strictEqual(
    simplifyHtml('<h2 id="setup">Setup</h2>\n<ul class="task-list">\n<li>x</li>\n</ul>'),
    '<h2>Setup</h2>\n<ul>\n<li>x</li>\n</ul>'
);
console.log('  ✅ Pandoc classes and unreferenced ids removed');

// 2. Ids that the document links to are kept (in-page links, footnotes)
const footnoteHtml = '<p>x<a href="#fn1" class="footnote-ref" id="fnref1" role="doc-noteref"><sup>1</sup></a></p>\n'
    + '<section id="footnotes" class="footnotes footnotes-end-of-document" role="doc-endnotes">\n'
    + '<ol>\n<li id="fn1"><p>note<a href="#fnref1" class="footnote-back" role="doc-backlink">↩︎</a></p></li>\n</ol>\n</section>';
const footnoteOut = simplifyHtml(footnoteHtml);
assert(footnoteOut.includes('<a href="#fn1" id="fnref1" role="doc-noteref">'), 'Footnote ref keeps its linked id and role');
assert(footnoteOut.includes('<li id="fn1">'), 'Footnote target keeps its linked id');
assert(footnoteOut.includes('<section role="doc-endnotes">'), 'Unlinked footnotes section id and classes removed');
assert(!footnoteOut.includes('class='), 'No pandoc classes remain');
console.log('  ✅ Linked ids preserved');

// 3. Author-written classes survive (e.g. Canvas utility classes in raw HTML)
assert.strictEqual(
    simplifyHtml('<div class="content-box level1">Hi</div>'),
    '<div class="content-box">Hi</div>'
);
console.log('  ✅ Author classes preserved');

// 4. Default-valued attributes are removed; meaningful alignment is kept
assert.strictEqual(
    simplifyHtml('<ol type="1">\n<li>a</li>\n</ol>\n<ol type="a">\n<li>b</li>\n</ol>'),
    '<ol>\n<li>a</li>\n</ol>\n<ol type="a">\n<li>b</li>\n</ol>'
);
assert.strictEqual(
    simplifyHtml('<tr>\n<td style="text-align: left;">a</td>\n<td style="text-align: right;">1</td>\n</tr>'),
    '<tr>\n<td>a</td>\n<td style="text-align: right;">1</td>\n</tr>'
);
console.log('  ✅ Default attributes removed, alignment kept');

// 5. Bare spans (pandoc autolinks) are unwrapped; spans with attributes are kept
assert.strictEqual(
    simplifyHtml('<a href="mailto:a@b.edu"><span>a@b.edu</span></a> <span lang="es">hola</span>'),
    '<a href="mailto:a@b.edu">a@b.edu</a> <span lang="es">hola</span>'
);
console.log('  ✅ Bare spans unwrapped');

// 6. Task-list checkboxes become characters (Canvas strips <input>)
assert.strictEqual(
    simplifyHtml('<li><label><input type="checkbox" />Todo</label></li>\n<li><label><input type="checkbox" checked="" /><strong>Done</strong></label></li>'),
    '<li>☐ Todo</li>\n<li>☑ <strong>Done</strong></li>'
);
console.log('  ✅ Task-list checkboxes replaced');

// 7. Untouched tags keep their exact original form; code text is left alone
const untouched = '<hr />\n<pre>if (a &lt; b) { el.id = &quot;x&quot;; }</pre>\n<img src="x.png" alt="X" />';
assert.strictEqual(simplifyHtml(untouched), untouched);
console.log('  ✅ Untouched markup preserved');

// 8. End-to-end: default (no theme) output is plain HTML with no wrapper or inline styles
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-simplify-test-'));
try {
    const mdFile = path.join(tmpDir, 'page.md');
    fs.writeFileSync(mdFile, [
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
    ].join('\n'), 'utf8');

    const kerplunkBin = path.resolve(__dirname, '..', 'bin', 'kerplunk.js');
    execFileSync('node', [kerplunkBin, mdFile, '--html-only'], { encoding: 'utf8' });

    const html = fs.readFileSync(path.join(tmpDir, 'page.html'), 'utf8');
    assert.strictEqual((html.match(/style="/g) || []).length, 2, 'Only the two right-aligned cells carry a style');
    assert(!html.includes('<div'), 'No wrapper div');
    assert(!html.includes('<section'), 'No section wrappers');
    assert(!html.includes('class='), 'No classes');
    assert(!html.includes(' id='), 'No ids');
    assert(!html.includes('<input'), 'No inputs');
    assert(!html.includes('<span'), 'No spans');
    assert(html.startsWith('<h1>Week 1</h1>'), 'Starts with a plain heading');
    assert(html.includes('<caption>Table: Item, Points</caption>'), 'Table caption has no inline style');
    assert(html.includes('<th scope="col">Item</th>'), 'Header scope kept');
    assert(html.includes('☐ Read chapter 1') && html.includes('☑ Install Node'), 'Checkboxes rendered as characters');
    console.log('  ✅ End-to-end default output is plain HTML');
} finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\n🎉 All html-simplify tests passed successfully!');
