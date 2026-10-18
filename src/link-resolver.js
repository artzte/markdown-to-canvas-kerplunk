const fs = require('fs');
const path = require('path');

/**
 * Normalizes a base URL ensuring it has an http/https protocol and ends with a slash.
 */
function normalizeBaseUrl(baseUrl) {
    if (!baseUrl || typeof baseUrl !== 'string') return '';
    let url = baseUrl.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) {
        url = 'https://' + url;
    }
    if (!url.endsWith('/')) {
        url += '/';
    }
    return url;
}

/**
 * Extracts a baseUrl setting from a parsed package.json object.
 * Priority:
 * 1. kerplunk.baseUrl
 * 2. baseUrl
 * 3. baseURL
 */
function getBaseUrlFromPackage(pkg) {
    if (!pkg || typeof pkg !== 'object') return null;

    if (pkg.kerplunk && typeof pkg.kerplunk === 'object' && pkg.kerplunk.baseUrl) {
        return pkg.kerplunk.baseUrl;
    }
    if (pkg.baseUrl && typeof pkg.baseUrl === 'string') {
        return pkg.baseUrl;
    }
    if (pkg.baseURL && typeof pkg.baseURL === 'string') {
        return pkg.baseURL;
    }
    return null;
}

/**
 * Extracts a theme setting from a parsed package.json object.
 * Priority:
 * 1. kerplunk.theme
 * 2. theme
 */
function getThemeFromPackage(pkg) {
    if (!pkg || typeof pkg !== 'object') return null;

    if (pkg.kerplunk && typeof pkg.kerplunk === 'object' && typeof pkg.kerplunk.theme === 'string') {
        return pkg.kerplunk.theme;
    }
    if (typeof pkg.theme === 'string') {
        return pkg.theme;
    }
    return null;
}

/**
 * Traverses upwards from `startPath` looking for a package.json or kerplunk config file
 * that sets a baseUrl or theme. Returns { baseUrl, theme, configDir, source } or null.
 */
function findProjectConfig(startPath) {
    if (!startPath) return null;

    let currentDir;
    try {
        currentDir = fs.existsSync(startPath) && fs.statSync(startPath).isDirectory()
            ? path.resolve(startPath)
            : path.dirname(path.resolve(startPath));
    } catch {
        currentDir = path.resolve(process.cwd());
    }

    const rootDir = path.parse(currentDir).root;

    while (currentDir && currentDir !== rootDir) {
        let dirBaseUrl = null;
        let dirTheme = null;
        let dirSource = null;

        // 1. Check dedicated config files first (.kerplunkrc, kerplunk.config.json)
        const configFiles = ['.kerplunkrc', 'kerplunk.config.json'];
        for (const cfgName of configFiles) {
            const cfgPath = path.join(currentDir, cfgName);
            if (fs.existsSync(cfgPath)) {
                try {
                    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                    dirBaseUrl = cfg.baseUrl || cfg.baseURL || cfg.base_url || null;
                    dirTheme = typeof cfg.theme === 'string' ? cfg.theme : null;
                    dirSource = cfgName;
                    break;
                } catch {}
            }
        }

        // 2. Supplement from package.json in the same directory if needed
        const pkgPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (!dirBaseUrl) dirBaseUrl = getBaseUrlFromPackage(pkg);
                if (!dirTheme) dirTheme = getThemeFromPackage(pkg);
                if (!dirSource) dirSource = 'package.json';
            } catch {}
        }

        if (dirBaseUrl || dirTheme) {
            return {
                baseUrl: dirBaseUrl,
                theme: dirTheme,
                configDir: currentDir,
                source: dirSource
            };
        }

        // Stop if at a git root
        if (fs.existsSync(path.join(currentDir, '.git'))) {
            break;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break;
        currentDir = parentDir;
    }

    // Also check process.cwd() as fallback
    const cwd = path.resolve(process.cwd());
    let cwdBaseUrl = null;
    let cwdTheme = null;
    let cwdSource = null;

    const cwdConfigFiles = ['.kerplunkrc', 'kerplunk.config.json'];
    for (const cfgName of cwdConfigFiles) {
        const cfgPath = path.join(cwd, cfgName);
        if (fs.existsSync(cfgPath)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                cwdBaseUrl = cfg.baseUrl || cfg.baseURL || cfg.base_url || null;
                cwdTheme = typeof cfg.theme === 'string' ? cfg.theme : null;
                cwdSource = `${cfgName} (cwd)`;
                break;
            } catch {}
        }
    }

    const cwdPkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(cwdPkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(cwdPkgPath, 'utf8'));
            if (!cwdBaseUrl) cwdBaseUrl = getBaseUrlFromPackage(pkg);
            if (!cwdTheme) cwdTheme = getThemeFromPackage(pkg);
            if (!cwdSource) cwdSource = 'package.json (cwd)';
        } catch {}
    }

    if (cwdBaseUrl || cwdTheme) {
        return {
            baseUrl: cwdBaseUrl,
            theme: cwdTheme,
            configDir: cwd,
            source: cwdSource
        };
    }

    return null;
}

/**
 * Resolves a single relative href attribute against a base URL and document relative directory.
 * Preserves query strings, hashes, external links, and in-page anchors.
 * Normalizes '..' and '.' path segments.
 */
function resolveAnchorHref(href, baseUrl, docRelDir = '') {
    if (!href || typeof href !== 'string') return href;
    const trimmed = href.trim();

    // Leave in-page anchors and protocol links (http:, https:, mailto:, tel:, //, etc.) untouched
    if (trimmed.startsWith('#') || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) {
        return href;
    }

    let urlObj;
    let urlStr = baseUrl.trim();
    if (!/^https?:\/\//i.test(urlStr) && !urlStr.startsWith('//')) {
        urlStr = 'https://' + urlStr;
    }
    try {
        urlObj = new URL(urlStr);
    } catch {
        return href;
    }

    // Split off query string and hash
    const match = trimmed.match(/^([^?#]*)([?#].*)?$/);
    const pathname = match ? match[1] : trimmed;
    const searchAndHash = match ? (match[2] || '') : '';

    let combinedPath;
    if (pathname.startsWith('/')) {
        combinedPath = path.posix.normalize(pathname);
    } else {
        const safeDocRelDir = docRelDir ? docRelDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
        combinedPath = path.posix.normalize(path.posix.join('/', safeDocRelDir, pathname));
    }

    // Append to base URL path without losing base path prefix
    const basePath = urlObj.pathname.replace(/\/+$/, '');
    urlObj.pathname = path.posix.join(basePath, combinedPath);

    return urlObj.origin + urlObj.pathname + searchAndHash;
}

/**
 * Rewrites <a href="..."> tags in an HTML string to prepend and normalize against baseUrl.
 */
function rewriteHtmlAnchors(html, baseUrl, docRelDir = '') {
    if (!html || !baseUrl) return html;

    return html.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
        const updatedAttrs = attrs.replace(/\bhref\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))/gi, (attrMatch, quote, quotedVal, unquotedVal) => {
            const hrefVal = quote ? quotedVal : unquotedVal;
            const q = quote || '"';
            const resolved = resolveAnchorHref(hrefVal, baseUrl, docRelDir);
            return `href=${q}${resolved}${q}`;
        });
        return `<a${updatedAttrs}>`;
    });
}

module.exports = {
    normalizeBaseUrl,
    getBaseUrlFromPackage,
    getThemeFromPackage,
    findProjectConfig,
    resolveAnchorHref,
    rewriteHtmlAnchors
};
