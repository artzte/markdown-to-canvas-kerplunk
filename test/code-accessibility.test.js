const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { enhanceCodeAccessibility, getPandocHighlightArgs, getPandocMathArgs } = require('../src/code-accessibility.js');
const { build, hasCommand } = require('../index.js');

console.log('🧪 Testing code-accessibility.js...');

// 1. Basic unit test: Pandoc skylighting HTML with empty anchors & spans
const pandocHighlightedInput = `
<div class="sourceCode" id="cb1">
<pre class="sourceCode python"><code class="sourceCode python"><span id="cb1-1"><a href="#cb1-1" aria-hidden="true" tabindex="-1"></a><span class="kw">def</span> calculate_grade(scores):</span>
<span id="cb1-2"><a href="#cb1-2" aria-hidden="true" tabindex="-1"></a>    <span class="co"># Sum the list</span></span>
<span id="cb1-3"><a href="#cb1-3" aria-hidden="true" tabindex="-1"></a>    total <span class="op">=</span> <span class="bu">sum</span>(scores)</span>
<span id="cb1-4"><a href="#cb1-4" aria-hidden="true" tabindex="-1"></a>    <span class="cf">return</span> total <span class="op">/</span> <span class="bu">len</span>(scores)</span></code></pre>
</div>
`;

const cleaned1 = enhanceCodeAccessibility(pandocHighlightedInput);

// Must be wrapped in a simple <pre> tag
assert(cleaned1.includes('<pre>def calculate_grade(scores):'), 'Must start with clean <pre> tag');
assert(cleaned1.includes('</pre>'), 'Must end with </pre>');
// Must NOT include div.sourceCode
assert(!cleaned1.includes('sourceCode'), 'Must not include sourceCode class or wrapper');
// Must NOT include empty anchors or anchors to nowhere
assert(!cleaned1.includes('<a'), 'Must not include any <a> anchors in code samples');
assert(!cleaned1.includes('href="#cb1'), 'Must not include links to nowhere');
// Must NOT include span tags
assert(!cleaned1.includes('<span'), 'Must not include <span> tags in code sample');
// Must NOT include inner <code> tag
assert(!cleaned1.includes('<code'), 'Must not include nested <code> tag in code sample');
console.log('  ✅ Pandoc highlighted code cleanup passed');

// 2. Pandoc unhighlighted code block: <pre class="python"><code>...</code></pre>
const unhighlightedInput = `<pre class="python"><code>def hello():
    print("Hello world!")</code></pre>`;

const cleaned2 = enhanceCodeAccessibility(unhighlightedInput);
assert.strictEqual(
    cleaned2,
    '<pre>def hello():\n    print("Hello world!")</pre>',
    'Must simplify <pre class="..."><code> to single <pre> tag'
);
console.log('  ✅ Unhighlighted <pre><code> cleanup passed');

// 3. Preservation of HTML entities and indentation
const entityInput = `<pre class="html"><code>&lt;div class=&quot;box&quot;&gt;
  &lt;p&gt;A &amp; B&lt;/p&gt;
&lt;/div&gt;</code></pre>`;

const cleaned3 = enhanceCodeAccessibility(entityInput);
assert(
    cleaned3.includes('&lt;div class=&quot;box&quot;&gt;\n  &lt;p&gt;A &amp; B&lt;/p&gt;\n&lt;/div&gt;'),
    'HTML entities and 2-space indent must be preserved'
);
console.log('  ✅ HTML entities and indentation preservation passed');

// 4. Inline code and standard page links outside <pre> must NOT be modified
const mixedInput = `<p>Run <code>npm run build</code> and visit <a href="#week-1">Week 1</a>.</p>
<pre class="js"><code>const x = 1;</code></pre>
<p>Also see <a href="https://example.com">external docs</a> with <code>code</code> inside.</p>`;

const cleaned4 = enhanceCodeAccessibility(mixedInput);
assert(cleaned4.includes('<code>npm run build</code>'), 'Inline <code> must be preserved');
assert(cleaned4.includes('<a href="#week-1">Week 1</a>'), 'Page links outside <pre> must be preserved');
assert(cleaned4.includes('<pre>const x = 1;</pre>'), 'Code block must be simplified to <pre>');
assert(cleaned4.includes('<a href="https://example.com">external docs</a>'), 'External links must be preserved');
console.log('  ✅ Inline code and external links preservation passed');

// 5. Multiple code blocks in one document
const multiInput = `
<div class="sourceCode" id="cb1"><pre class="sourceCode js"><code class="sourceCode javascript"><span id="cb1-1"><a href="#cb1-1"></a><span class="kw">let</span> a = 1;</span></code></pre></div>
<p>Between blocks</p>
<div class="sourceCode" id="cb2"><pre class="sourceCode js"><code class="sourceCode javascript"><span id="cb2-1"><a href="#cb2-1"></a><span class="kw">let</span> b = 2;</span></code></pre></div>
`;

const cleaned5 = enhanceCodeAccessibility(multiInput);
assert(cleaned5.includes('<pre>let a = 1;</pre>'), 'First block converted cleanly');
assert(cleaned5.includes('<pre>let b = 2;</pre>'), 'Second block converted cleanly');
assert(!cleaned5.includes('<a'), 'No <a> tags remain');
console.log('  ✅ Multiple code blocks passed');

