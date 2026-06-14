import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { sanitizeContentHtml, toDangerousHtml } = await import(
  "../src/lib/sanitize/html.ts"
);
const { aiPdfExtractionSchema } = await import(
  "../src/lib/ai-pdf-import/schema.ts"
);
const {
  createAIPdfChunkingSummary,
  ensureAIPdfChunkingSummary,
  mergeAIPdfImportChunkingSummary,
  normalizeAIPdfChunkingSummary,
  patchAIPdfChunkingSummary,
  planAIPdfPageChunks,
} = await import("../src/lib/ai-pdf-import/chunking.ts");
const {
  generateAIPdfQuestionCodeForImport,
  visibleQuestionNumberKey,
} = await import("../src/lib/ai-pdf-import/question-code.ts");
const {
  AI_PROVIDER_MODE_OPTIONS,
  aiPdfInputStrategyLabel,
  aiPdfInputStrategySummaryLabel,
  aiProviderModeSummaryLabel,
  describeAiPdfProviderInput,
  estimateAIPdfProviderCallCount,
  getAiProviderCapabilities,
  inferAiProviderMode,
  selectAiPdfInputStrategy,
  supportsAIPdfSequentialChunkExtraction,
} = await import("../src/lib/ai-providers/adapters.ts");
const { decryptSecret } = await import("../src/lib/ai-providers/encryption.ts");
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

assert.deepEqual(
  planAIPdfPageChunks({
    chunkSizePages: 3,
    overlapPages: 1,
    pageCount: 10,
  }).map((chunk) => [chunk.pageStart, chunk.pageEnd]),
  [
    [1, 3],
    [3, 5],
    [5, 7],
    [7, 9],
    [9, 10],
  ],
);
assert.deepEqual(
  planAIPdfPageChunks({
    chunkSizePages: 3,
    overlapPages: 1,
    pageCount: 2,
  }).map((chunk) => [chunk.pageStart, chunk.pageEnd]),
  [[1, 2]],
);
assert.throws(
  () =>
    planAIPdfPageChunks({
      chunkSizePages: 3,
      overlapPages: 3,
      pageCount: 10,
    }),
  /overlapPages must be smaller/,
);
const chunkingSummary = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 10,
});
assert.equal(chunkingSummary.totalChunks, 5);
assert.deepEqual(chunkingSummary.chunks[1].overlapPages, [3]);
assert.equal(chunkingSummary.chunks.every((chunk) => chunk.status === "planned"), true);
const normalizedChunking = normalizeAIPdfChunkingSummary({
  enabled: true,
  mode: "foundation",
  totalChunks: 2,
  chunks: [
    {
      chunk_index: 1,
      page_start: 3,
      page_end: 5,
      status: "failed",
      warnings: ["raw warning stays counted, not used for identity"],
    },
    {
      chunk_index: 0,
      page_start: 1,
      page_end: 3,
      status: "completed",
      question_count: 2,
    },
  ],
});
assert.equal(normalizedChunking?.chunks[0].chunkIndex, 0);
assert.equal(normalizedChunking?.chunks[1].warningCount, 1);
assert.equal(normalizedChunking?.failedChunks, 1);
const sourceUploadAiPdfImport = mergeAIPdfImportChunkingSummary(
  {},
  {
    chunking: createAIPdfChunkingSummary({ pageCount: 12 }),
    pageCount: 12,
    phase: "source_uploaded",
  },
);
const leasedAiPdfImport = mergeAIPdfImportChunkingSummary(
  sourceUploadAiPdfImport,
  {
    jobId: "lease-1",
    phase: "queued",
  },
);
const progressAiPdfImport = mergeAIPdfImportChunkingSummary(leasedAiPdfImport, {
  pageCount: 12,
  phase: "calling_provider",
});
const finalAiPdfImport = mergeAIPdfImportChunkingSummary(progressAiPdfImport, {
  createdQuestionCount: 2,
  pageCount: 12,
  phase: "completed",
});
assert.equal(finalAiPdfImport.pageCount, 12);
assert.equal(finalAiPdfImport.chunking?.totalChunks, 6);
assert.notEqual(finalAiPdfImport.chunking?.totalChunks, undefined);
assert.equal(finalAiPdfImport.chunking?.mode, "foundation");
assert.equal(
  finalAiPdfImport.chunking?.chunks.every((chunk) => chunk.status === "planned"),
  true,
);
assert.equal(
  ensureAIPdfChunkingSummary({ pageCount: 12 })?.totalChunks,
  6,
  "old AI PDF summaries with pageCount should backfill foundation chunking",
);
console.log("PASS AI PDF chunking summary survives source, lease, progress, and final summary updates");

