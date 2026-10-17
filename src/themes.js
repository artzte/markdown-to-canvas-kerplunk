const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const cssVariables = require('postcss-css-variables');

// Pre-flattened themes embedded by scripts/build-themes.js, used by the bundled
// binary when the themes/ folder isn't on disk.
let builtinThemes = {};
try {
    builtinThemes = require('./themes-data.js');
} catch {
    // Not built yet; themes load from themes/ instead.
}

const THEMES_DIR = path.resolve(__dirname, '..', 'themes');
const USER_THEMES_DIR = path.join(process.env.HOME || '', '.config', 'kerplunk', 'themes');

/**
 * Turns raw theme CSS into something juice can inline: CSS variables are resolved
 * to literal values and data: URLs are dropped. The theme's license comment is
 * returned separately as an HTML comment so it can be stamped onto the output.
 */
async function flattenThemeCss(rawCss, from) {
    const licenseMatch = rawCss.match(/\/\*[\s\S]*?(?:Theme|Copyright|License)[\s\S]*?\*\//i);
    let licenseHeader = '';
    if (licenseMatch) {
        const cleanText = licenseMatch[0].replace(/\/\*!?/, '').replace(/\*\//, '').trim();
        licenseHeader = `<!-- ${cleanText} -->`;
    }

    let sanitizedCss = rawCss.replace(/:host/g, ':root');
    sanitizedCss = sanitizedCss.replace(/url\("data:[^"]+"\)/g, 'none');

    const result = await postcss([
        cssVariables({ preserve: false })
    ]).process(sanitizedCss, { from, to: undefined });

    return { css: result.css, licenseHeader };
}

/**
 * Finds a theme by name or path. Search order: cwd, cwd/themes, the source file's
 * folder, its themes/ subfolder, the bundled themes/, ~/.config/kerplunk/themes,
 * then the embedded built-ins.
 */
async function resolveTheme(themeName, baseDir) {
    const candidateFile = themeName.endsWith('.css') ? themeName : `${themeName}.css`;

    const checkPaths = [
        path.resolve(process.cwd(), candidateFile),
        path.resolve(process.cwd(), 'themes', candidateFile),
        path.resolve(baseDir, candidateFile),
        path.resolve(baseDir, 'themes', candidateFile),
        path.join(THEMES_DIR, candidateFile),
        path.join(USER_THEMES_DIR, candidateFile)
    ];

    for (const p of checkPaths) {
        if (fs.existsSync(p)) {
            return flattenThemeCss(fs.readFileSync(p, 'utf8'), p);
        }
    }

    if (builtinThemes[themeName]) {
        return builtinThemes[themeName];
    }

    throw new Error(`Theme '${themeName}' not found. Run 'kerplunk --list-themes' to view available themes.`);
}

const themeCache = new Map();

async function loadTheme(themeName, baseDir) {
    const cacheKey = `${themeName}:${baseDir}`;
    if (!themeCache.has(cacheKey)) {
        themeCache.set(cacheKey, await resolveTheme(themeName, baseDir));
    }
    return themeCache.get(cacheKey);
}

function listThemes() {
    if (Object.keys(builtinThemes).length > 0) {
        return Object.keys(builtinThemes);
    }
    try {
        return fs.readdirSync(THEMES_DIR)
            .filter(f => f.endsWith('.css'))
            .map(f => path.basename(f, '.css'));
    } catch {
        return [];
    }
}

module.exports = {
    THEMES_DIR,
    flattenThemeCss,
    loadTheme,
    listThemes
};
