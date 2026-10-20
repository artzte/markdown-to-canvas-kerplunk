const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const cssVariables = require('postcss-css-variables');

// Reference directory for example starter themes bundled with kerplunk
const THEMES_DIR = path.resolve(__dirname, '..', 'themes');

/**
 * Turns raw theme CSS into something juice can inline: CSS variables are resolved
 * to literal values and data: URLs are dropped. The theme's license comment is
 * returned separately as an HTML comment so it can be stamped onto the output.
 */
async function flattenThemeCss(rawCss, from) {
    const licenseMatch = rawCss.match(/\/\*[\s\S]*?(?:Theme|Copyright|License)[\s\S]*?\*\//i);
    let licenseHeader = '';
    if (licenseMatch) {
        const cleanText = licenseMatch[0]
            .replace(/\/\*!?/, '')
            .replace(/\*\//, '')
            .trim();
        licenseHeader = `<!-- ${cleanText} -->`;
    }

    let sanitizedCss = rawCss.replace(/:host/g, ':root');
    sanitizedCss = sanitizedCss.replace(/url\("data:[^"]+"\)/g, 'none');

    const result = await postcss([cssVariables({ preserve: false })]).process(sanitizedCss, { from, to: undefined });

    return { css: result.css, licenseHeader };
}

/**
 * Resolves a user-specified theme file path.
 * Checks relative to `baseDir` (e.g. project config folder or cwd) and cwd.
 */
async function resolveTheme(themePath, baseDir = process.cwd()) {
    if (!themePath || typeof themePath !== 'string') {
        throw new Error('No theme path specified.');
    }

    const candidateFiles = [themePath];
    if (!themePath.endsWith('.css')) {
        candidateFiles.push(`${themePath}.css`);
    }

    const checkDirs = [baseDir];
    if (path.resolve(baseDir) !== path.resolve(process.cwd())) {
        checkDirs.push(process.cwd());
    }

    for (const dir of checkDirs) {
        for (const candidate of candidateFiles) {
            const p = path.resolve(dir, candidate);
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                return flattenThemeCss(fs.readFileSync(p, 'utf8'), p);
            }
        }
    }

    const searchedLocations = checkDirs.map((d) => `  • ${path.resolve(d, candidateFiles[0])}`).join('\n');
    throw new Error(
        `Theme file '${themePath}' not found.\nSearched in:\n${searchedLocations}\n` +
            `Please provide a valid CSS file path or see 'kerplunk --list-themes' for starter examples.`
    );
}

const themeCache = new Map();

async function loadTheme(themePath, baseDir = process.cwd()) {
    const cacheKey = `${themePath}:${baseDir}`;
    if (!themeCache.has(cacheKey)) {
        themeCache.set(cacheKey, await resolveTheme(themePath, baseDir));
    }
    return themeCache.get(cacheKey);
}

/**
 * Lists sample themes provided with kerplunk as starting examples.
 */
function listThemes() {
    try {
        if (fs.existsSync(THEMES_DIR)) {
            return fs
                .readdirSync(THEMES_DIR)
                .filter((f) => f.endsWith('.css'))
                .map((f) => path.basename(f, '.css'));
        }
    } catch {}
    return [];
}

module.exports = {
    THEMES_DIR,
    flattenThemeCss,
    resolveTheme,
    loadTheme,
    listThemes
};
