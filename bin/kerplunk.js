#!/usr/bin/env node

const { build, DEFAULT_SCOPE } = require('../src/pipeline.js');
const { listThemes } = require('../src/themes.js');

function printHelp() {
    console.log(`
kerplunk: Markdown/Word -> Canvas-safe HTML

Usage:
  kerplunk <input-path> [theme] [options]

Arguments:
  <input-path>          Path to .md/.docx file OR folder to convert recursively
  [theme]               Optional theme name or .css path. Default: none, so the
                        output is plain HTML styled by your institution's Canvas theme

Options:
  -t, --theme <theme>   Theme to use (overrides positional theme argument)
  --auto-theme          Auto-detect theme based on folder name (pages -> sakura, etc.)
  -o, --outdir <dir>    Custom output directory (default: same folder as input file(s))
  -b, --base-url <url>  Base URL for links (or set "baseUrl" in package.json, or KERPLUNK_BASE_URL)
  --append-theme        Append '_<theme>' to output filenames
  -s, --scope <class>   CSS scope class for themed output (default: '${DEFAULT_SCOPE}')
  --no-wrapper          Omit the scope <div> from themed output
  --html-only           Generate only Canvas-safe HTML
  --pdf-only            Generate only styled PDF
  --docx                Also generate standalone DOCX
  --no-qti              Disable auto Canvas QTI .zip generation for quiz files
  --list-themes         List all available built-in themes
  -h, --help            Show this help message
  -v, --version         Show version

Examples:
  kerplunk pages/week1-assignment.md
  kerplunk content/ -o dist/
  kerplunk content/ simple -o ./dist
  kerplunk syllabus/syllabus.md --theme=artzt
  kerplunk document.docx simple -o ./dist
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
        autoTheme: false,
        htmlOnly: false,
        pdfOnly: false,
        includeDocx: false,
        noQti: false,
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
        else if (arg === '--auto-theme') opts.autoTheme = true;
        else if (arg === '--no-wrapper') opts.noWrapper = true;
        else if (arg === '--append-theme') opts.appendTheme = true;
        else if (arg === '--html-only') opts.htmlOnly = true;
        else if (arg === '--pdf-only') opts.pdfOnly = true;
        else if (arg === '--docx') opts.includeDocx = true;
        else if (arg === '--no-qti') opts.noQti = true;
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
        console.log('\n🎨 Available Built-in Themes:');
        listThemes().forEach(t => console.log(`  • ${t}`));
        console.log('\nYou can also pass a path to any custom CSS file.');
        return;
    }

    const opts = parseArgs(args);
    if (!opts.input) {
        console.error('❌ Error: No input file or folder specified.');
        printHelp();
        process.exit(1);
    }

    let formats;
    if (opts.pdfOnly) formats = ['pdf'];
    else if (opts.htmlOnly) formats = ['html'];
    else formats = ['html', 'pdf'];
    if (opts.includeDocx && !formats.includes('docx')) formats.push('docx');

    const { failed } = await build(opts.input, {
        theme: opts.theme,
        autoTheme: opts.autoTheme,
        outDir: opts.outDir,
        formats,
        baseUrl: opts.baseUrl,
        scopeClass: opts.scopeClass,
        noWrapper: opts.noWrapper,
        appendTheme: opts.appendTheme,
        noQti: opts.noQti
    });
    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(`❌ Error: ${err.message || err}`);
    process.exit(1);
});
