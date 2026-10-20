/**
 * Enhances HTML tables for accessibility compliance (WCAG 2.1 AA / Section 508 / Canvas LMS):
 * 1. Converts paragraphs immediately following a table starting with ": " or "Caption: " into <caption>
 * 2. Generates an automatic descriptive <caption> if no caption is present (preventing Canvas accessibility warnings)
 * 3. Adds scope="col" to column header <th> cells
 * 4. Adds scope="row" to row header <th> cells
 */

function enhanceTableAccessibility(html) {
    if (!html || !html.includes('<table')) {
        return html;
    }

    // Matches a <table>...</table> optionally followed by a caption paragraph <p>: ...</p> or <p>Caption: ...</p>
    const tableRegex = /<table\b([^>]*)>([\s\S]*?)<\/table>(?:\s*<p>(?::|Caption:)\s*([\s\S]*?)<\/p>)?/gi;

    return html.replace(tableRegex, (match, tableAttrs, tableInner, explicitCaption) => {
        let captionText = null;

        if (explicitCaption && explicitCaption.trim()) {
            captionText = explicitCaption.trim();
        } else {
            // Check if <caption> already exists in tableInner
            const existingCaption = tableInner.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
            if (!existingCaption) {
                // Extract column headers to create an automatic, meaningful caption
                const theadSection = tableInner.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
                const searchScope = theadSection
                    ? theadSection[1]
                    : tableInner.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || tableInner;

                const headerMatches = [...searchScope.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
                const headers = headerMatches.map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);

                if (headers.length > 0) {
                    const headerList =
                        headers.length > 4 ? headers.slice(0, 4).join(', ') + ', etc.' : headers.join(', ');
                    captionText = `Table: ${headerList}`;
                } else {
                    captionText = 'Data Table';
                }
            }
        }

        let updatedInner = tableInner;

        // Inject <caption> if we determined a caption and one isn't already present
        if (captionText && !/<caption\b/i.test(updatedInner)) {
            const captionHtml = `\n<caption>${captionText}</caption>\n`;
            updatedInner = captionHtml + updatedInner;
        }

        // Add scope="col" to <th> in <thead>
        updatedInner = updatedInner.replace(
            /<thead\b([^>]*)>([\s\S]*?)<\/thead>/gi,
            (theadMatch, theadAttrs, theadInner) => {
                const updatedThead = theadInner.replace(/<th\b([^>]*)>/gi, (thMatch, thAttrs) => {
                    if (/scope\s*=/i.test(thAttrs)) return thMatch;
                    return `<th scope="col"${thAttrs}>`;
                });
                return `<thead${theadAttrs}>${updatedThead}</thead>`;
            }
        );

        // Add scope="col" (first row) or scope="row" (subsequent rows) to <th> inside <tbody>
        const hasThead = /<thead\b/i.test(tableInner);
        let rowIndex = 0;
        updatedInner = updatedInner.replace(
            /<tbody\b([^>]*)>([\s\S]*?)<\/tbody>/gi,
            (tbodyMatch, tbodyAttrs, tbodyInner) => {
                const updatedTbody = tbodyInner.replace(
                    /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi,
                    (trMatch, trAttrs, trInner) => {
                        const isFirstRowWithoutThead = !hasThead && rowIndex === 0;
                        rowIndex++;
                        const updatedTr = trInner.replace(/<th\b([^>]*)>/gi, (thMatch, thAttrs) => {
                            if (/scope\s*=/i.test(thAttrs)) return thMatch;
                            const scopeVal = isFirstRowWithoutThead ? 'col' : 'row';
                            return `<th scope="${scopeVal}"${thAttrs}>`;
                        });
                        return `<tr${trAttrs}>${updatedTr}</tr>`;
                    }
                );
                return `<tbody${tbodyAttrs}>${updatedTbody}</tbody>`;
            }
        );

        // If <tr> tags are directly under <table> without <thead> or <tbody>
        if (!hasThead && !/<tbody\b/i.test(updatedInner)) {
            let directRowIndex = 0;
            updatedInner = updatedInner.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi, (trMatch, trAttrs, trInner) => {
                const isFirstRow = directRowIndex === 0;
                directRowIndex++;
                const updatedTr = trInner.replace(/<th\b([^>]*)>/gi, (thMatch, thAttrs) => {
                    if (/scope\s*=/i.test(thAttrs)) return thMatch;
                    const scopeVal = isFirstRow ? 'col' : 'row';
                    return `<th scope="${scopeVal}"${thAttrs}>`;
                });
                return `<tr${trAttrs}>${updatedTr}</tr>`;
            });
        }

        return `<table${tableAttrs}>${updatedInner}</table>`;
    });
}

module.exports = {
    enhanceTableAccessibility
};
