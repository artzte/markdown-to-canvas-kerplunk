const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
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
const { hasCommand } = require('../index.js');

describe('link-resolver', () => {
    describe('normalizeBaseUrl', () => {
        it('normalizes URLs ensuring trailing slash and default https protocol', () => {
            assert.strictEqual(normalizeBaseUrl('https://example.com/course'), 'https://example.com/course/');
            assert.strictEqual(normalizeBaseUrl('https://example.com/course/'), 'https://example.com/course/');
            assert.strictEqual(normalizeBaseUrl('example.com/course'), 'https://example.com/course/');
            assert.strictEqual(normalizeBaseUrl(''), '');
            assert.strictEqual(normalizeBaseUrl(null), '');
        });
    });

    describe('getBaseUrlFromPackage', () => {
        it('extracts baseUrl or baseURL from package object with kerplunk priority', () => {
            assert.strictEqual(getBaseUrlFromPackage({ baseUrl: 'https://site.com' }), 'https://site.com');
            assert.strictEqual(getBaseUrlFromPackage({ baseURL: 'https://site2.com' }), 'https://site2.com');
            assert.strictEqual(getBaseUrlFromPackage({ kerplunk: { baseUrl: 'https://kp.com' } }), 'https://kp.com');
            assert.strictEqual(
                getBaseUrlFromPackage({ kerplunk: { baseUrl: 'https://kp.com' }, baseUrl: 'https://site.com' }),
                'https://kp.com'
            );
            assert.strictEqual(getBaseUrlFromPackage({ homepage: 'https://course.edu' }), null);
            assert.strictEqual(getBaseUrlFromPackage({}), null);
        });
    });

    describe('getThemeFromPackage', () => {
        it('extracts theme with kerplunk priority', () => {
            assert.strictEqual(getThemeFromPackage({ theme: 'artzt.css' }), 'artzt.css');
            assert.strictEqual(getThemeFromPackage({ kerplunk: { theme: 'my-theme.css' } }), 'my-theme.css');
            assert.strictEqual(
                getThemeFromPackage({ kerplunk: { theme: 'my-theme.css' }, theme: 'pkg-theme.css' }),
                'my-theme.css'
            );
            assert.strictEqual(getThemeFromPackage({}), null);
        });
    });

    describe('normalizeFormats', () => {
        it('normalizes array and string format inputs to lowercase valid formats', () => {
            assert.deepStrictEqual(normalizeFormats(['html', 'pdf']), ['html', 'pdf']);
            assert.deepStrictEqual(normalizeFormats(['HTML', 'PDF']), ['html', 'pdf']);
            assert.deepStrictEqual(normalizeFormats(['html', 'docx', 'xyz']), ['html']);
            assert.deepStrictEqual(normalizeFormats('pdf'), ['pdf']);
            assert.deepStrictEqual(normalizeFormats([]), null);
            assert.deepStrictEqual(normalizeFormats(null), null);
        });
    });

    describe('getFormatsFromPackage', () => {
        it('extracts formats with kerplunk namespace precedence', () => {
            assert.deepStrictEqual(getFormatsFromPackage({ formats: ['html', 'pdf'] }), ['html', 'pdf']);
            assert.deepStrictEqual(getFormatsFromPackage({ kerplunk: { formats: ['pdf'] } }), ['pdf']);
            assert.deepStrictEqual(getFormatsFromPackage({ kerplunk: { formats: ['pdf'] }, formats: ['html'] }), [
                'pdf'
            ]);
            assert.deepStrictEqual(getFormatsFromPackage({}), null);
        });
    });

    describe('resolveAnchorHref', () => {
        const base = 'https://username.github.io/my-course';

        it('resolves relative links including parent directory references', () => {
            assert.strictEqual(
                resolveAnchorHref('../other-folder/boo.md', base, 'pages'),
                'https://username.github.io/my-course/other-folder/boo.md'
            );
            assert.strictEqual(
                resolveAnchorHref('../other-folder/boo.md', base, 'pages/week-1'),
                'https://username.github.io/my-course/pages/other-folder/boo.md'
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
        });

        it('handles Windows-style backslashes in docRelDir', () => {
            assert.strictEqual(
                resolveAnchorHref('../other-folder/boo.md', base, 'pages\\week-1'),
                'https://username.github.io/my-course/pages/other-folder/boo.md'
            );
            assert.strictEqual(
                resolveAnchorHref('boo.md', base, 'pages\\week-1'),
                'https://username.github.io/my-course/pages/week-1/boo.md'
            );
        });

        it('preserves hash and query parameters', () => {
            assert.strictEqual(
                resolveAnchorHref('../other-folder/boo.md#sec1', base, 'pages'),
                'https://username.github.io/my-course/other-folder/boo.md#sec1'
            );
            assert.strictEqual(
                resolveAnchorHref('boo.md?version=2#part2', base, 'pages'),
                'https://username.github.io/my-course/pages/boo.md?version=2#part2'
            );
        });

        it('leaves in-page anchors, external links, and protocol schemes untouched', () => {
            assert.strictEqual(resolveAnchorHref('#top', base, 'pages'), '#top');
            assert.strictEqual(
                resolveAnchorHref('https://example.com/test', base, 'pages'),
                'https://example.com/test'
            );
            assert.strictEqual(resolveAnchorHref('http://example.com', base, 'pages'), 'http://example.com');
            assert.strictEqual(
                resolveAnchorHref('mailto:teacher@school.edu', base, 'pages'),
                'mailto:teacher@school.edu'
            );
            assert.strictEqual(resolveAnchorHref('tel:1234567890', base, 'pages'), 'tel:1234567890');
            assert.strictEqual(
                resolveAnchorHref('//cdn.example.com/lib.js', base, 'pages'),
                '//cdn.example.com/lib.js'
            );
        });
    });

    describe('rewriteHtmlAnchors', () => {
        it('rewrites relative anchors while preserving external and in-page links', () => {
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
            assert(rewritten.includes("href='https://username.github.io/my-course/pages/assignments/lab1.html'"));
            assert(rewritten.includes('href="#grading"'));
            assert(rewritten.includes('href="https://canvas.instructure.com"'));
        });
    });

    describe('findProjectConfig', () => {
        let tmpDir;
        let subDir;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-test-'));
            subDir = path.join(tmpDir, 'content', 'pages');
            fs.mkdirSync(subDir, { recursive: true });
        });

        afterEach(() => {
            if (tmpDir && fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('finds config from package.json in parent directories', () => {
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
        });

        it('finds config from kerplunk.config.json', () => {
            fs.writeFileSync(
                path.join(tmpDir, 'kerplunk.config.json'),
                JSON.stringify({
                    baseUrl: 'https://prof.edu/class',
                    theme: 'custom-theme.css',
                    formats: ['html', 'pdf']
                }),
                'utf8'
            );

            const configJson = findProjectConfig(subDir);
            assert(configJson !== null);
            assert.strictEqual(configJson.baseUrl, 'https://prof.edu/class');
            assert.strictEqual(configJson.theme, 'custom-theme.css');
            assert.deepStrictEqual(configJson.formats, ['html', 'pdf']);
            assert.strictEqual(configJson.configDir, tmpDir);
            assert.strictEqual(configJson.source, 'kerplunk.config.json');
        });
    });

    describe('CLI end-to-end integration', () => {
        let cliTestDir;
        let cliPagesDir;
        let testMdFile;
        let generatedHtmlPath;
        const kerplunkBin = path.resolve(__dirname, '..', 'bin', 'kerplunk.js');

        beforeEach(() => {
            cliTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerplunk-cli-test-'));
            cliPagesDir = path.join(cliTestDir, 'pages');
            fs.mkdirSync(cliPagesDir, { recursive: true });

            fs.copyFileSync(path.resolve(__dirname, '..', 'themes', 'simple.css'), path.join(cliTestDir, 'simple.css'));

            fs.writeFileSync(
                path.join(cliTestDir, 'package.json'),
                JSON.stringify({
                    name: 'e2e-course',
                    baseUrl: 'https://username.github.io/my-course'
                }),
                'utf8'
            );

            testMdFile = path.join(cliPagesDir, 'week1.md');
            fs.writeFileSync(
                testMdFile,
                '# Week 1\n\nCheck the [Boo Document](../other-folder/boo.md) and [Local Note](notes.md).\n',
                'utf8'
            );
            generatedHtmlPath = path.join(cliPagesDir, 'week1.html');
        });

        afterEach(() => {
            if (cliTestDir && fs.existsSync(cliTestDir)) {
                fs.rmSync(cliTestDir, { recursive: true, force: true });
            }
        });

        it('resolves links against package.json baseUrl', () => {
            execFileSync('node', [kerplunkBin, testMdFile, 'simple.css', '--html-only'], {
                cwd: cliTestDir,
                encoding: 'utf8'
            });

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
        });

        it('overrides package.json with CLI --base-url flag', () => {
            execFileSync(
                'node',
                [
                    kerplunkBin,
                    testMdFile,
                    'simple.css',
                    '--html-only',
                    '--base-url',
                    'https://override.edu/custom-base'
                ],
                {
                    cwd: cliTestDir,
                    encoding: 'utf8'
                }
            );

            const overriddenHtml = fs.readFileSync(generatedHtmlPath, 'utf8');
            assert(
                overriddenHtml.includes('href="https://override.edu/custom-base/other-folder/boo.md"'),
                '--base-url flag must override package.json'
            );
        });

        it('resolves docRelDir relative to project root when converting a subfolder directory', () => {
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
        });

        it('resolves theme from kerplunk.config.json relative to configDir', () => {
            fs.writeFileSync(
                path.join(cliTestDir, 'kerplunk.config.json'),
                JSON.stringify({
                    baseUrl: 'https://username.github.io/my-course',
                    theme: 'simple.css'
                }),
                'utf8'
            );

            execFileSync('node', [kerplunkBin, 'week1.md'], {
                cwd: cliPagesDir,
                encoding: 'utf8'
            });

            assert(fs.existsSync(generatedHtmlPath), 'HTML file must be created using theme from kerplunk.config.json');
            const configThemedHtml = fs.readFileSync(generatedHtmlPath, 'utf8');
            assert(
                configThemedHtml.includes('<div class="kerplunk"'),
                'Should be wrapped in kerplunk scope div from config theme'
            );
        });

        it('generates both HTML and PDF when configured in kerplunk.config.json formats', () => {
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

            execFileSync('node', [kerplunkBin, 'week1.md'], {
                cwd: cliPagesDir,
                encoding: 'utf8'
            });

            assert(fs.existsSync(generatedHtmlPath), 'HTML file must be created from config formats');
            if (hasCommand('wkhtmltopdf')) {
                assert(fs.existsSync(generatedPdfPath), 'PDF file must be created from config formats');
            }
        });

        it('allows --html-only to override kerplunk.config.json formats', () => {
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

            execFileSync('node', [kerplunkBin, 'week1.md', '--html-only'], {
                cwd: cliPagesDir,
                encoding: 'utf8'
            });

            assert(fs.existsSync(generatedHtmlPath), 'HTML file must be created');
            assert(
                !fs.existsSync(generatedPdfPath),
                'PDF file must not be created when --html-only overrides config formats'
            );
        });
    });
});
