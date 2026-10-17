/**
 * kerplunk library API. The CLI (bin/kerplunk.js) is a thin wrapper over build().
 */

const { build, convertFile, renderHtml, findSourceFiles, detectTheme } = require('./src/pipeline.js');
const { loadTheme, listThemes, flattenThemeCss } = require('./src/themes.js');
const { enhanceTableAccessibility } = require('./src/table-accessibility.js');
const { enhanceCodeAccessibility, getPandocHighlightArgs } = require('./src/code-accessibility.js');
const { simplifyHtml } = require('./src/html-simplify.js');
const {
    isQuizFile,
    processQuizQti,
    createQtiZip,
    parseAssignmentMarkdown
} = require('./src/qti-generator.js');
const {
    normalizeBaseUrl,
    getBaseUrlFromPackage,
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
    detectTheme,

    // Themes
    loadTheme,
    listThemes,
    flattenThemeCss,

    // Accessibility
    enhanceTableAccessibility,
    enhanceCodeAccessibility,
    getPandocHighlightArgs,
    simplifyHtml,

    // Link & URL resolution
    normalizeBaseUrl,
    getBaseUrlFromPackage,
    findProjectConfig,
    resolveAnchorHref,
    rewriteHtmlAnchors,

    // Canvas QTI quiz generation
    isQuizFile,
    processQuizQti,
    createQtiZip,
    parseAssignmentMarkdown
};