let staleOverwriteChunking = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 7,
});
let staleAiPdfImport = { chunking: staleOverwriteChunking, pageCount: 7 };
for (const chunk of staleOverwriteChunking.chunks) {
  const nextChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 7,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds: [`question-${chunk.chunkIndex}`],
      questionCount: 1,
      status: "completed",
    },
    value: staleAiPdfImport.chunking,
  });
  staleAiPdfImport = mergeAIPdfImportChunkingSummary(staleAiPdfImport, {
    chunking: nextChunking,
    phase: `chunk_${chunk.chunkIndex}_completed`,
  });
}
assert.equal(staleAiPdfImport.chunking.completedChunks, 3);
assert.equal(staleAiPdfImport.chunking.failedChunks, 0);
assert.equal(staleAiPdfImport.chunking.mergeStatus, "ready");
assert.equal(
  staleAiPdfImport.chunking.chunks.every((chunk) => chunk.status === "completed"),
  true,
);

let sixChunkSuccess = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 13,
});
for (const chunk of sixChunkSuccess.chunks) {
  sixChunkSuccess = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 13,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds: [`question-${chunk.chunkIndex}`],
      questionCount: 5,
      status: "completed",
    },
    value: sixChunkSuccess,
  });
}
assert.equal(sixChunkSuccess.totalChunks, 6);
assert.equal(sixChunkSuccess.completedChunks, 6);
assert.equal(sixChunkSuccess.failedChunks, 0);
assert.equal(sixChunkSuccess.mergeStatus, "ready");
assert.equal(sixChunkSuccess.chunks.every((chunk) => chunk.status === "completed"), true);
assert.equal(
  normalizeAIPdfChunkingSummary({
    ...sixChunkSuccess,
    completedChunks: 1,
    mergeStatus: "waiting_for_chunks",
  })?.completedChunks,
  6,
);
assert.equal(
  normalizeAIPdfChunkingSummary({
    ...sixChunkSuccess,
    completedChunks: 1,
    mergeStatus: "waiting_for_chunks",
  })?.mergeStatus,
  "ready",
);
console.log("PASS AI PDF chunking updates preserve prior chunk states and recompute final readiness");

let sharedImportDbSummary = {
  aiPdfImport: {
    chunking: createAIPdfChunkingSummary({
      chunkSizePages: 3,
      overlapPages: 1,
      pageCount: 13,
    }),
    pageCount: 13,
    phase: "queued",
  },
  createdCount: 0,
};
for (const chunk of sharedImportDbSummary.aiPdfImport.chunking.chunks) {
  const runningChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 13,
    patch: {
      status: "running",
      startedAt: `start-${chunk.chunkIndex}`,
    },
    value: sharedImportDbSummary.aiPdfImport.chunking,
  });
  sharedImportDbSummary = {
    ...sharedImportDbSummary,
    aiPdfImport: mergeAIPdfImportChunkingSummary(sharedImportDbSummary.aiPdfImport, {
      chunking: runningChunking,
      phase: "importing_questions",
    }),
  };
  const sharedImportFinalSummaryPatch = {
    batchId: "shared-import-batch",
    createdCount: chunk.chunkIndex + 1,
    createdQuestions: [`question-${chunk.chunkIndex}`],
    errorCount: 0,
    skippedCount: 0,
  };
  sharedImportDbSummary = {
    ...sharedImportDbSummary,
    ...sharedImportFinalSummaryPatch,
  };
  const completedChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 13,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds: [`question-${chunk.chunkIndex}`],
      questionCount: 5,
      status: "completed",
    },
    value: sharedImportDbSummary.aiPdfImport.chunking,
  });
  sharedImportDbSummary = {
    ...sharedImportDbSummary,
    aiPdfImport: mergeAIPdfImportChunkingSummary(sharedImportDbSummary.aiPdfImport, {
      chunking: completedChunking,
      phase: "cropping_assets",
    }),
  };
}
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.totalChunks, 6);
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.completedChunks, 6);
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.failedChunks, 0);
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.mergeStatus, "ready");
assert.equal(
  sharedImportDbSummary.aiPdfImport.chunking.chunks.every(
    (chunk) =>
      chunk.status === "completed" &&
      chunk.createdQuestionIds?.length === 1 &&
      chunk.questionCount === 5,
  ),
  true,
);

