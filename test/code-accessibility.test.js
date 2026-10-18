const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { enhanceCodeAccessibility, getPandocHighlightArgs, getPandocMathArgs } = require('../src/code-accessibility.js');
const { build, hasCommand } = require('../index.js');

describe('code-accessibility', () => {
    describe('enhanceCodeAccessibility unit tests', () => {
        it('cleans Pandoc highlighted code blocks with empty anchors and spans', () => {
            const pandocHighlightedInput = `
<div class="sourceCode" id="cb1">
<pre class="sourceCode python"><code class="sourceCode python"><span id="cb1-1"><a href="#cb1-1" aria-hidden="true" tabindex="-1"></a><span class="kw">def</span> calculate_grade(scores):</span>
<span id="cb1-2"><a href="#cb1-2" aria-hidden="true" tabindex="-1"></a>    <span class="co"># Sum the list</span></span>
<span id="cb1-3"><a href="#cb1-3" aria-hidden="true" tabindex="-1"></a>    total <span class="op">=</span> <span class="bu">sum</span>(scores)</span>
<span id="cb1-4"><a href="#cb1-4" aria-hidden="true" tabindex="-1"></a>    <span class="cf">return</span> total <span class="op">/</span> <span class="bu">len</span>(scores)</span></code></pre>
</div>
`;
            const cleaned = enhanceCodeAccessibility(pandocHighlightedInput);

            // Must be wrapped in a simple <pre> tag
            assert(cleaned.includes('<pre>def calculate_grade(scores):'), 'Must start with clean <pre> tag');
            assert(cleaned.includes('</pre>'), 'Must end with </pre>');
            // Must NOT include div.sourceCode
            assert(!cleaned.includes('sourceCode'), 'Must not include sourceCode class or wrapper');
            // Must NOT include empty anchors or anchors to nowhere
            assert(!cleaned.includes('<a'), 'Must not include any <a> anchors in code samples');
            assert(!cleaned.includes('href="#cb1'), 'Must not include links to nowhere');
            // Must NOT include span tags
            assert(!cleaned.includes('<span'), 'Must not include <span> tags in code sample');
            // Must NOT include inner <code> tag
            assert(!cleaned.includes('<code'), 'Must not include nested <code> tag in code sample');
        });

        it('cleans Pandoc unhighlighted code blocks (<pre class="..."><code>)', () => {
            const unhighlightedInput = `<pre class="python"><code>def hello():
    print("Hello world!")</code></pre>`;

            const cleaned = enhanceCodeAccessibility(unhighlightedInput);
            assert.strictEqual(
                cleaned,
                '<pre>def hello():\n    print("Hello world!")</pre>',
                'Must simplify <pre class="..."><code> to single <pre> tag'
            );
        });

        it('preserves HTML entities and indentation', () => {
            const entityInput = `<pre class="html"><code>&lt;div class=&quot;box&quot;&gt;
  &lt;p&gt;A &amp; B&lt;/p&gt;
&lt;/div&gt;</code></pre>`;

            const cleaned = enhanceCodeAccessibility(entityInput);
            assert(
                cleaned.includes('&lt;div class=&quot;box&quot;&gt;\n  &lt;p&gt;A &amp; B&lt;/p&gt;\n&lt;/div&gt;'),
                'HTML entities and 2-space indent must be preserved'
            );
        });

        it('preserves inline code and standard page links outside <pre>', () => {
            const mixedInput = `<p>Run <code>npm run build</code> and visit <a href="#week-1">Week 1</a>.</p>
<pre class="js"><code>const x = 1;</code></pre>
<p>Also see <a href="https://example.com">external docs</a> with <code>code</code> inside.</p>`;

            const cleaned = enhanceCodeAccessibility(mixedInput);
            assert(cleaned.includes('<code>npm run build</code>'), 'Inline <code> must be preserved');
            assert(cleaned.includes('<a href="#week-1">Week 1</a>'), 'Page links outside <pre> must be preserved');
            assert(cleaned.includes('<pre>const x = 1;</pre>'), 'Code block must be simplified to <pre>');
            assert(
                cleaned.includes('<a href="https://example.com">external docs</a>'),
                'External links must be preserved'
            );
        });

        it('handles multiple code blocks in one document', () => {
            const multiInput = `
<div class="sourceCode" id="cb1"><pre class="sourceCode js"><code class="sourceCode javascript"><span id="cb1-1"><a href="#cb1-1"></a><span class="kw">let</span> a = 1;</span></code></pre></div>
<p>Between blocks</p>
<div class="sourceCode" id="cb2"><pre class="sourceCode js"><code class="sourceCode javascript"><span id="cb2-1"><a href="#cb2-1"></a><span class="kw">let</span> b = 2;</span></code></pre></div>
`;

            const cleaned = enhanceCodeAccessibility(multiInput);
            assert(cleaned.includes('<pre>let a = 1;</pre>'), 'First block converted cleanly');
            assert(cleaned.includes('<pre>let b = 2;</pre>'), 'Second block converted cleanly');
            assert(!cleaned.includes('<a'), 'No <a> tags remain');
        });
    });

    describe('helper functions', () => {
        it('getPandocHighlightArgs returns valid highlight flags', () => {
            const highlightArgs = getPandocHighlightArgs();
            assert(Array.isArray(highlightArgs), 'Must return array of args');
            assert(
                highlightArgs.includes('--syntax-highlighting=none') || highlightArgs.includes('--no-highlight'),
                'Must return valid syntax highlighting disable flag'
            );
        });

        it('hasCommand accurately checks for command availability', () => {
            assert.strictEqual(hasCommand('node'), true, 'node must be found on PATH');
            assert.strictEqual(hasCommand('pandoc'), true, 'pandoc must be found on PATH');
            assert.strictEqual(
                hasCommand('nonexistent_command_xyz_12345'),
                false,
                'nonexistent command must not be found'
            );
        });

        it('getPandocMathArgs returns valid math rendering flags', () => {
            const mathArgs = getPandocMathArgs();
            assert(Array.isArray(mathArgs), 'Must return array of math args');
            assert(
                mathArgs.includes('--math-method=webtex') || mathArgs.includes('--webtex'),
                'Must return valid math rendering flag'
            );
        });
    });

    describe('CLI and Library integration', () => {
        let tmpDir;
        let mdFile;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-code-test-'));
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
            mdFile = path.join(tmpDir, 'test-doc.md');
            fs.writeFileSync(mdFile, mdContent, 'utf8');
        });

        afterEach(() => {
            if (tmpDir && fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('CLI generates accessible code blocks with simple <pre> tags and no #cb anchors', () => {
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

            // Verification 3: Code samples must be wrapped in simple <pre> tags
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
        });

        it('Library build() produces accessible code blocks', async () => {
            const libOutDir = path.join(tmpDir, 'lib-out');
            const sampleSimple = path.resolve(__dirname, '..', 'themes', 'simple.css');
            fs.copyFileSync(sampleSimple, path.join(tmpDir, 'simple.css'));

            await build(mdFile, {
                theme: path.join(tmpDir, 'simple.css'),
                outDir: libOutDir,
                formats: ['html'],
                appendTheme: true
            });

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
        });
    });
});