// 6. getPandocHighlightArgs check
const highlightArgs = getPandocHighlightArgs();
assert(Array.isArray(highlightArgs), 'Must return array of args');
assert(
    highlightArgs.includes('--syntax-highlighting=none') || highlightArgs.includes('--no-highlight'),
    'Must return valid syntax highlighting disable flag'
);
console.log('  ✅ getPandocHighlightArgs passed');

// 6b. hasCommand check
assert.strictEqual(hasCommand('node'), true, 'node must be found on PATH');
assert.strictEqual(hasCommand('pandoc'), true, 'pandoc must be found on PATH');
assert.strictEqual(hasCommand('nonexistent_command_xyz_12345'), false, 'nonexistent command must not be found');
console.log('  ✅ hasCommand passed');

// 6c. getPandocMathArgs check
const mathArgs = getPandocMathArgs();
assert(Array.isArray(mathArgs), 'Must return array of math args');
assert(
    mathArgs.includes('--math-method=webtex') || mathArgs.includes('--webtex'),
    'Must return valid math rendering flag'
);
console.log('  ✅ getPandocMathArgs passed');

// 7. End-to-End kerplunk CLI test with code sample
console.log('🧪 Running End-to-End kerplunk CLI code block test...');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-code-test-'));

try {
    const mdContent = `# Code Accessibility Test

Here is inline code: \`kerplunk --html-only\`.

\`\`\`python
def greet(name):
    print(f"Hello, {name}!")
    return True
\`\`\`

Here is a second block:

\`\`\`javascript
const answer = 42;
console.log(answer);
\`\`\`
`;

    const mdFile = path.join(tmpDir, 'test-doc.md');
    fs.writeFileSync(mdFile, mdContent, 'utf8');

    // Copy sample theme into test directory
    const sampleArtzt = path.resolve(__dirname, '..', 'themes', 'artzt.css');
    fs.copyFileSync(sampleArtzt, path.join(tmpDir, 'artzt.css'));

    const kerplunkBin = path.resolve(__dirname, '..', 'bin', 'kerplunk.js');
    execFileSync('node', [kerplunkBin, mdFile, 'artzt.css', '--html-only', '-o', tmpDir], {
        cwd: tmpDir,
        encoding: 'utf8'
    });

    const outputHtmlPath = path.join(tmpDir, 'test-doc.html');
    assert(fs.existsSync(outputHtmlPath), 'Output HTML file must be generated');

    const outputHtml = fs.readFileSync(outputHtmlPath, 'utf8');

    // Verification 1: Must NOT have links to nowhere or empty anchors
    assert(!outputHtml.includes('href="#cb'), 'Output must not contain #cb anchors in code samples');
    assert(!outputHtml.includes('<a href="#cb'), 'Output must not contain <a href="#cb links');

    // Verification 2: Must NOT have div.sourceCode
    assert(!outputHtml.includes('sourceCode'), 'Output must not contain sourceCode class');

    // Verification 3: Code samples must be wrapped in simple <pre> tags (with inlined styles from theme)
    const preMatches = [...outputHtml.matchAll(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi)];
    assert.strictEqual(preMatches.length, 2, 'Must have exactly 2 <pre> code blocks');

    for (const match of preMatches) {
        const preInner = match[2];
        assert(!preInner.includes('<a'), 'Code block inner content must not contain <a> tag');
        assert(!preInner.includes('<code'), 'Code block inner content must not contain <code> tag');
        assert(!preInner.includes('<span'), 'Code block inner content must not contain <span> tag');
    }

    assert(outputHtml.includes('def greet(name):'), 'Python function must be in output');
    assert(outputHtml.includes('const answer = 42;'), 'JS code must be in output');
    assert(outputHtml.includes('<code'), 'Inline code outside <pre> must still have <code> tag');

    console.log('  ✅ End-to-end kerplunk CLI code block test passed');

    // 8. End-to-End library build() test
    console.log('🧪 Running End-to-End library build() test...');
    const libOutDir = path.join(tmpDir, 'lib-out');
    const sampleSimple = path.resolve(__dirname, '..', 'themes', 'simple.css');
    fs.copyFileSync(sampleSimple, path.join(tmpDir, 'simple.css'));

    build(mdFile, { theme: path.join(tmpDir, 'simple.css'), outDir: libOutDir, formats: ['html'], appendTheme: true })
        .then(() => {
            const libHtmlPath = path.join(libOutDir, 'test-doc_simple.html');
            assert(fs.existsSync(libHtmlPath), 'build() must produce output file');
            const libHtml = fs.readFileSync(libHtmlPath, 'utf8');

            assert(!libHtml.includes('href="#cb'), 'build() output must not contain #cb links');
            assert(!libHtml.includes('sourceCode'), 'build() output must not contain sourceCode');
            assert(libHtml.includes('<div class="kerplunk"'), 'build() output must use the kerplunk scope class');

            const libPreMatches = [...libHtml.matchAll(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi)];
            assert.strictEqual(libPreMatches.length, 2, 'build() output must have exactly 2 <pre> blocks');
            for (const match of libPreMatches) {
                const preInner = match[2];
                assert(!preInner.includes('<a'), 'build() pre inner must not contain <a> tag');
                assert(!preInner.includes('<code'), 'build() pre inner must not contain <code> tag');
            }

            console.log('  ✅ End-to-end library build() code block test passed');
            console.log('\n🎉 All code accessibility tests passed successfully!');
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
} finally {
    // Cleanup will happen after Promise if needed, but let's schedule cleanup
    process.on('exit', () => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
    });
}
