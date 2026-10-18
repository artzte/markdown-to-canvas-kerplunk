/**
 * Appends a "#" permalink to headings (h1-h6) with an id, so a section's URL
 * can be copied from the page:
 *   <h2 id="grading">Grading <a href="#grading" style="color: #888; font-size: 0.8em; text-decoration: none;" aria-label="Link to section: Grading">#</a></h2>
 *
 * The very first heading in the file is skipped (it serves as the page title/banner).
 * The link is always visible: showing it only on hover needs a :hover rule, and
 * Canvas strips <style> blocks.
 */
function addHeadingAnchors(html) {
    if (!html || typeof html !== 'string') {
        return html;
    }

    let isFirst = true;
    return html.replace(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, inner) => {
        if (isFirst) {
            isFirst = false;
            return match;
        }
        const idMatch = attrs.match(/\bid\s*=\s*"([^"]+)"/i);
        if (!idMatch || /<a\b[^>]*href\s*=\s*"#/i.test(inner)) {
            return match;
        }
        const id = idMatch[1];
        const label = inner.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;').trim();
        return `<${tag}${attrs}>${inner} <a href="#${id}" style="color: #888; font-size: 0.8em; text-decoration: none;" aria-label="Link to section: ${label}">#</a></${tag}>`;
    });
}

module.exports = {
    addHeadingAnchors
};
