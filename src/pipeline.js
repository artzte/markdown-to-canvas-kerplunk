const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const juice = require('juice');
const { loadTheme } = require('./themes.js');
const { enhanceTableAccessibility } = require('./table-accessibility.js');
const { enhanceCodeAccessibility, getPandocHighlightArgs } = require('./code-accessibility.js');
const { simplifyHtml } = require('./html-simplify.js');
const { isQuizFile, processQuizQti } = require('./qti-generator.js');
const { findProjectConfig, rewriteHtmlAnchors } = require('./link-resolver.js');

const SUPPORTED_EXTS = ['.md', '.markdown', '.docx'];
const DEFAULT_SCOPE = 'kerplunk';

// Folder (or file stem) name -> theme, used by --auto-theme.
const THEME_MAP = {
    'syllabus': 'latex',
    'assignments': 'paper',
    'assignment': 'paper',
    'pages': 'sakura',
    'page': 'sakura',
    'announcements': 'water',
    'announcement': 'water',
    'discussions': 'simple',
    'discussion': 'simple'
};

function isSupportedFile(filePath) {
    return SUPPORTED_EXTS.includes(path.extname(filePath).toLowerCase());
}

function isMarkdownFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.markdown';
}

function detectTheme(inputFilePath) {
    const parts = path.resolve(inputFilePath).split(path.sep);
    for (let i = parts.length - 2; i >= 0; i--) {
        const seg = parts[i].toLowerCase();
        if (THEME_MAP[seg]) {
            return THEME_MAP[seg];
        }
    }
    const baseStem = path.basename(inputFilePath, path.extname(inputFilePath)).toLowerCase();
    return THEME_MAP[baseStem] || null;
}

