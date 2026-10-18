const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const juice = require('juice');
const { loadTheme } = require('./themes.js');
const { enhanceTableAccessibility } = require('./table-accessibility.js');
const { enhanceCodeAccessibility, getPandocHighlightArgs } = require('./code-accessibility.js');
const { simplifyHtml } = require('./html-simplify.js');
const { addHeadingAnchors } = require('./heading-anchors.js');
const { isQuizFile, processQuizQti } = require('./qti-generator.js');
const { findProjectConfig, rewriteHtmlAnchors } = require('./link-resolver.js');

const SUPPORTED_EXTS = ['.md', '.markdown'];
const DEFAULT_SCOPE = 'kerplunk';

function isSupportedFile(filePath) {
    return SUPPORTED_EXTS.includes(path.extname(filePath).toLowerCase());
}

function hasCommand(cmd) {
    const isWin = process.platform === 'win32';
    const primary = isWin ? 'where' : 'which';
    const secondary = isWin ? 'which' : 'where';
    try {
        execFileSync(primary, [cmd], { stdio: 'ignore' });
        return true;
    } catch {
        try {
            execFileSync(secondary, [cmd], { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }
}

function runPandoc(args) {
    return new Promise((resolve, reject) => {
        execFile('pandoc', args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(`pandoc error: ${stderr || error.message}`));
            }
            resolve(stdout);
        });
    });
}

/**
 * Recursively lists supported source files under dirPath, sorted, skipping dotfiles,
 * node_modules, and the output directory (so in-place re-runs don't recurse into it).
 */
function findSourceFiles(dirPath, excludeDir = null) {
    let results = [];
    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err) {
        console.error(`⚠️ Could not read directory '${dirPath}':`, err.message);
        return results;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
        }
        const fullPath = path.join(dirPath, entry.name);

        if (excludeDir && path.resolve(fullPath) === path.resolve(excludeDir)) {
            continue;
        }

        let isDir = entry.isDirectory();
        let isFile = entry.isFile();

        if (entry.isSymbolicLink()) {
            try {
                const s = fs.statSync(fullPath);
                isDir = s.isDirectory();
                isFile = s.isFile();
            } catch {
                continue;
            }
        }

        if (isDir) {
            results = results.concat(findSourceFiles(fullPath, excludeDir));
        } else if (isFile && isSupportedFile(entry.name)) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * The folder, relative to the project root (where baseUrl was configured), that a
 * source file lives in. Relative links in the document resolve against this.
 */
function docRelDirFor(filePath, projectConfig, fallbackRoot) {
    const root = projectConfig ? projectConfig.configDir : fallbackRoot;
    const rel = path.relative(root, path.dirname(filePath));
    return rel.startsWith('..') ? '' : rel;
}

/**
 * Converts one source file to a Canvas-safe HTML fragment: pandoc -> accessibility
 * fixes -> heading permalinks -> pandoc cleanup -> link rewriting. With a theme, the result is also wrapped
 * in a scope <div> and the theme's styles are inlined; with theme = null the plain
 * HTML is returned so Canvas's own theme styles it.
 */
async function renderHtml(inputPath, theme, options = {}) {
    const {
        scopeClass = DEFAULT_SCOPE,
        noWrapper = false,
        headingAnchors = true,
        baseUrl = null,
        docRelDir = ''
    } = options;

    const rawHtml = await runPandoc([
        inputPath,
        '-f',
        'gfm',
        '-t',
        'html5',
        '--wrap=none',
        '--math-method=webtex',
        ...getPandocHighlightArgs()
    ]);

    const tableAccessibleHtml = enhanceTableAccessibility(rawHtml);
    const accessibleHtml = enhanceCodeAccessibility(tableAccessibleHtml);
    // Anchors go in before simplifyHtml, which keeps only ids that something links to.
    const anchoredHtml = headingAnchors ? addHeadingAnchors(accessibleHtml) : accessibleHtml;
    const simpleHtml = simplifyHtml(anchoredHtml);
    const linkedHtml = rewriteHtmlAnchors(simpleHtml, baseUrl, docRelDir);
    if (!theme) {
        return linkedHtml;
    }

    const wrappedHtml = noWrapper ? linkedHtml : `<div class="${scopeClass}">\n${linkedHtml}\n</div>\n`;

    return juice.inlineContent(wrappedHtml, theme.css, {
        applyStyleTags: true,
        removeStyleTags: true,
        preserveMediaQueries: false,
        widthElements: ['table', 'td', 'th']
    });
}

/**
 * Writes the requested outputs (html, pdf, plus a QTI zip for quiz files)
 * for one source file into outputDir. themeName = null means no theme.
 */
