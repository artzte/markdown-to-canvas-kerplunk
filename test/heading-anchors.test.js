const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { addHeadingAnchors } = require('../src/heading-anchors.js');

console.log('🧪 Testing heading-anchors.js...');

assert.strictEqual(
    addHeadingAnchors('<h1 id="week-1">Week 1</h1>\n<h2 id="what-is-js">What <em>Is</em> "JS"?</h2>\n<h3>No id</h3>'),
    '<h1 id="week-1">Week 1</h1>\n<h2 id="what-is-js">What <em>Is</em> "JS"? <a href="#what-is-js" style="color: #888; font-size: 0.8em; text-decoration: none;" aria-label="Link to section: What Is &quot;JS&quot;?">#</a></h2>\n<h3>No id</h3>'
);

assert.strictEqual(
    addHeadingAnchors('<h2 id="intro">Intro</h2>\n<h2 id="reading">Reading</h2>'),
    '<h2 id="intro">Intro</h2>\n<h2 id="reading">Reading <a href="#reading" style="color: #888; font-size: 0.8em; text-decoration: none;" aria-label="Link to section: Reading">#</a></h2>'
);
console.log('  ✅ First heading in file is skipped; subsequent headings with ids get styled permalinks');

// End-to-end through the CLI
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-anchors-test-'));
try {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.writeFileSync(path.join(tmpDir, 'week2.md'), '# Week 2\n\n## Reading\n\nRead chapter 2.\n', 'utf8');

    const kerplunkBin = path.resolve(__dirname, '..', 'bin', 'kerplunk.js');
    execFileSync('node', [kerplunkBin, 'week2.md', '--html-only'], { cwd: tmpDir, encoding: 'utf8' });
    const html = fs.readFileSync(path.join(tmpDir, 'week2.html'), 'utf8');
    assert(html.includes('<h2 id="reading">Reading <a href="#reading" style="color: #888; font-size: 0.8em; text-decoration: none;" aria-label="Link to section: Reading">#</a></h2>'), 'Page has styled heading permalinks');
    console.log('  ✅ End-to-end permalinks');

    fs.writeFileSync(path.join(tmpDir, 'h2start.md'), '## Top Heading\n\n### Next Section\n\nContent.\n', 'utf8');
    execFileSync('node', [kerplunkBin, 'h2start.md', '--html-only'], { cwd: tmpDir, encoding: 'utf8' });
    const h2StartHtml = fs.readFileSync(path.join(tmpDir, 'h2start.html'), 'utf8');
    assert(h2StartHtml.includes('<h2>Top Heading</h2>'), 'First heading (h2) has no permalink');
    assert(h2StartHtml.includes('<h3 id="next-section">Next Section <a href="#next-section" style="color: #888; font-size: 0.8em; text-decoration: none;" aria-label="Link to section: Next Section">#</a></h3>'), 'Subsequent heading has permalink');
    console.log('  ✅ First heading without anchor when document starts with h2');

    execFileSync('node', [kerplunkBin, 'week2.md', '--html-only', '--no-anchors'], { cwd: tmpDir, encoding: 'utf8' });
    const noAnchors = fs.readFileSync(path.join(tmpDir, 'week2.html'), 'utf8');
    assert(noAnchors.includes('<h2>Reading</h2>'), '--no-anchors leaves plain headings');
    console.log('  ✅ --no-anchors');
} finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\n🎉 All heading-anchors tests passed successfully!');
