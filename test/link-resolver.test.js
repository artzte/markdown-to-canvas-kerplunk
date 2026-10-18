const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    normalizeBaseUrl,
    getBaseUrlFromPackage,
    getThemeFromPackage,
    normalizeFormats,
    getFormatsFromPackage,
    findProjectConfig,
    resolveAnchorHref,
    rewriteHtmlAnchors
} = require('../src/link-resolver.js');

console.log('🧪 Testing link-resolver.js...');

// 1. normalizeBaseUrl
assert.strictEqual(normalizeBaseUrl('https://example.com/course'), 'https://example.com/course/');
assert.strictEqual(normalizeBaseUrl('https://example.com/course/'), 'https://example.com/course/');
assert.strictEqual(normalizeBaseUrl('example.com/course'), 'https://example.com/course/');
assert.strictEqual(normalizeBaseUrl(''), '');
assert.strictEqual(normalizeBaseUrl(null), '');
console.log('  ✅ normalizeBaseUrl passed');

// 2. getBaseUrlFromPackage
assert.strictEqual(getBaseUrlFromPackage({ baseUrl: 'https://site.com' }), 'https://site.com');
assert.strictEqual(getBaseUrlFromPackage({ baseURL: 'https://site2.com' }), 'https://site2.com');
assert.strictEqual(getBaseUrlFromPackage({ kerplunk: { baseUrl: 'https://kp.com' } }), 'https://kp.com');
assert.strictEqual(getBaseUrlFromPackage({ kerplunk: { baseUrl: 'https://kp.com' }, baseUrl: 'https://site.com' }), 'https://kp.com');
assert.strictEqual(getBaseUrlFromPackage({ homepage: 'https://course.edu' }), null);
assert.strictEqual(getBaseUrlFromPackage({}), null);
console.log('  ✅ getBaseUrlFromPackage passed');

// 2b. getThemeFromPackage
assert.strictEqual(getThemeFromPackage({ theme: 'artzt.css' }), 'artzt.css');
assert.strictEqual(getThemeFromPackage({ kerplunk: { theme: 'my-theme.css' } }), 'my-theme.css');
assert.strictEqual(getThemeFromPackage({ kerplunk: { theme: 'my-theme.css' }, theme: 'pkg-theme.css' }), 'my-theme.css');
assert.strictEqual(getThemeFromPackage({}), null);
console.log('  ✅ getThemeFromPackage passed');

// 2c. normalizeFormats
assert.deepStrictEqual(normalizeFormats(['html', 'pdf']), ['html', 'pdf']);
assert.deepStrictEqual(normalizeFormats(['HTML', 'PDF']), ['html', 'pdf']);
assert.deepStrictEqual(normalizeFormats(['html', 'docx', 'xyz']), ['html']);
assert.deepStrictEqual(normalizeFormats('pdf'), ['pdf']);
assert.deepStrictEqual(normalizeFormats([]), null);
assert.deepStrictEqual(normalizeFormats(null), null);
console.log('  ✅ normalizeFormats passed');

// 2d. getFormatsFromPackage
assert.deepStrictEqual(getFormatsFromPackage({ formats: ['html', 'pdf'] }), ['html', 'pdf']);
assert.deepStrictEqual(getFormatsFromPackage({ kerplunk: { formats: ['pdf'] } }), ['pdf']);
assert.deepStrictEqual(getFormatsFromPackage({ kerplunk: { formats: ['pdf'] }, formats: ['html'] }), ['pdf']);
assert.deepStrictEqual(getFormatsFromPackage({}), null);
console.log('  ✅ getFormatsFromPackage passed');

// 3. resolveAnchorHref
const base = 'https://username.github.io/my-course';

// Relative links with '..'
assert.strictEqual(
    resolveAnchorHref('../other-folder/boo.md', base, 'pages'),
    'https://username.github.io/my-course/other-folder/boo.md'
);
assert.strictEqual(
    resolveAnchorHref('../other-folder/boo.md', base, 'pages/week-1'),
    'https://username.github.io/my-course/pages/other-folder/boo.md'
);
// Windows-style backslashes in docRelDir
assert.strictEqual(
    resolveAnchorHref('../other-folder/boo.md', base, 'pages\\week-1'),
    'https://username.github.io/my-course/pages/other-folder/boo.md'
);
assert.strictEqual(
    resolveAnchorHref('boo.md', base, 'pages\\week-1'),
    'https://username.github.io/my-course/pages/week-1/boo.md'
);
assert.strictEqual(
    resolveAnchorHref('boo.md', base, 'pages'),
    'https://username.github.io/my-course/pages/boo.md'
);
assert.strictEqual(
    resolveAnchorHref('./boo.md', base, 'pages'),
    'https://username.github.io/my-course/pages/boo.md'
);
assert.strictEqual(
    resolveAnchorHref('/root-file.md', base, 'pages'),
    'https://username.github.io/my-course/root-file.md'
);

