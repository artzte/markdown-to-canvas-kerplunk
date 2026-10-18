/**
 * Canvas QTI 1.2 Package Generator for Essay Questions
 *
 * Converts Markdown files containing `### Question <n>: <Title>` into
 * Canvas-compatible QTI .zip packages.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const AdmZip = require('adm-zip');
const { rewriteHtmlAnchors } = require('./link-resolver.js');
const { enhanceTableAccessibility } = require('./table-accessibility.js');
const { enhanceCodeAccessibility, getPandocHighlightArgs } = require('./code-accessibility.js');
const { simplifyHtml } = require('./html-simplify.js');

/**
 * Escapes text for XML attribute or text node content.
 */
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Converts a markdown snippet to clean HTML.
 * Uses pandoc if available; falls back to simple paragraph wrapping.
 */
function markdownToHtml(mdText, { baseUrl = null, docRelDir = '' } = {}) {
    if (!mdText || !mdText.trim()) return '';
    let html;
    try {
        const stdout = execFileSync(
            'pandoc',
            ['-f', 'gfm', '-t', 'html5', '--wrap=none', '--math-method=webtex', ...getPandocHighlightArgs()],
            {
                input: mdText,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            }
        );
        html = stdout.trim();
    } catch {
        // Fallback: simple paragraphs
        html = mdText
            .split(/\n\s*\n/)
            .map((p) => `<p>${escapeXml(p.trim())}</p>`)
            .join('\n');
    }

    if (html) {
        html = enhanceTableAccessibility(html);
        html = enhanceCodeAccessibility(html);
        html = simplifyHtml(html);
    }

    if (baseUrl) {
        html = rewriteHtmlAnchors(html, baseUrl, docRelDir);
    }
    return html;
}

/**
 * Parses questions from markdown text.
 * Expects headings like:
 *   ### Question 1: Title
 *   ### Question 2: Title (5 pts)
 *   ### Question 3 [10 points]
 *   ## Question 1: ...
 *
 * Also extracts:
 * - Quiz title (from top `# Title` or fallback)
 * - Quiz description (introductory text before the first question)
 */
function parseAssignmentMarkdown(markdownText, fallbackTitle = 'Assignment Quiz') {
    const lines = markdownText.split(/\r?\n/);
    const questions = [];

    let quizTitle = null;
    const introLines = [];
    let currentQ = null;
    let seenFirstQuestion = false;

    const titleHeaderRegex = /^#\s+(.+)$/;
    const qHeaderRegex = /^#{2,3}\s+Question\s+(\d+)[:\s]*(.*)$/i;
    const majorHeaderRegex = /^#{1,2}\s+(?!Question\b)/i;

    for (const line of lines) {
        // Detect top-level title if not yet set
        if (!quizTitle && !seenFirstQuestion) {
            const titleMatch = line.match(titleHeaderRegex);
            if (titleMatch) {
                quizTitle = titleMatch[1].trim();
                continue;
            }
        }

        // Check for question header
        const qMatch = line.match(qHeaderRegex);
        if (qMatch) {
            seenFirstQuestion = true;
            if (currentQ) {
                currentQ.prompt = currentQ.promptLines.join('\n').trim();
                questions.push(currentQ);
            }

            const num = parseInt(qMatch[1], 10);
            let rawTitle = (qMatch[2] || '').trim();
            if (rawTitle.startsWith(':')) {
                rawTitle = rawTitle.slice(1).trim();
            }

            // Extract optional points: (10 pts) or [5 points]
            let points = 1.0;
            const ptsMatch = rawTitle.match(/(?:\(|\[)\s*([\d.]+)\s*(?:pts?|points?)\s*(?:\)|\])/i);
            if (ptsMatch) {
                points = parseFloat(ptsMatch[1]) || 1.0;
                rawTitle = rawTitle.replace(ptsMatch[0], '').trim();
            }

            const title = rawTitle || `Question ${num}`;

            currentQ = {
                number: num,
                title,
                points,
                promptLines: []
            };
            continue;
        }

        if (!seenFirstQuestion) {
            introLines.push(line);
        } else if (currentQ) {
            // Check if we hit a major section header (e.g. ## Rubric, ## Submission)
            if (line.match(majorHeaderRegex)) {
                currentQ.prompt = currentQ.promptLines.join('\n').trim();
                questions.push(currentQ);
                currentQ = null;
            } else {
                currentQ.promptLines.push(line);
            }
        }
    }

    if (currentQ) {
        currentQ.prompt = currentQ.promptLines.join('\n').trim();
        questions.push(currentQ);
    }

    // If no explicit "### Question" headings were found, treat the entire assignment as a single essay question prompt
    if (questions.length === 0) {
        let docPoints = 1.0;
        const pointsMatch =
            markdownText.match(/\*\*Points:\*\*\s*([\d.]+)/i) ||
            markdownText.match(/Points:\s*([\d.]+)/i) ||
            markdownText.match(/(?:\(|\[)\s*([\d.]+)\s*(?:pts?|points?)\s*(?:\)|\])/i);
        if (pointsMatch) {
            docPoints = parseFloat(pointsMatch[1]) || 1.0;
        }

        // Use assignment body (excluding the top title) as the prompt
        const promptLines = lines.filter((l) => !l.match(titleHeaderRegex));
        const promptText = promptLines.join('\n').trim();

        if (promptText) {
            questions.push({
                number: 1,
                title: quizTitle || fallbackTitle,
                points: docPoints,
                prompt: promptText
            });
        }
    }

    return {
        title: quizTitle || fallbackTitle,
        descriptionMarkdown: seenFirstQuestion ? introLines.join('\n').trim() : '',
        questions
    };
}

