/**
 * kerplunk library API. The CLI (bin/kerplunk.js) is a thin wrapper over build().
 */

const { build, convertFile, renderHtml, findSourceFiles, hasCommand } = require('./src/pipeline.js');
const { resolveTheme, loadTheme, listThemes, flattenThemeCss, THEMES_DIR } = require('./src/themes.js');
const { enhanceTableAccessibility } = require('./src/table-accessibility.js');
const { enhanceCodeAccessibility, getPandocHighlightArgs, getPandocMathArgs } = require('./src/code-accessibility.js');
const { simplifyHtml } = require('./src/html-simplify.js');
const { addHeadingAnchors } = require('./src/heading-anchors.js');
const { isQuizFile, processQuizQti, createQtiZip, parseAssignmentMarkdown } = require('./src/qti-generator.js');
const {
    normalizeBaseUrl,
    getBaseUrlFromPackage,
    getThemeFromPackage,
    normalizeFormats,
    getFormatsFromPackage,
    findProjectConfig,
    resolveAnchorHref,
    rewriteHtmlAnchors
} = require('./src/link-resolver.js');

module.exports = {
    // Pipeline
    build,
    convertFile,
    renderHtml,
    findSourceFiles,
    hasCommand,

    // Themes
    resolveTheme,
    loadTheme,
    listThemes,
    flattenThemeCss,
    THEMES_DIR,

    // Accessibility
    enhanceTableAccessibility,
    enhanceCodeAccessibility,
    getPandocHighlightArgs,
    getPandocMathArgs,
    simplifyHtml,
    addHeadingAnchors,

    // Link & URL resolution
    normalizeBaseUrl,
    getBaseUrlFromPackage,
    getThemeFromPackage,
    normalizeFormats,
    getFormatsFromPackage,
    findProjectConfig,
    resolveAnchorHref,
    rewriteHtmlAnchors,

    // Canvas QTI quiz generation
    isQuizFile,
    processQuizQti,
    createQtiZip,
    parseAssignmentMarkdown
};
