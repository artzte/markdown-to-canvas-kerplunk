/**
 * Strips the markup pandoc adds that Canvas doesn't need, so the output is plain
 * semantic HTML styled by the institution's Canvas theme:
 * 1. Removes pandoc's own classes (level1, task-list, footnote-ref, ...); classes
 *    written by the author in raw HTML are kept
 * 2. Removes id attributes that nothing in the document links to (#id)
 * 3. Removes default-valued attributes: style="text-align: left;" on cells, type="1" on <ol>
 * 4. Unwraps attribute-less <span> (pandoc wraps autolink text in one)
 * 5. Replaces task-list checkboxes (Canvas strips <input>) with ☐ / ☑ characters
 *
 * Code blocks are expected to have been cleaned by enhanceCodeAccessibility first;
 * their text is entity-escaped, so the tag rewriting below never touches it.
 */

const PANDOC_CLASSES = new Set([
    'level1',
    'level2',
    'level3',
    'level4',
    'level5',
    'level6',
    'task-list',
    'footnotes',
    'footnotes-end-of-document',
    'footnote-ref',
    'footnote-back',
    'math',
    'inline',
    'display',
    'header',
    'odd',
    'even',
    'uri',
    'email',
    'smallcaps',
    'sourceCode'
]);

const ATTR_REGEX = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function simplifyHtml(html) {
    if (!html || typeof html !== 'string') {
        return html;
    }

    let result = html.replace(
        /<label><input type="checkbox"( checked="")? \/>([\s\S]*?)<\/label>/gi,
        (match, checked, label) => `${checked ? '☑' : '☐'} ${label}`
    );

    const linkedIds = new Set(
        [...result.matchAll(/\bhref\s*=\s*["']#([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]))
    );

    result = result.replace(/<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*?)?(\s*\/?)>/g, (match, tag, attrs, close) => {
        if (!attrs) return match;
        const tagName = tag.toLowerCase();
        const kept = [];
        let changed = false;

        for (const m of attrs.matchAll(ATTR_REGEX)) {
            const name = m[1];
            const lowerName = name.toLowerCase();
            const value = m[2] ?? m[3] ?? m[4];

            if (lowerName === 'class' && value !== undefined) {
                const classes = value.split(/\s+/).filter((c) => c && !PANDOC_CLASSES.has(c));
                if (classes.length > 0) kept.push(`class="${classes.join(' ')}"`);
                changed = changed || classes.join(' ') !== value;
                continue;
            }
            if (
                (lowerName === 'id' && value !== undefined && !linkedIds.has(value)) ||
                ((tagName === 'td' || tagName === 'th') &&
                    lowerName === 'style' &&
                    /^\s*text-align:\s*left;?\s*$/i.test(value || '')) ||
                (tagName === 'ol' && lowerName === 'type' && value === '1')
            ) {
                changed = true;
                continue;
            }
            kept.push(value === undefined ? name : `${name}="${value}"`);
        }

        if (!changed) return match;
        return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}${close}>`;
    });

    // Unwrap bare spans; innermost first so nested ones all come off.
    let previous;
    do {
        previous = result;
        result = result.replace(/<span>((?:(?!<\/?span\b)[\s\S])*?)<\/span>/gi, '$1');
    } while (result !== previous);

    return result;
}

module.exports = {
    simplifyHtml
};