const batchImportServiceSource = await readFile(
  new URL("../src/lib/batch-import/service.ts", import.meta.url),
  "utf8",
);
assert.match(batchImportServiceSource, /loadImportBatchSummary/);
assert.match(batchImportServiceSource, /\.\.\.existingSummaryBeforeFinal/);
console.log(
  "PASS AI PDF shared batch import summary updates preserve all sequential chunk states",
);

assert.equal(supportsAIPdfSequentialChunkExtraction("page_images"), true);
assert.equal(supportsAIPdfSequentialChunkExtraction("gemini_native_pdf"), false);
assert.equal(supportsAIPdfSequentialChunkExtraction("openai_file"), false);
assert.equal(estimateAIPdfProviderCallCount({
  strategy: "page_images",
  totalChunks: 6,
}), 6);
assert.equal(estimateAIPdfProviderCallCount({
  strategy: "gemini_native_pdf",
  totalChunks: 6,
}), 1);
assert.equal(estimateAIPdfProviderCallCount({
  strategy: "openai_file",
  totalChunks: 6,
}), 1);

console.log(
  "PASS AI PDF full-PDF strategies stay single-pass while page images use sequential chunks",
);

let sequentialChunking = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 7,
});
const processedOrder = [];

for (const chunk of sequentialChunking.chunks.sort(
  (left, right) => left.chunkIndex - right.chunkIndex,
)) {
  processedOrder.push(chunk.chunkIndex);
  sequentialChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 7,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds:
        chunk.chunkIndex === 1 ? [] : [`question-${chunk.chunkIndex}`],
      errorMessage: chunk.chunkIndex === 1 ? "Provider timeout" : undefined,
      inputStrategy: "gemini_native_pdf",
      model: "gemini-2.5-flash-lite",
      provider: "gemini_native",
      questionCount: chunk.chunkIndex === 1 ? 0 : 1,
      retryCount: chunk.chunkIndex === 1 ? 0 : undefined,
      sourcePages: chunk.sourcePages,
      startedAt: `start-${chunk.chunkIndex}`,
      status: chunk.chunkIndex === 1 ? "failed" : "completed",
      warningCount: chunk.chunkIndex === 1 ? 1 : 0,
      warnings: chunk.chunkIndex === 1 ? ["Provider timeout"] : [],
    },
    value: sequentialChunking,
  });
}

assert.deepEqual(processedOrder, [0, 1, 2]);
assert.equal(sequentialChunking.completedChunks, 2);
assert.equal(sequentialChunking.failedChunks, 1);
assert.deepEqual(sequentialChunking.chunks[0].createdQuestionIds, ["question-0"]);
assert.deepEqual(sequentialChunking.chunks[2].createdQuestionIds, ["question-2"]);

const retriedChunking = patchAIPdfChunkingSummary({
  chunkIndex: 1,
  pageCount: 7,
  patch: {
    completedAt: "retry-done-1",
    createdQuestionIds: ["question-1-retry"],
    errorMessage: undefined,
    questionCount: 1,
    retryCount: 1,
    status: "completed",
    warningCount: 0,
    warnings: [],
  },
  value: sequentialChunking,
});

assert.equal(retriedChunking.completedChunks, 3);
assert.equal(retriedChunking.failedChunks, 0);
assert.equal(retriedChunking.chunks[1].retryCount, 1);
assert.deepEqual(retriedChunking.chunks[1].createdQuestionIds, [
  "question-1-retry",
]);

console.log(
  "PASS AI PDF sequential chunks preserve ordered status updates and failed chunk retry metadata",
);

const generatedQuestionCodes = new Set();
const generatedQuestionCode = generateAIPdfQuestionCodeForImport({
  batchId: "abc12345-0000-0000-0000-000000000000",
  existingQuestionCodes: new Set(["ai-abc12345-001"]),
  index: 0,
  usedQuestionCodes: generatedQuestionCodes,
});
assert.equal(generatedQuestionCode, "AI-ABC12345-001-2");
assert.equal(generatedQuestionCodes.has("ai-abc12345-001-2"), true);
assert.notEqual(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("3.1"));
assert.notEqual(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("3(a)"));
assert.notEqual(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("FRQ 2"));
assert.equal(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("3"));

