import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { sanitizeContentHtml, toDangerousHtml } = await import(
  "../src/lib/sanitize/html.ts"
);
const { aiPdfExtractionSchema } = await import(
  "../src/lib/ai-pdf-import/schema.ts"
);
const {
  AI_PROVIDER_MODE_OPTIONS,
  aiPdfInputStrategyLabel,
  aiProviderModeSummaryLabel,
  describeAiPdfProviderInput,
  getAiProviderCapabilities,
  inferAiProviderMode,
  selectAiPdfInputStrategy,
} = await import("../src/lib/ai-providers/adapters.ts");
const {
  generateWithGeminiNativePdf,
  testGeminiNativeTextConnection,
} = await import(
  "../src/lib/ai-providers/gemini-native.ts"
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

const deepSeekTextOnly = {
  base_url: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  provider: "deepseek_openai",
  supports_pdf_input: false,
  supports_vision_images: false,
};
assert.equal(inferAiProviderMode(deepSeekTextOnly), "deepseek_openai");
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsText, true);
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsJsonMode, true);
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsPageImages, false);
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsNativePdf, false);
assert.equal(selectAiPdfInputStrategy(deepSeekTextOnly), "unsupported");

const deepSeekExplicitVision = {
  ...deepSeekTextOnly,
  supports_vision_images: true,
};
assert.equal(selectAiPdfInputStrategy(deepSeekExplicitVision), "page_images");

const geminiOpenAiFullPdfAndImages = {
  base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
  model: "gemini-2.5-flash",
  provider: "gemini_openai",
  supports_pdf_input: true,
  supports_vision_images: true,
};
assert.equal(inferAiProviderMode(geminiOpenAiFullPdfAndImages), "gemini_openai");
assert.equal(selectAiPdfInputStrategy(geminiOpenAiFullPdfAndImages), "page_images");

const geminiOpenAiFullPdfOnly = {
  ...geminiOpenAiFullPdfAndImages,
  supports_vision_images: false,
};
assert.equal(selectAiPdfInputStrategy(geminiOpenAiFullPdfOnly), "unsupported");

const geminiNativePdf = {
  base_url: "https://generativelanguage.googleapis.com",
  model: "gemini-2.5-pro",
  provider: "gemini_native",
  supports_pdf_input: true,
  supports_vision_images: false,
};
const geminiNativeSupport = describeAiPdfProviderInput(geminiNativePdf);
assert.equal(geminiNativeSupport.mode, "gemini_native");
assert.equal(geminiNativeSupport.strategy, "gemini_native_pdf");
assert.equal(geminiNativeSupport.supported, true);
assert.equal(geminiNativeSupport.implemented, true);
assert.equal(aiProviderModeSummaryLabel("deepseek_openai"), "DeepSeek text/json");
assert.equal(
  aiProviderModeSummaryLabel("gemini_native"),
  "Gemini Native full PDF",
);
assert.equal(aiPdfInputStrategyLabel(geminiNativeSupport.strategy), "supported");
assert.equal(
  AI_PROVIDER_MODE_OPTIONS.some((option) => option.label === "deepseek_openai"),
  false,
);
assert.equal(
  AI_PROVIDER_MODE_OPTIONS.find((option) => option.mode === "gemini_openai")
    ?.supportsVisionImages,
  true,
);
assert.equal(
  AI_PROVIDER_MODE_OPTIONS.find((option) => option.mode === "gemini_openai")
    ?.supportsPdfInput,
  false,
);

function makeGeminiNativeFetchRecorder({
  generateText = JSON.stringify({
    questions: [
      {
        asset_placeholders: [],
        content_html: "<p>Gemini native PDF test.</p>",
        content_source: "Gemini native PDF test.",
        difficulty_rating: 500,
        new_tag_names: [],
        page_refs: [1],
        question_code: "GEMINI_NATIVE_001",
        question_type: "frq",
        solution_html: "<p>Solution.</p>",
        solution_source: "Solution.",
        status: "published",
        tag_names: [],
        tag_slugs: [],
        title: "Gemini Native PDF Test",
      },
    ],
    warnings: [],
  }),
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const bodyText =
      typeof init.body === "string" ? init.body : init.body ? "[binary]" : "";
    calls.push({
      bodyText,
      headers: init.headers ?? {},
      method: init.method ?? "GET",
      url: String(url),
    });

    if (String(url).includes("/upload/v1beta/files")) {
      return new Response("{}", {
        headers: {
          "x-goog-upload-url": "https://upload.example.test/session",
        },
        status: 200,
      });
    }

    if (String(url) === "https://upload.example.test/session") {
      return Response.json({
        file: {
          mimeType: "application/pdf",
          name: "files/security-smoke-pdf",
          state: "PROCESSING",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf",
        },
      });
    }

    if (
      String(url) ===
        "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf" &&
      init.method === "GET"
    ) {
      return Response.json({
        file: {
          mimeType: "application/pdf",
          name: "files/security-smoke-pdf",
          state: "ACTIVE",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf",
        },
      });
    }

    if (String(url).includes(":generateContent")) {
      return Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: generateText }],
            },
          },
        ],
      });
    }

    if (
      String(url) ===
        "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf" &&
      init.method === "DELETE"
    ) {
      return Response.json({});
    }

    throw new Error(`Unexpected Gemini fake fetch call: ${url}`);
  };

  return { calls, fetchImpl };
}