/**
 * Builds the IMS Manifest XML.
 */
function buildManifestXml(assessmentId, title, isoDate) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="manifest_${assessmentId}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <imsmd:lom>
      <imsmd:general>
        <imsmd:title>
          <imsmd:string>${escapeXml(title)}</imsmd:string>
        </imsmd:title>
      </imsmd:general>
      <imsmd:lifeCycle>
        <imsmd:contribute>
          <imsmd:date>
            <imsmd:dateTime>${isoDate}</imsmd:dateTime>
          </imsmd:date>
        </imsmd:contribute>
      </imsmd:lifeCycle>
      <imsmd:rights>
        <imsmd:copyrightAndOtherRestrictions>
          <imsmd:value>yes</imsmd:value>
        </imsmd:copyrightAndOtherRestrictions>
        <imsmd:description>
          <imsmd:string>Private (Copyrighted)</imsmd:string>
        </imsmd:description>
      </imsmd:rights>
    </imsmd:lom>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="assessment_${assessmentId}" type="imsqti_xmlv1p2">
      <file href="assessment_${assessmentId}/assessment_${assessmentId}.xml"/>
      <dependency identifierref="dependency_${assessmentId}"/>
    </resource>
    <resource identifier="dependency_${assessmentId}" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="assessment_${assessmentId}/assessment_meta.xml">
      <file href="assessment_${assessmentId}/assessment_meta.xml"/>
    </resource>
  </resources>
</manifest>
`;
}

/**
 * Builds the Canvas-specific assessment_meta.xml.
 */
function buildMetaXml(assessmentId, title, descriptionHtml, totalPoints) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="assessment_${assessmentId}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${escapeXml(title)}</title>
  <description>${escapeXml(descriptionHtml)}</description>
  <shuffle_answers>false</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <hide_results></hide_results>
  <quiz_type>assignment</quiz_type>
  <points_possible>${totalPoints.toFixed(1)}</points_possible>
  <require_lockdown_browser>false</require_lockdown_browser>
  <require_lockdown_browser_for_results>false</require_lockdown_browser_for_results>
  <require_lockdown_browser_monitor>false</require_lockdown_browser_monitor>
  <lockdown_browser_monitor_data/>
  <show_correct_answers>true</show_correct_answers>
  <anonymous_submissions>false</anonymous_submissions>
  <could_be_locked>false</could_be_locked>
  <allowed_attempts>1</allowed_attempts>
  <one_question_at_a_time>false</one_question_at_a_time>
  <cant_go_back>false</cant_go_back>
  <available>false</available>
  <one_time_results>false</one_time_results>
  <show_correct_answers_last_attempt>false</show_correct_answers_last_attempt>
  <only_visible_to_overrides>false</only_visible_to_overrides>
  <module_locked>false</module_locked>
  <assignment identifier="assignment_${assessmentId}">
    <title>${escapeXml(title)}</title>
    <due_at/>
    <lock_at/>
    <unlock_at/>
    <module_locked>false</module_locked>
    <workflow_state>unpublished</workflow_state>
    <assignment_overrides>
    </assignment_overrides>
    <quiz_identifierref>assessment_${assessmentId}</quiz_identifierref>
    <allowed_extensions></allowed_extensions>
    <has_group_category>false</has_group_category>
    <points_possible>${totalPoints.toFixed(1)}</points_possible>
    <grading_type>points</grading_type>
    <all_day>false</all_day>
    <submission_types>online_quiz</submission_types>
    <position>1</position>
    <turnitin_enabled>false</turnitin_enabled>
    <vericite_enabled>false</vericite_enabled>
    <peer_review_count>0</peer_review_count>
    <peer_reviews>false</peer_reviews>
    <automatic_peer_reviews>false</automatic_peer_reviews>
    <anonymous_grading>false</anonymous_grading>
    <graders_anonymous_to_graders>false</graders_anonymous_to_graders>
    <grader_names_visible_to_final_grader>true</grader_names_visible_to_final_grader>
    <anonymous_instructor_annotations>false</anonymous_instructor_annotations>
    <post_to_sis>false</post_to_sis>
    <moderated_grading>false</moderated_grading>
    <grader_count>0</grader_count>
    <grader_comments_visible_to_graders>true</grader_comments_visible_to_graders>
    <only_visible_to_overrides>false</only_visible_to_overrides>
    <omit_from_final_grade>false</omit_from_final_grade>
    <hide_in_gradebook>false</hide_in_gradebook>
  </assignment>
  <assignment_group_identifierref>group_${assessmentId}</assignment_group_identifierref>
  <assignment_overrides>
  </assignment_overrides>
</quiz>
`;
}