function hasCommand(cmd) {
    try {
        execFileSync('which', [cmd], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
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
 * fixes -> pandoc cleanup -> link rewriting. With a theme, the result is also wrapped
 * in a scope <div> and the theme's styles are inlined; with theme = null the plain
 * HTML is returned so Canvas's own theme styles it.
 */
async function renderHtml(inputPath, theme, options = {}) {
    const {
        scopeClass = DEFAULT_SCOPE,
        noWrapper = false,
        baseUrl = null,
        docRelDir = ''
    } = options;

    const sourceFormat = isMarkdownFile(inputPath) ? 'gfm' : 'docx';
    const rawHtml = await runPandoc([
        inputPath,
        '-f', sourceFormat,
        '-t', 'html5',
        '--wrap=none',
        '--math-method=webtex',
        ...getPandocHighlightArgs()
    ]);

    const tableAccessibleHtml = enhanceTableAccessibility(rawHtml);
    const accessibleHtml = enhanceCodeAccessibility(tableAccessibleHtml);
    const simpleHtml = simplifyHtml(accessibleHtml);
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
 * Writes the requested outputs (html, pdf, docx, plus a QTI zip for quiz files)
 * for one source file into outputDir. themeName = null means no theme.
 */
async function convertFile(inputPath, themeName, outputDir, options = {}) {
    const {
        appendTheme = false,
        formats = ['html'],
        hasWkhtmltopdf = false,
        noQti = false,
        baseUrl = null,
        docRelDir = '',
        indent = '   '
    } = options;

    const fileExt = path.extname(inputPath).toLowerCase();
    const baseName = path.basename(inputPath, fileExt);
    const sourceFormat = isMarkdownFile(inputPath) ? 'gfm' : 'docx';
    const outStem = appendTheme && themeName ? `${baseName}_${themeName}` : baseName;

    fs.mkdirSync(outputDir, { recursive: true });

    const theme = themeName ? await loadTheme(themeName, path.dirname(inputPath)) : null;
    const inlinedHtml = await renderHtml(inputPath, theme, options);

    if (formats.includes('html')) {
        const htmlOutputFile = path.join(outputDir, `${outStem}.html`);
        const stampParts = [`<!-- Generated by kerplunk on ${new Date().toISOString()} -->`];
        if (theme && theme.licenseHeader && theme.licenseHeader.trim()) {
            stampParts.push(theme.licenseHeader.trim());
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
                execFileSync('wkhtmltopdf', [
                    '--quiet',
                    '--enable-local-file-access',
                    tempHtmlPath,
                    pdfOutputFile
                ]);
                console.log(`${indent}✅ Styled PDF:  ${pdfOutputFile}`);
            } catch (err) {
                console.error(`${indent}❌ wkhtmltopdf error: ${err.message}`);
            } finally {
                fs.rmSync(tempHtmlPath, { force: true });
            }
        } else {
            console.log(`${indent}...Rendering PDF via pandoc (wkhtmltopdf not found)...`);
            try {
                await runPandoc([
                    inputPath,
                    '-f', sourceFormat,
                    '-t', 'pdf',
                    '-o', pdfOutputFile,
                    '--math-method=webtex'
                ]);
                console.log(`${indent}✅ Standalone PDF: ${pdfOutputFile}`);
            } catch (err) {
                console.error(`${indent}❌ PDF Pandoc Error: ${err.message}`);
                console.error(`${indent}💡 Tip: Install wkhtmltopdf for PDFs that match the theme: sudo apt install wkhtmltopdf`);
            }
        }
    }

    if (formats.includes('docx')) {
        const docxOutputFile = path.join(outputDir, `${outStem}.docx`);
        console.log(`${indent}...Rendering Standalone DOCX via pandoc...`);
        try {
            await runPandoc([
                inputPath,
                '-f', sourceFormat,
                '-t', 'docx',
                '-o', docxOutputFile
            ]);
            console.log(`${indent}✅ DOCX Output:  ${docxOutputFile}`);
        } catch (err) {
            console.error(`${indent}❌ DOCX Pandoc Error: ${err.message}`);
        }
    }

    if (!noQti && isMarkdownFile(inputPath) && isQuizFile(inputPath)) {
        try {
            const qtiResult = processQuizQti(inputPath, outputDir, { baseUrl, docRelDir });
            if (qtiResult) {
                console.log(`${indent}📦 Canvas QTI:    ${path.basename(qtiResult.outputPath)} (${qtiResult.totalQuestions} questions, ${qtiResult.totalPoints} pts)`);
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
 *   autoTheme   pick a theme per file from its folder name (see THEME_MAP)
 *   outDir      output folder (default: next to each source file)
 *   formats     any of 'html', 'pdf', 'docx' (default: ['html'])
 *   baseUrl     overrides KERPLUNK_BASE_URL and the project config
 *   scopeClass, noWrapper, appendTheme, noQti
 *
 * Returns { converted, failed }.
 */
async function build(inputPath, options = {}) {
    const {
        theme: requestedTheme = null,
        autoTheme = false,
        outDir = null,
        formats = ['html'],
        baseUrl = null,
        ...fileOptions
    } = options;

    const theme = requestedTheme && requestedTheme.toLowerCase() !== 'none' ? requestedTheme : null;
    const resolvedInputPath = path.resolve(inputPath);
    if (!fs.existsSync(resolvedInputPath)) {
        throw new Error(`Source file or folder not found: '${resolvedInputPath}'`);
    }

    const isDirectory = fs.statSync(resolvedInputPath).isDirectory();
    if (!isDirectory && !isSupportedFile(resolvedInputPath)) {
        throw new Error(`Unsupported file type '${path.extname(resolvedInputPath)}'. Supported: ${SUPPORTED_EXTS.join(', ')}`);
    }

    if (!hasCommand('pandoc')) {
        throw new Error(`'pandoc' was not found on PATH. Install it from https://pandoc.org/installing.html`);
    }
    const hasWkhtmltopdf = formats.includes('pdf') && hasCommand('wkhtmltopdf');

    const resolvedOutDir = outDir ? path.resolve(outDir) : null;
    const projectConfig = findProjectConfig(resolvedInputPath);
    const explicitBaseUrl = baseUrl || process.env.KERPLUNK_BASE_URL || null;
    const effectiveBaseUrl = explicitBaseUrl || (projectConfig ? projectConfig.baseUrl : null);

    const files = isDirectory ? findSourceFiles(resolvedInputPath, resolvedOutDir) : [resolvedInputPath];
    if (files.length === 0) {
        console.log(`⚠️ No supported files (${SUPPORTED_EXTS.join(', ')}) found in '${resolvedInputPath}'.`);
        return { converted: 0, failed: 0 };
    }

    if (isDirectory) {
        console.log(`\n📁 kerplunk: ${resolvedInputPath}`);
        console.log(`   📄 Found: ${files.length} file(s)`);
        if (theme) {
            console.log(`   🎨 Theme:  ${theme.toUpperCase()} (applied to all)`);
        } else if (autoTheme) {
            console.log(`   🎨 Theme:  Auto-detect by folder (pages -> sakura, syllabus -> latex, etc.)`);
        }
    } else {
        console.log(`\n🚀 kerplunk: ${path.basename(resolvedInputPath)}`);
    }
    if (effectiveBaseUrl) {
        const source = !explicitBaseUrl && projectConfig ? ` (from ${projectConfig.source})` : '';
        console.log(`   🔗 Base URL: ${effectiveBaseUrl}${source}`);
    }
    console.log(resolvedOutDir
        ? `   📂 Output: ${resolvedOutDir}\n`
        : `   📂 Output: In-place (next to source files)\n`);

    // Without a project config, links resolve relative to the folder being built
    // (folder mode) or the current directory (single-file mode).
    const fallbackRoot = isDirectory ? resolvedInputPath : process.cwd();
    let converted = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileTheme = theme || (autoTheme ? detectTheme(file) : null);
        const themeLabel = fileTheme ? fileTheme.toUpperCase() : 'none';
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
            await convertFile(file, fileTheme, fileOutDir, {
                ...fileOptions,
                formats,
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

    console.log(`\n✨ Done! Converted ${converted} of ${files.length} file(s).` + (failed > 0 ? ` (${failed} failed)` : '') + '\n');
    return { converted, failed };
}

module.exports = {
    SUPPORTED_EXTS,
    DEFAULT_SCOPE,
    THEME_MAP,
    detectTheme,
    findSourceFiles,
    renderHtml,
    convertFile,
    build
};