// Hash and query strings
assert.strictEqual(
    resolveAnchorHref('../other-folder/boo.md#sec1', base, 'pages'),
    'https://username.github.io/my-course/other-folder/boo.md#sec1'
);
assert.strictEqual(
    resolveAnchorHref('boo.md?version=2#part2', base, 'pages'),
    'https://username.github.io/my-course/pages/boo.md?version=2#part2'
);

// Unchanged links (external, anchors, mailto)
assert.strictEqual(resolveAnchorHref('#top', base, 'pages'), '#top');
assert.strictEqual(resolveAnchorHref('https://example.com/test', base, 'pages'), 'https://example.com/test');
assert.strictEqual(resolveAnchorHref('http://example.com', base, 'pages'), 'http://example.com');
assert.strictEqual(resolveAnchorHref('mailto:teacher@school.edu', base, 'pages'), 'mailto:teacher@school.edu');
assert.strictEqual(resolveAnchorHref('tel:1234567890', base, 'pages'), 'tel:1234567890');
assert.strictEqual(resolveAnchorHref('//cdn.example.com/lib.js', base, 'pages'), '//cdn.example.com/lib.js');
console.log('  ✅ resolveAnchorHref passed');

// 4. rewriteHtmlAnchors
const htmlInput = `
<div>
  <h1>Syllabus</h1>
  <p>See <a href="../other-folder/boo.md" class="doc-link">Boo Resource</a>.</p>
  <p>Check <a href='assignments/lab1.html'>Lab 1</a> and <a href="#grading">Grading</a>.</p>
  <p>External: <a href="https://canvas.instructure.com">Canvas</a></p>
</div>
`;

const rewritten = rewriteHtmlAnchors(htmlInput, 'https://username.github.io/my-course', 'pages');
assert(rewritten.includes('href="https://username.github.io/my-course/other-folder/boo.md"'));
assert(rewritten.includes('href=\'https://username.github.io/my-course/pages/assignments/lab1.html\''));
assert(rewritten.includes('href="#grading"'));
assert(rewritten.includes('href="https://canvas.instructure.com"'));
console.log('  ✅ rewriteHtmlAnchors passed');

// 5. findProjectConfig with temp directory
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-test-'));
const subDir = path.join(tmpDir, 'content', 'pages');
fs.mkdirSync(subDir, { recursive: true });

fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'test-course', baseUrl: 'https://prof.edu/course', theme: 'artzt.css' }),
    'utf8'
);

const config = findProjectConfig(subDir);
assert(config !== null);
assert.strictEqual(config.baseUrl, 'https://prof.edu/course');
assert.strictEqual(config.theme, 'artzt.css');
assert.strictEqual(config.configDir, tmpDir);
assert.strictEqual(config.source, 'package.json');

// 5b. findProjectConfig with kerplunk.config.json
fs.rmSync(path.join(tmpDir, 'package.json'));
fs.writeFileSync(
    path.join(tmpDir, 'kerplunk.config.json'),
    JSON.stringify({ baseUrl: 'https://prof.edu/class', theme: 'custom-theme.css', formats: ['html', 'pdf'] }),
    'utf8'
);

const configJson = findProjectConfig(subDir);
assert(configJson !== null);
assert.strictEqual(configJson.baseUrl, 'https://prof.edu/class');
assert.strictEqual(configJson.theme, 'custom-theme.css');
assert.deepStrictEqual(configJson.formats, ['html', 'pdf']);
assert.strictEqual(configJson.configDir, tmpDir);
assert.strictEqual(configJson.source, 'kerplunk.config.json');

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('  ✅ findProjectConfig passed');

// 6. End-to-End CLI test with package.json baseUrl
const cliTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-cli-test-'));
const cliPagesDir = path.join(cliTestDir, 'pages');
fs.mkdirSync(cliPagesDir, { recursive: true });

// Copy sample theme into cliTestDir
fs.copyFileSync(
    path.resolve(__dirname, '..', 'themes', 'simple.css'),
    path.join(cliTestDir, 'simple.css')
);

fs.writeFileSync(
    path.join(cliTestDir, 'package.json'),
    JSON.stringify({
        name: 'e2e-course',
        baseUrl: 'https://username.github.io/my-course'
    }),
    'utf8'
);

const testMdFile = path.join(cliPagesDir, 'week1.md');
fs.writeFileSync(
    testMdFile,
    '# Week 1\n\nCheck the [Boo Document](../other-folder/boo.md) and [Local Note](notes.md).\n',
    'utf8'
);

const { execFileSync } = require('child_process');
const kerplunkBin = path.resolve(__dirname, '..', 'bin', 'kerplunk.js');

// Run kerplunk on week1.md with simple.css
execFileSync('node', [kerplunkBin, testMdFile, 'simple.css', '--html-only'], {
    cwd: cliTestDir,
    encoding: 'utf8'
});