/**
 * Builds the QTI 1.2 XML file with all essay question items.
 */
function buildAssessmentXml(assessmentId, title, questions) {
    const itemsXml = questions
        .map((q, idx) => {
            const qId = `${assessmentId}_q${q.number || idx + 1}`;
            const refId = `ref_${qId}`;
            const pts = q.points.toFixed(1);
            const htmlPrompt = q.htmlPrompt || `<p>${escapeXml(q.prompt)}</p>`;

            return `      <item ident="${qId}" title="${escapeXml(q.title)}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>essay_question</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>${pts}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>original_answer_ids</fieldlabel>
              <fieldentry></fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>assessment_question_identifierref</fieldlabel>
              <fieldentry>${refId}</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">${escapeXml(htmlPrompt)}</mattext>
          </material>
          <response_str ident="response1" rcardinality="Single">
            <render_fib>
              <response_label ident="answer1" rshuffle="No"/>
            </render_fib>
          </response_str>
        </presentation>
        <resprocessing>
          <outcomes>
            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
          </outcomes>
          <respcondition continue="No">
            <conditionvar>
              <other/>
            </conditionvar>
          </respcondition>
        </resprocessing>
      </item>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <assessment ident="assessment_${assessmentId}" title="${escapeXml(title)}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>cc_maxattempts</fieldlabel>
        <fieldentry>1</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
${itemsXml}
    </section>
  </assessment>
</questestinterop>
`;
}

/**
 * Creates a Canvas QTI .zip file from parsed questions.
 */
function createQtiZip(options) {
    const { title, descriptionMarkdown = '', questions, outputPath, baseUrl = null, docRelDir = '' } = options;

    if (!questions || questions.length === 0) {
        return null;
    }

    const assessmentId = crypto.randomBytes(8).toString('hex');
    const isoDate = new Date().toISOString().split('T')[0];
    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1.0), 0);

    // Convert markdown descriptions and prompts to HTML
    const descriptionHtml = descriptionMarkdown ? markdownToHtml(descriptionMarkdown, { baseUrl, docRelDir }) : '';
    const questionsWithHtml = questions.map((q) => ({
        ...q,
        htmlPrompt: markdownToHtml(q.prompt, { baseUrl, docRelDir })
    }));

    const manifestXml = buildManifestXml(assessmentId, title, isoDate);
    const metaXml = buildMetaXml(assessmentId, title, descriptionHtml, totalPoints);
    const assessmentXml = buildAssessmentXml(assessmentId, title, questionsWithHtml);

    const zip = new AdmZip();
    zip.addFile('imsmanifest.xml', Buffer.from(manifestXml, 'utf8'));
    zip.addFile(`assessment_${assessmentId}/assessment_meta.xml`, Buffer.from(metaXml, 'utf8'));
    zip.addFile(`assessment_${assessmentId}/assessment_${assessmentId}.xml`, Buffer.from(assessmentXml, 'utf8'));

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    zip.writeZip(outputPath);

    return {
        outputPath,
        totalQuestions: questions.length,
        totalPoints,
        title
    };
}

/**
 * Checks if a file is a quiz file by name.
 * e.g., week1-quiz.md, quiz-1.md, reading_quiz.md, etc.
 */
function isQuizFile(filePath) {
    const baseName = path.basename(filePath).toLowerCase();
    return baseName.includes('-quiz') || baseName.includes('_quiz') || baseName.startsWith('quiz');
}

/**
 * Processes a quiz markdown file and produces a companion QTI .zip file if questions exist.
 */
function processQuizQti(inputFile, outputDir, options = {}) {
    if (!fs.existsSync(inputFile)) return null;

    const ext = path.extname(inputFile).toLowerCase();
    if (ext !== '.md' && ext !== '.markdown') {
        return null;
    }

    const content = fs.readFileSync(inputFile, 'utf8');
    const baseName = path.basename(inputFile, ext);
    const fallbackTitle = baseName
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    const parsed = parseAssignmentMarkdown(content, fallbackTitle);

    if (!parsed.questions || parsed.questions.length === 0) {
        return null;
    }

    const zipName = `${baseName}.qti.zip`;
    const outputPath = path.join(outputDir, zipName);

    const result = createQtiZip({
        title: parsed.title,
        descriptionMarkdown: parsed.descriptionMarkdown,
        questions: parsed.questions,
        outputPath,
        baseUrl: options.baseUrl || null,
        docRelDir: options.docRelDir || ''
    });

    return result;
}

module.exports = {
    isQuizFile,
    parseAssignmentMarkdown,
    createQtiZip,
    processQuizQti
};
