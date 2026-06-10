import assert from "node:assert/strict";

const { sanitizeContentHtml, toDangerousHtml } = await import(
  "../src/lib/sanitize/html.ts"
);
const { aiPdfExtractionSchema } = await import(
  "../src/lib/ai-pdf-import/schema.ts"
);
const { parsePossiblyMalformedJson } = await import(
  "../src/lib/ai-providers/json-repair.ts"
);

const scriptInput = '<p>Safe</p><script>alert("x")</script>';
assert.equal(sanitizeContentHtml(scriptInput), "<p>Safe</p>");

const eventInput = '<p onclick="alert(1)">Click</p><img src=x onerror=alert(1)>';
assert.equal(sanitizeContentHtml(eventInput), "<p>Click</p>");

const javascriptUrlInput = '<a href="javascript:alert(1)">bad</a><p>ok</p>';
assert.equal(sanitizeContentHtml(javascriptUrlInput), "bad<p>ok</p>");

const storageImageInput =
  '<img src="https://example.supabase.co/storage/v1/object/public/question-assets/questions/question-id/asset-id.png" alt="diagram">';
assert.equal(
  sanitizeContentHtml(storageImageInput),
  '<img src="https://example.supabase.co/storage/v1/object/public/question-assets/questions/question-id/asset-id.png" alt="diagram" />',
);

const dangerousHtml = toDangerousHtml(scriptInput);
assert.deepEqual(dangerousHtml, { __html: "<p>Safe</p>" });

console.log(
  "PASS sanitizer removes unsafe HTML and preserves Supabase Storage image URLs",
);

const validEscapesPayload = parsePossiblyMalformedJson(
  '{"value":"Line one\\nLine two with \\"quote\\", \\\\slash, and \\u03A9."}',
);
assert.equal(
  validEscapesPayload.value,
  'Line one\nLine two with "quote", \\slash, and \u03A9.',
);

const latexCommandPayload = parsePossiblyMalformedJson(
  String.raw`{"value":"\text{meters} and \theta"}`,
);
assert.equal(latexCommandPayload.value, String.raw`\text{meters} and \theta`);

const malformedAiProviderResponse = [
  "Here is the extracted JSON:",
  "",
  "```json",
  "{",
  '  "questions": [',
  "    {",
  '      "title": "Malformed LaTeX escape test",',
  '      "question_code": "AI_JSON_REPAIR_001",',
  '      "question_type": "frq",',
  '      "difficulty_rating": 500,',
  '      "status": "published",',
  String.raw`      "content_source": "Solve \$x = 2\$ and compare with $x = 2$. 293\% of $x$. A resistor is $4\,\Omega$ on a $12\,\mathrm{V}$ battery. Use \frac{1}{2}, \sqrt{x}, \left(x+1\right), \text{meters}, \le, and \ge.",`,
  String.raw`      "content_html": "<p>Solve \$x = 2\$ and use f(x) = x^2 - 5x + 6. 293\% of $x$.</p>",`,
  String.raw`      "solution_source": "Use \(x - 2\), \[x = 2\], \frac{1}{2}, \sqrt{x}, \left(x+1\right), \text{meters}, a \le b, and c \ge d.",`,
  String.raw`      "solution_html": "<p>The answer is $x = 2$ and \frac{1}{2}.</p>",`,
  '      "tag_names": [],',
  '      "tag_slugs": [],',
  '      "new_tag_names": [],',
  '      "page_refs": [1],',
  '      "asset_placeholders": []',
  "    }",
  "  ],",
  '  "warnings": ["provider wrapped JSON in prose"]',
  "}",
  "```",
  "",
  "Trailing prose from the model.",
].join("\n");

const repairedAiPayload = parsePossiblyMalformedJson(malformedAiProviderResponse);
const extraction = aiPdfExtractionSchema.parse(repairedAiPayload);
const repairedQuestion = extraction.questions[0];

assert.equal(repairedQuestion.question_code, "AI_JSON_REPAIR_001");
assert.match(repairedQuestion.content_source ?? "", /\$x = 2\$/);
assert.match(repairedQuestion.content_source ?? "", /\\\$x = 2\\\$/);
assert.match(repairedQuestion.content_source ?? "", /293\\% of \$x\$/);
assert.match(repairedQuestion.content_source ?? "", /\$4\\,\\Omega\$/);
assert.match(repairedQuestion.content_source ?? "", /\$12\\,\\mathrm\{V\}\$/);
assert.match(repairedQuestion.content_source ?? "", /\\frac\{1\}\{2\}/);
assert.match(repairedQuestion.content_source ?? "", /\\sqrt\{x\}/);
assert.match(repairedQuestion.content_source ?? "", /\\left\(x\+1\\right\)/);
assert.match(repairedQuestion.content_source ?? "", /\\text\{meters\}/);
assert.match(repairedQuestion.content_source ?? "", /\\le/);
assert.match(repairedQuestion.content_source ?? "", /\\ge/);
assert.match(repairedQuestion.solution_source ?? "", /\\\(x - 2\\\)/);
assert.match(repairedQuestion.solution_source ?? "", /\\\[x = 2\\\]/);
assert.match(repairedQuestion.content_html, /f\(x\) = x\^2 - 5x \+ 6/);
assert.equal("status" in repairedQuestion, false);

console.log(
  "PASS AI PDF provider JSON repair handles fenced prose, generalized LaTeX escapes, and strips publish status",
);