const generatedHtmlPath = path.join(cliPagesDir, 'week1.html');
assert(fs.existsSync(generatedHtmlPath), 'Generated HTML file must exist');

const generatedHtml = fs.readFileSync(generatedHtmlPath, 'utf8');
assert(
    generatedHtml.includes('href="https://username.github.io/my-course/other-folder/boo.md"'),
    'Link ../other-folder/boo.md must be normalized against package.json baseUrl'
);
assert(
    generatedHtml.includes('href="https://username.github.io/my-course/pages/notes.md"'),
    'Link notes.md must be normalized against package.json baseUrl and docRelDir'
);
console.log('  ✅ End-to-end kerplunk CLI with package.json baseUrl passed');

// 7. End-to-End CLI test with --base-url flag override
execFileSync('node', [kerplunkBin, testMdFile, 'simple.css', '--html-only', '--base-url', 'https://override.edu/custom-base'], {
    cwd: cliTestDir,
    encoding: 'utf8'
});

const overriddenHtml = fs.readFileSync(generatedHtmlPath, 'utf8');
assert(
    overriddenHtml.includes('href="https://override.edu/custom-base/other-folder/boo.md"'),
    '--base-url flag must override package.json'
);
console.log('  ✅ End-to-end kerplunk CLI with --base-url override passed');

// 8. End-to-End CLI test running on subfolder (e.g. `kerplunk pages`)
fs.rmSync(generatedHtmlPath, { force: true });
execFileSync('node', [kerplunkBin, 'pages', 'simple.css', '--html-only'], {
    cwd: cliTestDir,
    encoding: 'utf8'
});

assert(fs.existsSync(generatedHtmlPath), 'HTML file must be created by subfolder directory conversion');
const subfolderHtml = fs.readFileSync(generatedHtmlPath, 'utf8');
assert(
    subfolderHtml.includes('href="https://username.github.io/my-course/other-folder/boo.md"'),
    'Subfolder conversion must calculate docRelDir relative to project root (package.json)'
);
console.log('  ✅ End-to-end kerplunk CLI on subfolder directory passed');

// 9. End-to-End CLI test with kerplunk.config.json "theme" resolved relative to configDir
fs.rmSync(generatedHtmlPath, { force: true });
fs.writeFileSync(
    path.join(cliTestDir, 'kerplunk.config.json'),
    JSON.stringify({
        baseUrl: 'https://username.github.io/my-course',
        theme: 'simple.css'
    }),
    'utf8'
);

// Execute from inside the subfolder without specifying theme on CLI
execFileSync('node', [kerplunkBin, 'week1.md'], {
    cwd: cliPagesDir,
    encoding: 'utf8'
});

assert(fs.existsSync(generatedHtmlPath), 'HTML file must be created using theme from kerplunk.config.json');
const configThemedHtml = fs.readFileSync(generatedHtmlPath, 'utf8');
assert(configThemedHtml.includes('<div class="kerplunk"'), 'Should be wrapped in kerplunk scope div from config theme');
console.log('  ✅ End-to-end kerplunk CLI with kerplunk.config.json theme passed');

// 10. End-to-End CLI test with kerplunk.config.json "formats" setting
fs.rmSync(generatedHtmlPath, { force: true });
fs.writeFileSync(
    path.join(cliTestDir, 'kerplunk.config.json'),
    JSON.stringify({
        baseUrl: 'https://username.github.io/my-course',
        theme: 'simple.css',
        formats: ['html', 'pdf']
    }),
    'utf8'
);

const generatedPdfPath = path.join(cliPagesDir, 'week1.pdf');
fs.rmSync(generatedPdfPath, { force: true });

execFileSync('node', [kerplunkBin, 'week1.md'], {
    cwd: cliPagesDir,
    encoding: 'utf8'
});

assert(fs.existsSync(generatedHtmlPath), 'HTML file must be created from config formats');
assert(fs.existsSync(generatedPdfPath), 'PDF file must be created from config formats');
console.log('  ✅ End-to-end kerplunk CLI with kerplunk.config.json formats passed');

// 11. End-to-End CLI test with --html-only overriding config formats
fs.rmSync(generatedHtmlPath, { force: true });
fs.rmSync(generatedPdfPath, { force: true });

execFileSync('node', [kerplunkBin, 'week1.md', '--html-only'], {
    cwd: cliPagesDir,
    encoding: 'utf8'
});

assert(fs.existsSync(generatedHtmlPath), 'HTML file must be created');
assert(!fs.existsSync(generatedPdfPath), 'PDF file must not be created when --html-only overrides config formats');
console.log('  ✅ End-to-end kerplunk CLI --html-only overrides config formats passed');

// Cleanup
fs.rmSync(cliTestDir, { recursive: true, force: true });

console.log('\n🎉 All link-resolver and CLI integration tests passed successfully!');