const {
  calls: geminiNativeTextCalls,
  fetchImpl: geminiNativeTextFetch,
} = makeGeminiNativeFetchRecorder({ generateText: "ok" });
const textTestResult = await testGeminiNativeTextConnection({
  apiKey: "fake-gemini-native-key",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  fetchImpl: geminiNativeTextFetch,
  model: "gemini-2.5-flash-lite",
});
assert.equal(textTestResult.message, "Gemini Native connection test passed.");
const textTestGenerateCall = geminiNativeTextCalls.find((call) =>
  call.url.includes(":generateContent"),
);
assert.ok(textTestGenerateCall);
assert.match(
  textTestGenerateCall.url,
  /https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash-lite:generateContent/,
);
assert.equal(textTestGenerateCall.bodyText.includes("Return exactly: ok"), true);
assert.equal(textTestGenerateCall.bodyText.includes("file_data"), false);
assert.equal(textTestGenerateCall.bodyText.includes("inline_data"), false);
assert.equal(
  geminiNativeTextCalls.some((call) => call.url.includes("/chat/completions")),
  false,
);

const { calls: geminiNativeCalls, fetchImpl: geminiNativeFetch } =
  makeGeminiNativeFetchRecorder();
const geminiNativeResult = await generateWithGeminiNativePdf({
  apiKey: "fake-gemini-native-key",
  fetchImpl: geminiNativeFetch,
  fileName: "security-smoke.pdf",
  maxPollAttempts: 1,
  model: "gemini-2.5-pro",
  pdfBytes: Buffer.from("%PDF-1.4 fake"),
  pollDelayMs: 0,
  prompt: "Extract JSON.",
});
assert.match(geminiNativeResult.text, /GEMINI_NATIVE_001/);
assert.equal(
  geminiNativeCalls.some((call) => call.url.includes("/chat/completions")),
  false,
);
assert.equal(
  geminiNativeCalls.some((call) => call.bodyText.includes('"type":"file"')),
  false,
);
assert.equal(
  geminiNativeCalls.some((call) => call.bodyText.includes('"file_data"')),
  true,
);
assert.equal(
  geminiNativeCalls.some((call) => call.url.includes("fake-gemini-native-key")),
  false,
);
assert.equal(
  geminiNativeCalls.some((call) =>
    JSON.stringify(call.headers).includes("fake-gemini-native-key"),
  ),
  true,
);

const geminiNativeExtraction = aiPdfExtractionSchema.parse(
  parsePossiblyMalformedJson(geminiNativeResult.text),
);
assert.equal(geminiNativeExtraction.questions[0].question_code, "GEMINI_NATIVE_001");
assert.equal("status" in geminiNativeExtraction.questions[0], false);

const chatSource = await readFile(
  new URL("../src/lib/ai-providers/chat.ts", import.meta.url),
  "utf8",
);
assert.match(chatSource, /inputStrategy === "gemini_native_pdf"/);
assert.match(chatSource, /generateWithGeminiNativePdf/);

await assert.rejects(
  generateWithGeminiNativePdf({
    apiKey: "",
    fetchImpl: async () => Response.json({}),
    fileName: "security-smoke.pdf",
    model: "gemini-2.5-pro",
    pdfBytes: Buffer.from("%PDF-1.4 fake"),
    prompt: "Extract JSON.",
  }),
  /Gemini Native provider API key is missing/,
);

await assert.rejects(
  testGeminiNativeTextConnection({
    apiKey: "fake-gemini-native-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: "bad model" } }), {
        status: 404,
      }),
    model: "gemini-unknown",
  }),
  (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Gemini Native generateContent failed \(404\)/);
    assert.equal(error.message.includes("fake-gemini-native-key"), false);
    return true;
  },
);

console.log(
  "PASS AI provider adapter routes DeepSeek, Gemini OpenAI, and Gemini Native full PDF safely",
);