async function convertFile(inputPath, theme, outputDir, options = {}) {
    const {
        themeName = null,
        appendTheme = false,
        formats = ['html'],
        hasWkhtmltopdf = false,
        noQti = false,
        baseUrl = null,
        docRelDir = '',
        indent = '   ',
        themeBaseDir = process.cwd()
    } = options;

    const fileExt = path.extname(inputPath).toLowerCase();
    const baseName = path.basename(inputPath, fileExt);

    let loadedTheme = null;
    let effectiveThemeName = null;

    if (theme && typeof theme === 'object' && theme.css) {
        loadedTheme = theme;
        effectiveThemeName = themeName || theme.name || 'theme';
    } else if (typeof theme === 'string') {
        effectiveThemeName = themeName || path.basename(theme, '.css');
        loadedTheme = await loadTheme(theme, themeBaseDir);
    }

    const outStem = appendTheme && effectiveThemeName ? `${baseName}_${effectiveThemeName}` : baseName;

    fs.mkdirSync(outputDir, { recursive: true });

    const inlinedHtml = await renderHtml(inputPath, loadedTheme, options);

    if (formats.includes('html')) {
        const htmlOutputFile = path.join(outputDir, `${outStem}.html`);
        const stampParts = [`<!-- Generated by kerplunk on ${new Date().toISOString()} -->`];
        if (loadedTheme && loadedTheme.licenseHeader && loadedTheme.licenseHeader.trim()) {
            stampParts.push(loadedTheme.licenseHeader.trim());
        }
        const stamp = '\n\n' + stampParts.join('\n\n') + '\n';
        fs.writeFileSync(htmlOutputFile, inlinedHtml.trim() + stamp, 'utf8');
        console.log(`${indent}✅ Canvas HTML: ${htmlOutputFile}`);
    }

    if (formats.includes('pdf')) {
        const pdfOutputFile = path.join(outputDir, `${outStem}.pdf`);

        if (hasWkhtmltopdf) {
            console.log(`${indent}...Rendering styled PDF with wkhtmltopdf...`);
            const printableHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${baseName}</title>
  <style>
    @page { margin: 20mm 15mm; size: auto; }
    body { margin: 0; padding: 0; background: #fff; }
  </style>
</head>
<body>
  ${inlinedHtml}
</body>
</html>`;

            const tempHtmlPath = path.join(outputDir, `.${outStem}.tmp.html`);
            try {
                fs.writeFileSync(tempHtmlPath, printableHtml, 'utf8');
                execFileSync('wkhtmltopdf', ['--quiet', '--enable-local-file-access', tempHtmlPath, pdfOutputFile]);
                console.log(`${indent}✅ Styled PDF:  ${pdfOutputFile}`);
            } catch (err) {
                console.error(`${indent}❌ wkhtmltopdf error: ${err.message}`);
            } finally {
                fs.rmSync(tempHtmlPath, { force: true });
            }
        } else {
            console.log(`${indent}...Rendering PDF via pandoc (wkhtmltopdf not found)...`);
            try {
                await runPandoc([inputPath, '-f', 'gfm', '-t', 'pdf', '-o', pdfOutputFile, '--math-method=webtex']);
                console.log(`${indent}✅ Standalone PDF: ${pdfOutputFile}`);
            } catch (err) {
                console.error(`${indent}❌ PDF Pandoc Error: ${err.message}`);
                console.error(
                    `${indent}💡 Tip: Install wkhtmltopdf for PDFs that match the theme: sudo apt install wkhtmltopdf (Linux) or winget install wkhtmltopdf (Windows)`
                );
            }
        }
    }

    if (!noQti && isQuizFile(inputPath)) {
        try {
            const qtiResult = processQuizQti(inputPath, outputDir, { baseUrl, docRelDir });
            if (qtiResult) {
                console.log(
                    `${indent}📦 Canvas QTI:    ${path.basename(qtiResult.outputPath)} (${qtiResult.totalQuestions} questions, ${qtiResult.totalPoints} pts)`
                );
            }
        } catch (qtiErr) {
            console.error(`${indent}⚠️ QTI Generation error: ${qtiErr.message}`);
        }
    }
}

/**
 * Builds a single file or a whole folder (recursively).
 *
 * options:
 *   theme       theme name or .css path; null or 'none' leaves styling to Canvas
 *   outDir      output folder (default: next to each source file)
 *   formats     any of 'html', 'pdf' (default: ['html'])
 *   baseUrl     overrides KERPLUNK_BASE_URL and the project config
 *   headingAnchors  add "#" permalinks to headings (default: true)
 *   scopeClass, noWrapper, appendTheme, noQti
 *
 * Returns { converted, failed }.
 */
async function build(inputPath, options = {}) {
    const {
        theme: requestedTheme = null,
        outDir = null,
        formats: requestedFormats = null,
        baseUrl = null,
        ...fileOptions
    } = options;

    const resolvedInputPath = path.resolve(inputPath);
    if (!fs.existsSync(resolvedInputPath)) {
        throw new Error(`Source file or folder not found: '${resolvedInputPath}'`);
    }

    const isDirectory = fs.statSync(resolvedInputPath).isDirectory();
    if (!isDirectory && !isSupportedFile(resolvedInputPath)) {
        throw new Error(
            `Unsupported file type '${path.extname(resolvedInputPath)}'. Supported: ${SUPPORTED_EXTS.join(', ')}`
        );
    }

    if (!hasCommand('pandoc')) {
        throw new Error(`'pandoc' was not found on PATH. Install it from https://pandoc.org/installing.html`);
    }

    const resolvedOutDir = outDir ? path.resolve(outDir) : null;
    const projectConfig = findProjectConfig(resolvedInputPath);
    const explicitBaseUrl = baseUrl || process.env.KERPLUNK_BASE_URL || null;
    const effectiveBaseUrl = explicitBaseUrl || (projectConfig ? projectConfig.baseUrl : null);

    // Formats resolution:
    // 1. Explicit option passed to build() / CLI flag
    // 2. Project config ("formats" in kerplunk.config.json or package.json)
    // 3. Default: ['html']
    const effectiveFormats =
        requestedFormats && requestedFormats.length > 0
            ? requestedFormats
            : projectConfig && projectConfig.formats && projectConfig.formats.length > 0
              ? projectConfig.formats
              : ['html'];

    const hasWkhtmltopdf = effectiveFormats.includes('pdf') && hasCommand('wkhtmltopdf');

    // Theme resolution:
    // 1. Explicit CLI / build() option -> resolved relative to process.cwd()
    // 2. Project config ("theme" in kerplunk.config.json or package.json) -> resolved relative to configDir
    // 3. None -> null (clean HTML styled by Canvas LMS)
    const explicitTheme = requestedTheme && requestedTheme.toLowerCase() !== 'none' ? requestedTheme : null;
    const configTheme =
        projectConfig && projectConfig.theme && projectConfig.theme.toLowerCase() !== 'none'
            ? projectConfig.theme
            : null;
    const themeSpec = explicitTheme || configTheme || null;

    let loadedTheme = null;
    let themeLabel = 'none';
    let themeStem = null;

    if (themeSpec) {
        const themeBaseDir = explicitTheme ? process.cwd() : projectConfig ? projectConfig.configDir : process.cwd();
        loadedTheme = await loadTheme(themeSpec, themeBaseDir);
        themeStem = path.basename(themeSpec, '.css');
        themeLabel = themeStem.toUpperCase();
    }

    const files = isDirectory ? findSourceFiles(resolvedInputPath, resolvedOutDir) : [resolvedInputPath];
    if (files.length === 0) {
        console.log(`⚠️ No supported files (${SUPPORTED_EXTS.join(', ')}) found in '${resolvedInputPath}'.`);
        return { converted: 0, failed: 0 };
    }

    if (isDirectory) {
        console.log(`\n📁 kerplunk: ${resolvedInputPath}`);
        console.log(`   📄 Found: ${files.length} file(s)`);
        if (themeSpec) {
            const source = !explicitTheme && projectConfig ? ` (from ${projectConfig.source})` : '';
            console.log(`   🎨 Theme:  ${themeLabel}${source}`);
        }
    } else {
        console.log(`\n🚀 kerplunk: ${path.basename(resolvedInputPath)}`);
    }
    if (effectiveBaseUrl) {
        const source = !explicitBaseUrl && projectConfig ? ` (from ${projectConfig.source})` : '';
        console.log(`   🔗 Base URL: ${effectiveBaseUrl}${source}`);
    }
    if (effectiveFormats.length > 1 || !effectiveFormats.includes('html')) {
        const source =
            (!requestedFormats || requestedFormats.length === 0) && projectConfig && projectConfig.formats
                ? ` (from ${projectConfig.source})`
                : '';
        console.log(`   📄 Formats:  ${effectiveFormats.join(', ')}${source}`);
    }
    console.log(
        resolvedOutDir ? `   📂 Output: ${resolvedOutDir}\n` : `   📂 Output: In-place (next to source files)\n`
    );

    // Without a project config, links resolve relative to the folder being built
    // (folder mode) or the current directory (single-file mode).
    const fallbackRoot = isDirectory ? resolvedInputPath : process.cwd();
    let converted = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let fileOutDir = path.dirname(file);
        if (resolvedOutDir) {
            fileOutDir = isDirectory
                ? path.join(resolvedOutDir, path.relative(resolvedInputPath, path.dirname(file)))
                : resolvedOutDir;
        }

        if (isDirectory) {
            console.log(`[${i + 1}/${files.length}] 🚀 ${path.relative(process.cwd(), file)} (${themeLabel})`);
        } else {
            console.log(`   🎨 Theme:  ${themeLabel}`);
        }

        try {
            await convertFile(file, loadedTheme, fileOutDir, {
                ...fileOptions,
                themeName: themeStem,
                formats: effectiveFormats,
                hasWkhtmltopdf,
                baseUrl: effectiveBaseUrl,
                docRelDir: docRelDirFor(file, projectConfig, fallbackRoot),
                indent: isDirectory ? '      ' : '   '
            });
            converted++;
        } catch (err) {
            console.error(`   ❌ Error processing '${file}':`, err.message || err);
            failed++;
        }
    }

    console.log(
        `\n✨ Done! Converted ${converted} of ${files.length} file(s).` +
            (failed > 0 ? ` (${failed} failed)` : '') +
            '\n'
    );
    return { converted, failed };
}

module.exports = {
    SUPPORTED_EXTS,
    DEFAULT_SCOPE,
    findSourceFiles,
    renderHtml,
    convertFile,
    build,
    hasCommand
};