console.log(
  "PASS AI PDF chunk planner and visible question numbering policy are deterministic, non-aggressive, and do not blind-concat duplicate visible numbers",
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

const invalidAssetPlaceholderExtraction = aiPdfExtractionSchema.parse({
  questions: [
    {
      asset_placeholders: [
        {
          alt: "usable fallback placeholder",
          bbox: { height: 0.2, width: 0.3, x: 0.1, y: 0.1 },
          page: 1,
        },
        {
          alt: "bad placeholder string",
          bbox: { height: 0.2, width: 0.3, x: 0.2, y: 0.2 },
          page: 1,
          placeholder: "not a valid placeholder!",
        },
        {
          alt: "missing bbox should not block the question",
          page: 1,
          placeholder: "{{asset:figure_4}}",
        },
      ],
      content_html: "<p>Question with {{asset:figure_3}}.</p>",
      content_source: "Question with {{asset:figure_3}}.",
      difficulty_rating: 500,
      new_tag_names: [],
      page_refs: [1],
      question_code: "AI_INVALID_ASSET_PLACEHOLDER_001",
      question_type: "frq",
      solution_html: "<p>Solution.</p>",
      solution_source: "Solution.",
      tag_names: [],
      tag_slugs: [],
      title: "Invalid asset placeholder should not fail import",
    },
    {
      asset_placeholders: "not an array",
      content_html: "<p>Text-only question should still import.</p>",
      difficulty_rating: 400,
      new_tag_names: [],
      page_refs: [2],
      question_code: "AI_INVALID_ASSET_PLACEHOLDER_002",
      question_type: "frq",
      solution_html: "<p>Solution.</p>",
      tag_names: [],
      tag_slugs: [],
      title: "Non-array asset placeholders should warn only",
    },
  ],
  warnings: [],
});

assert.equal(invalidAssetPlaceholderExtraction.questions.length, 2);
assert.equal(
  invalidAssetPlaceholderExtraction.questions[0].asset_placeholders.length,
  1,
);
assert.equal(
  invalidAssetPlaceholderExtraction.questions[0].asset_placeholders[0]
    .placeholder,
  "{{asset:figure_3}}",
);
assert.equal(
  invalidAssetPlaceholderExtraction.questions[1].asset_placeholders.length,
  0,
);
assert.equal(
  invalidAssetPlaceholderExtraction.warnings.includes(
    "Some image placeholders were ignored because they were invalid.",
  ),
  true,
);

console.log(
  "PASS AI PDF invalid asset_placeholders warn and do not block draft question parsing",
);

const aiPdfServiceSource = await readFile(
  new URL("../src/lib/ai-pdf-import/service.ts", import.meta.url),
  "utf8",
);
assert.match(aiPdfServiceSource, /if \(solutionHtml\.trim\(\)\) \{/);
assert.match(aiPdfServiceSource, /questionPayload\.solution_html = solutionHtml/);
assert.doesNotMatch(
  aiPdfServiceSource,
  /solution_html:\s*solutionFields\.html \|\| question\.solution_html/,
);
console.log("PASS AI PDF import payload omits null solution fields before batch import");

assert.match(
  aiPdfServiceSource,
  /loadSafeAIProviderProfileForUse[\s\S]*sourceInput: providerInput\.strategy[\s\S]*loadAIProviderProfileForUse/,
);
assert.equal(
  aiPdfInputStrategySummaryLabel("page_images", "gemini_openai"),
  "Rendered page images",
);
console.log(
  "PASS AI PDF provider metadata remains visible when saved key decrypt fails",
);

const previousEncryptionKey = process.env.AI_PROVIDER_ENCRYPTION_KEY;
process.env.AI_PROVIDER_ENCRYPTION_KEY =
  "security-smoke-test-encryption-key-for-friendly-decrypt-errors";
let decryptErrorMessage = "";
try {
  decryptSecret({
    ciphertext: Buffer.from("not the saved api key").toString("base64"),
    iv: Buffer.alloc(12).toString("base64"),
    tag: Buffer.alloc(16).toString("base64"),
  });
} catch (error) {
  decryptErrorMessage = error instanceof Error ? error.message : String(error);
} finally {
  if (previousEncryptionKey === undefined) {
    delete process.env.AI_PROVIDER_ENCRYPTION_KEY;
  } else {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = previousEncryptionKey;
  }
}
assert.equal(
  decryptErrorMessage,
  "Saved API key cannot be decrypted. Re-enter and save the API key for this provider.",
);
assert.equal(/Unsupported state|authenticate data/i.test(decryptErrorMessage), false);
assert.equal(/sk-|AIza|eyJ/i.test(decryptErrorMessage), false);
console.log("PASS saved AI provider decrypt failure shows friendly safe error");

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
