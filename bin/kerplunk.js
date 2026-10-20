#!/usr/bin/env node

const { build, DEFAULT_SCOPE } = require('../src/pipeline.js');
const { listThemes } = require('../src/themes.js');

function printHelp() {
    console.log(`
kerplunk: Markdown -> Canvas-safe HTML

Usage:
  kerplunk <input-path> [theme] [options]

Arguments:
  <input-path>          Path to .md file OR folder to convert recursively
  [theme]               Optional theme CSS path (overrides config setting)

Options:
  -t, --theme <path>    Theme CSS file to use (e.g. artzt.css or themes/water.css)
  -o, --outdir <dir>    Custom output directory (default: same folder as input file(s))
  -b, --base-url <url>  Base URL for links (or set "baseUrl" in kerplunk.config.json/package.json)
  --append-theme        Append '_<theme>' to output filenames
  -s, --scope <class>   CSS scope class for themed output (default: '${DEFAULT_SCOPE}')
  --no-wrapper          Omit the scope <div> from themed output
  --pdf                 Also generate styled PDF (via wkhtmltopdf if installed)
  --pdf-only            Generate only styled PDF
  --html-only           Generate only Canvas-safe HTML (default)
  --no-qti              Disable auto Canvas QTI .zip generation for quiz files
  --no-anchors          Don't add "#" section links to headings
  --list-themes         List sample starter themes provided with kerplunk
  -h, --help            Show this help message
  -v, --version         Show version

Examples:
  kerplunk pages/week1-assignment.md
  kerplunk content/ -o dist/
  kerplunk content/ artzt.css -o ./dist
  kerplunk syllabus/syllabus.md --theme=themes/artzt.css
`);
}

function parseArgs(args) {
    const opts = {
        input: null,
        theme: null,
        outDir: null,
        scopeClass: DEFAULT_SCOPE,
        noWrapper: false,
        appendTheme: false,
        htmlOnly: false,
        pdfOnly: false,
        pdf: false,
        noQti: false,
        noAnchors: false,
        baseUrl: null
    };
    const valueOf = (arg) => arg.slice(arg.indexOf('=') + 1);
    const stripDot = (cls) => (cls || DEFAULT_SCOPE).replace(/^\./, '');

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '-t' || arg === '--theme') opts.theme = args[++i];
        else if (arg.startsWith('--theme=')) opts.theme = valueOf(arg);
        else if (arg === '-b' || arg === '--base-url') opts.baseUrl = args[++i];
        else if (arg.startsWith('--base-url=')) opts.baseUrl = valueOf(arg);
        else if (arg === '-o' || arg === '--outdir') opts.outDir = args[++i];
        else if (arg.startsWith('--outdir=')) opts.outDir = valueOf(arg);
        else if (arg === '-s' || arg === '--scope') opts.scopeClass = stripDot(args[++i]);
        else if (arg.startsWith('--scope=')) opts.scopeClass = stripDot(valueOf(arg));
        else if (arg === '--no-wrapper') opts.noWrapper = true;
        else if (arg === '--append-theme') opts.appendTheme = true;
        else if (arg === '--pdf') opts.pdf = true;
        else if (arg === '--pdf-only') opts.pdfOnly = true;
        else if (arg === '--html-only') opts.htmlOnly = true;
        else if (arg === '--no-qti') opts.noQti = true;
        else if (arg === '--no-anchors') opts.noAnchors = true;
        else if (arg.startsWith('-')) {
            console.error(`❌ Error: Unknown option '${arg}'.`);
            process.exit(1);
        } else if (!opts.input) opts.input = arg;
        else if (!opts.theme) opts.theme = arg;
    }
    return opts;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
        printHelp();
        return;
    }
    if (args.includes('-v') || args.includes('--version')) {
        console.log(`kerplunk v${require('../package.json').version}`);
        return;
    }
    if (args.includes('--list-themes')) {
        console.log('\n🎨 Sample Themes (provided in kerplunk/themes/):');
        listThemes().forEach((t) => console.log(`  • ${t} (${t}.css)`));
        console.log('\nCopy any sample theme to your course folder and configure it in kerplunk.config.json:');
        console.log('  { "theme": "my-theme.css" }');
        console.log('Or specify it via CLI: --theme my-theme.css\n');
        return;
    }

    const opts = parseArgs(args);
    if (!opts.input) {
        console.error('❌ Error: No input file or folder specified.');
        printHelp();
        process.exit(1);
    }

    let formats = undefined;
    if (opts.pdfOnly) formats = ['pdf'];
    else if (opts.pdf) formats = ['html', 'pdf'];
    else if (opts.htmlOnly) formats = ['html'];

    const { failed } = await build(opts.input, {
        theme: opts.theme,
        outDir: opts.outDir,
        formats,
        baseUrl: opts.baseUrl,
        scopeClass: opts.scopeClass,
        noWrapper: opts.noWrapper,
        appendTheme: opts.appendTheme,
        noQti: opts.noQti,
        headingAnchors: !opts.noAnchors
    });
    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(`❌ Error: ${err.message || err}`);
    process.exit(1);
});
