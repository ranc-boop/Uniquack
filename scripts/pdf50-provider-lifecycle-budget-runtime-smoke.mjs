import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import {
  classifyPDF50ProviderCounterContract,
  formatPDF50ProviderCounters,
} from "./lib/pdf50-provider-counter-contract.mjs";
import {
  estimatePDF50ProviderProofCostMicros,
  loadPDF50ProviderProofControl,
  pdf50ProviderProofEnvironment,
} from "./lib/pdf50-provider-proof-control.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadTypeScriptModule(relativePath, mocks = {}) {
  const filePath = resolve(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const requireMock = (specifier) => {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    throw new Error(`Unexpected test dependency: ${specifier}`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    requireMock,
    loadedModule,
    filePath,
    dirname(filePath),
  );
  return loadedModule.exports;
}

const errors = await loadTypeScriptModule("src/lib/ai-providers/errors.ts");
const responseLimits = await loadTypeScriptModule(
  "src/lib/ai-providers/response-limits.ts",
);
const budgetModule = await loadTypeScriptModule(
  "src/lib/ai-providers/execution-budget.ts",
  { "@/lib/ai-providers/errors": errors },
);

const extractionSchema = JSON.parse(
  await readFile(
    resolve(root, "src/lib/ai-providers/gemini-ai-pdf-extraction.schema.json"),
    "utf8",
  ),
);
const proofControlSource = JSON.parse(
  await readFile(
    resolve(root, "src/lib/ai-jobs/pdf50-provider-proof-control.json"),
    "utf8",
  ),
);
const scaleProofControlSource = JSON.parse(
  await readFile(
    resolve(
      root,
      "src/lib/ai-jobs/pdf50-scale-provider-proof-control.json",
    ),
    "utf8",
  ),
);
const proofControl = await loadPDF50ProviderProofControl();
const proofEnvironment = pdf50ProviderProofEnvironment(proofControl);
const structuredOutput = await loadTypeScriptModule(
  "src/lib/ai-providers/gemini-structured-output.ts",
  {
    "./gemini-ai-pdf-extraction.schema.json": extractionSchema,
  },
);

assert.deepEqual(structuredOutput.buildGeminiGenerationConfig({
  outputContract: { mode: "text" },
}), { temperature: 0.1 });
assert.deepEqual(structuredOutput.buildGeminiGenerationConfig({
  outputContract: { mode: "json" },
}), { responseMimeType: "application/json", temperature: 0.1 });
assert.deepEqual(structuredOutput.buildGeminiGenerationConfig({
  outputContract: {
    mode: "json_schema",
    schema: { type: "object" },
    transport: "response_json_schema",
  },
}), {
  responseJsonSchema: { type: "object" },
  responseMimeType: "application/json",
  temperature: 0.1,
});
assert.deepEqual(structuredOutput.buildGeminiGenerationConfig({
  maxOutputTokens: 64,
  outputContract: {
    mode: "json_schema",
    schema: { type: "array", items: { type: "string" } },
    transport: "response_format",
  },
}), {
  maxOutputTokens: 64,
  responseFormat: {
    text: {
      mimeType: "application/json",
      schema: { type: "array", items: { type: "string" } },
    },
  },
  temperature: 0.1,
});
assert.equal(
  structuredOutput.GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT.transport,
  "response_json_schema",
);

const providerTestControl = await loadTypeScriptModule(
  "src/lib/ai-jobs/provider-test-control.ts",
  {
    "./pdf50-provider-proof-control.json": proofControlSource,
    "./pdf50-scale-provider-proof-control.json": scaleProofControlSource,
  },
);
const proofEnvironmentNames = [
  "AI_JOBS_LOCAL_MAX_INVOCATIONS",
  "PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS",
  "PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS",
  "PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS",
  "PDF50_PROVIDER_TEST_MODE",
  "PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD",
];
const previousProofEnvironment = Object.fromEntries(
  proofEnvironmentNames.map((name) => [name, process.env[name]]),
);
try {
  for (const name of proofEnvironmentNames) delete process.env[name];
  assert.equal(providerTestControl.readTrustedAIProviderTestLimits(), null);
  process.env.PDF50_PROVIDER_TEST_MODE = "UNTRUSTED";
  assert.throws(
    () => providerTestControl.readTrustedAIProviderTestLimits(),
    /trusted_provider_test_mode_rejected/,
  );
  Object.assign(process.env, proofEnvironment);
  assert.deepEqual(providerTestControl.readTrustedAIProviderTestLimits(), {
    maxClaimedJobs: proofControl.claimedJobs,
    maxInferenceAttempts: proofControl.providerInferenceAttempts,
    maxEstimatedCostMicros: estimatePDF50ProviderProofCostMicros(proofControl),
    maxNetworkRequests: proofControl.providerMaxNetworkRequests,
    maxOutputTokens: proofControl.providerMaxOutputTokens,
    providerBudgetMicros: proofControl.approvedBudgetUsd * 1_000_000,
  });
  assert(
    providerTestControl.PDF50_PROVIDER_TEST_MAX_COST_MICROS <
      proofControl.approvedBudgetUsd * 1_000_000,
    "trusted proof worst-case token envelope must remain below its canonical budget",
  );
  Object.assign(process.env, {
    AI_JOBS_LOCAL_MAX_INVOCATIONS: String(
      scaleProofControlSource.workerRouteInvocations,
    ),
    PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS: String(
      scaleProofControlSource.providerInferenceAttempts,
    ),
    PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS: String(
      scaleProofControlSource.providerMaxNetworkRequests,
    ),
    PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS: String(
      scaleProofControlSource.providerMaxOutputTokens,
    ),
    PDF50_PROVIDER_TEST_MODE: scaleProofControlSource.mode,
    PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD: String(
      scaleProofControlSource.approvedBudgetUsd,
    ),
  });
  assert.deepEqual(providerTestControl.readTrustedAIProviderTestLimits(), {
    maxClaimedJobs: 1,
    maxInferenceAttempts: 2,
    maxEstimatedCostMicros: 23_278,
    maxNetworkRequests: 68,
    maxOutputTokens: 4_096,
    providerBudgetMicros: 2_000_000,
  });
  process.env.PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS = "1";
  assert.throws(
    () => providerTestControl.readTrustedAIProviderTestLimits(),
    /trusted_provider_test_control_rejected/,
  );
} finally {
  for (const name of proofEnvironmentNames) {
    const previous = previousProofEnvironment[name];
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

const budget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 4,
});
for (let attempt = 0; attempt < 4; attempt += 1) {
  budget.beforeInference("ai_pdf_extraction");
  budget.recordNetworkRequest("inference");
}
assert.throws(
  () => budget.beforeInference("ai_pdf_extraction"),
  (error) => {
    assert(error instanceof errors.AIProviderError);
    assert.equal(error.code, "provider_execution_budget_exhausted");
    assert.equal(error.attemptCount, 4);
    return true;
  },
);
budget.recordNetworkRequest("file_cleanup");
assert.deepEqual(budget.snapshot(), {
  maxInferenceAttempts: 4,
  maxNetworkRequests: 512,
  maxOutputTokens: null,
  providerCleanupFailures: 0,
  providerCleanupRequests: 1,
  providerInferenceAttempts: 4,
  providerInferenceRequests: 4,
  providerNetworkRequests: 5,
  providerPollRequests: 0,
  providerUploadRequests: 0,
});

const networkBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 4,
  maxNetworkRequests: 5,
});
for (let request = 0; request < 5; request += 1) {
  networkBudget.recordNetworkRequest("file_status_poll");
}
assert.throws(
  () => networkBudget.recordNetworkRequest("inference"),
  (error) => {
    assert(error instanceof errors.AIProviderError);
    assert.equal(error.code, "provider_execution_budget_exhausted");
    assert.equal(error.attemptCount, 5);
    return true;
  },
);

const gemini = await loadTypeScriptModule("src/lib/ai-providers/gemini-native.ts", {
  "@/lib/ai-providers/gemini-structured-output": structuredOutput,
  "@/lib/ai-providers/llm-debug-logs": {
    writeAIImportLLMDebugLog: async () => undefined,
  },
  "@/lib/ai-providers/network-safety": {
    assertSafeAIProviderBaseUrl: async () => {
      throw new Error("Network safety should not run for an injected fake transport.");
    },
  },
  "@/lib/ai-providers/response-limits": {
    readResponseTextWithLimit: async (response, maximumBytes) => {
      const text = await response.text();
      assert(Buffer.byteLength(text, "utf8") <= maximumBytes);
      return text;
    },
  },
});

const safeProviderError = gemini.parseGeminiNativeSafeErrorDetails({
  responseText: JSON.stringify({
    error: {
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.BadRequest",
          fieldViolations: [
            {
              description: "secret-bearing raw Provider detail",
              field: "generationConfig.responseFormat.text.schema",
            },
            { field: "unsafe field path with spaces" },
          ],
        },
      ],
      message: "secret-bearing raw Provider message",
      status: "INVALID_ARGUMENT",
    },
  }),
  statusCode: 400,
});
assert.deepEqual(safeProviderError, {
  detailTypes: ["BadRequest"],
  fieldViolationPaths: ["generationConfig.responseFormat.text.schema"],
  providerStatus: "INVALID_ARGUMENT",
  statusCode: 400,
});
assert(!JSON.stringify(safeProviderError).includes("secret-bearing"));

const providerRejectionBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
  maxNetworkRequests: 1,
});
await assert.rejects(
  gemini.generateWithGeminiNativeText({
    apiKey: "synthetic-test-key",
    baseUrl: "https://provider.invalid",
    executionObserver: providerRejectionBudget,
    fetchImpl: async () =>
      Response.json(
        {
          error: {
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.BadRequest",
                fieldViolations: [
                  {
                    description: "PRIVATE_PROVIDER_DETAIL_MUST_NOT_ESCAPE",
                    field: "generationConfig.responseFormat.text.schema",
                  },
                ],
              },
            ],
            message: "PRIVATE_PROVIDER_MESSAGE_MUST_NOT_ESCAPE",
            status: "INVALID_ARGUMENT",
          },
        },
        { status: 400 },
      ),
    model: "synthetic-model",
    outputContract: {
      mode: "json_schema",
      schema: { type: "object" },
      transport: "response_format",
    },
    prompt: "Return one synthetic object.",
  }),
  (error) => {
    assert(error instanceof gemini.GeminiNativeRequestError);
    assert.equal(error.statusCode, 400);
    assert.deepEqual(error.detailTypes, ["BadRequest"]);
    assert.deepEqual(error.fieldViolationPaths, [
      "generationConfig.responseFormat.text.schema",
    ]);
    assert.equal(error.providerStatus, "INVALID_ARGUMENT");
    assert(!error.message.includes("PRIVATE_PROVIDER"));
    return true;
  },
);
assert.deepEqual(providerRejectionBudget.snapshot(), {
  maxInferenceAttempts: 1,
  maxNetworkRequests: 1,
  maxOutputTokens: null,
  providerCleanupFailures: 0,
  providerCleanupRequests: 0,
  providerInferenceAttempts: 1,
  providerInferenceRequests: 1,
  providerNetworkRequests: 1,
  providerPollRequests: 0,
  providerUploadRequests: 0,
});

const requests = [];
const fakeFetch = async (url, init = {}) => {
  const requestUrl = String(url);
  requests.push({ method: init.method, url: requestUrl });
  if (requestUrl.includes("/upload/v1beta/files")) {
    return new Response(null, {
      headers: { "x-goog-upload-url": "https://upload.invalid/session" },
      status: 200,
    });
  }
  if (requestUrl === "https://upload.invalid/session") {
    return Response.json({
      file: {
        mimeType: "application/pdf",
        name: "files/synthetic",
        state: "PROCESSING",
        uri: "files://synthetic",
      },
    });
  }
  if (init.method === "GET") {
    return Response.json({
      file: {
        mimeType: "application/pdf",
        name: "files/synthetic",
        state: "ACTIVE",
        uri: "files://synthetic",
      },
    });
  }
  if (requestUrl.includes(":generateContent")) {
    const body = JSON.parse(String(init.body));
    assert.equal(body.generationConfig.maxOutputTokens, 8192);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseJsonSchema, undefined);
    assert.equal(body.generationConfig.responseSchema, undefined);
    assert.equal(body.generationConfig.responseFormat, undefined);
    return Response.json({
      candidates: [{ content: { parts: [{ text: "{\"questions\":[]}" }] } }],
      usageMetadata: {
        candidatesTokenCount: 5,
        promptTokenCount: 11,
        thoughtsTokenCount: 3,
        totalTokenCount: 19,
      },
    });
  }
  if (init.method === "DELETE") return new Response(null, { status: 204 });
  throw new Error("Unexpected fake Provider request.");
};

const lifecycleBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
  maxNetworkRequests: 136,
  maxOutputTokens: 8192,
});
const generated = await gemini.generateWithGeminiNativePdf({
  apiKey: "synthetic-test-key",
  baseUrl: "https://provider.invalid",
  executionObserver: lifecycleBudget,
  fetchImpl: fakeFetch,
  fileName: "synthetic.pdf",
  maxPollAttempts: 1,
  model: "synthetic-model",
  pdfBytes: Buffer.from("synthetic-pdf"),
  pollDelayMs: 0,
  prompt: "Return an empty question array.",
});

assert.equal(generated.text, '{"questions":[]}');
assert.deepEqual(generated.usage, {
  cachedInputTokens: null,
  candidateOutputTokens: 5,
  inputTokens: 11,
  outputTokens: 8,
  thoughtTokens: 3,
  totalTokens: 19,
});
assert.deepEqual(
  requests.map((request) => request.method),
  ["POST", "POST", "GET", "POST", "DELETE"],
);
assert.deepEqual(lifecycleBudget.snapshot(), {
  maxInferenceAttempts: 1,
  maxNetworkRequests: 136,
  maxOutputTokens: 8192,
  providerCleanupFailures: 0,
  providerCleanupRequests: 1,
  providerInferenceAttempts: 1,
  providerInferenceRequests: 1,
  providerNetworkRequests: 5,
  providerPollRequests: 1,
  providerUploadRequests: 2,
});
assert.equal(
  classifyPDF50ProviderCounterContract(
    {
      cleanupFailures: 0,
      cleanup: 1,
      inference: 1,
      inferenceRequests: 1,
      network: 5,
      polls: 1,
      uploads: 2,
    },
    { completed: true },
  ),
  null,
);

const repairedResponseCounters = {
  cleanupFailures: 0,
  cleanup: 4,
  inference: 4,
  inferenceRequests: 4,
  network: 16,
  polls: 0,
  uploads: 8,
};
assert.equal(
  classifyPDF50ProviderCounterContract(repairedResponseCounters, {
    completed: true,
  }),
  null,
  "four bounded Gemini upload/inference/cleanup lifecycles must remain valid",
);
assert.equal(
  formatPDF50ProviderCounters(repairedResponseCounters),
  "cleanupFailures:0,cleanup:4,inference:4,inferenceRequests:4,network:16,polls:0,uploads:8",
);
assert.equal(
  classifyPDF50ProviderCounterContract(
    { ...repairedResponseCounters, cleanupFailures: 1 },
    { completed: false },
  ),
  "provider_cleanup_failed",
);
assert.equal(
  classifyPDF50ProviderCounterContract(
    { ...repairedResponseCounters, cleanup: 5, network: 17 },
    { completed: false },
  ),
  "worker_provider_counter_contract_failed",
);

const cleanupBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
  maxNetworkRequests: 3,
});
const cleanupRequests = [];
await gemini.generateWithGeminiNativePdf({
  apiKey: "synthetic-test-key",
  baseUrl: "https://provider.invalid",
  executionObserver: cleanupBudget,
  fetchImpl: async (url, init = {}) => {
    const requestUrl = String(url);
    cleanupRequests.push(init.method);
    if (requestUrl.includes("/upload/v1beta/files")) {
      return new Response(null, {
        headers: { "x-goog-upload-url": "https://upload.invalid/cleanup-budget" },
        status: 200,
      });
    }
    if (requestUrl === "https://upload.invalid/cleanup-budget") {
      return Response.json({
        file: {
          mimeType: "application/pdf",
          name: "files/cleanup-budget",
          state: "ACTIVE",
          uri: "files://cleanup-budget",
        },
      });
    }
    if (requestUrl.includes(":generateContent")) {
      return Response.json({
        candidates: [{ content: { parts: [{ text: "{\"questions\":[]}" }] } }],
      });
    }
    throw new Error("Cleanup must be denied before the fake transport.");
  },
  fileName: "synthetic.pdf",
  model: "synthetic-model",
  pdfBytes: Buffer.from("synthetic-pdf"),
  prompt: "Return JSON.",
});
assert.deepEqual(cleanupRequests, ["POST", "POST", "POST"]);
assert.deepEqual(cleanupBudget.snapshot(), {
  maxInferenceAttempts: 1,
  maxNetworkRequests: 3,
  maxOutputTokens: null,
  providerCleanupFailures: 1,
  providerCleanupRequests: 0,
  providerInferenceAttempts: 1,
  providerInferenceRequests: 1,
  providerNetworkRequests: 3,
  providerPollRequests: 0,
  providerUploadRequests: 2,
});

const concurrentBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
  maxNetworkRequests: 1,
});
const concurrentResults = await Promise.allSettled([
  Promise.resolve().then(() => concurrentBudget.recordNetworkRequest("inference")),
  Promise.resolve().then(() => concurrentBudget.recordNetworkRequest("inference")),
]);
assert.equal(
  concurrentResults.filter((result) => result.status === "fulfilled").length,
  1,
);
assert.equal(concurrentBudget.snapshot().providerNetworkRequests, 1);

const malformedRequests = [];
const malformedBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
});
await assert.rejects(
  gemini.generateWithGeminiNativePdf({
    apiKey: "synthetic-test-key",
    baseUrl: "https://provider.invalid",
    executionObserver: malformedBudget,
    fetchImpl: async (url, init = {}) => {
      const requestUrl = String(url);
      malformedRequests.push(init.method);
      if (requestUrl.includes("/upload/v1beta/files")) {
        return new Response(null, {
          headers: { "x-goog-upload-url": "https://upload.invalid/malformed" },
          status: 200,
        });
      }
      if (requestUrl === "https://upload.invalid/malformed") {
        return Response.json({
          file: {
            name: "files/malformed",
            state: "ACTIVE",
            uri: "files://malformed",
          },
        });
      }
      if (requestUrl.includes(":generateContent")) {
        return new Response("not-json", { status: 200 });
      }
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      throw new Error("Unexpected malformed-response request.");
    },
    fileName: "synthetic.pdf",
    model: "synthetic-model",
    pdfBytes: Buffer.from("synthetic-pdf"),
    prompt: "Return JSON.",
  }),
  /returned invalid JSON/,
);
assert.deepEqual(malformedRequests, ["POST", "POST", "POST", "DELETE"]);
assert.deepEqual(malformedBudget.snapshot(), {
  maxInferenceAttempts: 1,
  maxNetworkRequests: 512,
  maxOutputTokens: null,
  providerCleanupFailures: 0,
  providerCleanupRequests: 1,
  providerInferenceAttempts: 1,
  providerInferenceRequests: 1,
  providerNetworkRequests: 4,
  providerPollRequests: 0,
  providerUploadRequests: 2,
});

const uploadFailureBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
});
let uploadFailureFetchCount = 0;
await assert.rejects(
  gemini.generateWithGeminiNativePdf({
    apiKey: "synthetic-test-key",
    baseUrl: "https://provider.invalid",
    executionObserver: uploadFailureBudget,
    fetchImpl: async () => {
      uploadFailureFetchCount += 1;
      return new Response("temporarily unavailable", { status: 503 });
    },
    fileName: "synthetic.pdf",
    model: "synthetic-model",
    pdfBytes: Buffer.from("synthetic-pdf"),
    prompt: "No inference request should be sent.",
  }),
  /upload session failed/,
);
assert.equal(uploadFailureFetchCount, 1);
assert.deepEqual(uploadFailureBudget.snapshot(), {
  maxInferenceAttempts: 1,
  maxNetworkRequests: 512,
  maxOutputTokens: null,
  providerCleanupFailures: 0,
  providerCleanupRequests: 0,
  providerInferenceAttempts: 1,
  providerInferenceRequests: 0,
  providerNetworkRequests: 1,
  providerPollRequests: 0,
  providerUploadRequests: 1,
});

const exhaustedBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
});
exhaustedBudget.beforeInference("ai_pdf_extraction");
let exhaustedFetchCount = 0;
await assert.rejects(
  gemini.generateWithGeminiNativePdf({
    apiKey: "synthetic-test-key",
    baseUrl: "https://provider.invalid",
    executionObserver: exhaustedBudget,
    fetchImpl: async () => {
      exhaustedFetchCount += 1;
      throw new Error("The transport must not run after budget exhaustion.");
    },
    fileName: "synthetic.pdf",
    model: "synthetic-model",
    pdfBytes: Buffer.from("synthetic-pdf"),
    prompt: "No request should be sent.",
  }),
  (error) => {
    assert(error instanceof errors.AIProviderError);
    assert.equal(error.code, "provider_execution_budget_exhausted");
    return true;
  },
);
assert.equal(exhaustedFetchCount, 0);

let extractionResponses = [];
const extractionPrompts = [];
const extractionOutputContracts = [];
const chat = await loadTypeScriptModule("src/lib/ai-providers/chat.ts", {
  "@/lib/ai-pdf-import/schema": {
    normalizeAIPdfExtractionResponse(value) {
      if (!Array.isArray(value?.questions) || value.questions.length === 0) {
        throw new Error("questions: array must contain at least one item");
      }
      return value;
    },
  },
  "@/lib/ai-providers/adapters": {
    AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE: "unsupported",
    inferAiProviderMode: () => "gemini_native",
  },
  "@/lib/ai-providers/gemini-native": {
    async generateWithGeminiNativePdf({
      executionObserver,
      outputContract,
      prompt,
    }) {
      executionObserver?.beforeInference("ai_pdf_extraction");
      extractionPrompts.push(prompt);
      extractionOutputContracts.push(outputContract);
      const response = extractionResponses.shift();
      if (!response) throw new Error("Missing fake Provider response.");
      return { text: response, usage: null };
    },
    testGeminiNativeTextConnection: async () => ({ message: "ok", ok: true }),
  },
  "@/lib/ai-providers/errors": errors,
  "@/lib/ai-providers/gemini-structured-output": structuredOutput,
  "@/lib/ai-providers/json-repair": {
    parsePossiblyMalformedJson: (value) => JSON.parse(value),
  },
  "@/lib/ai-providers/llm-debug-logs": {
    writeAIImportLLMDebugLog: async () => undefined,
  },
  "@/lib/ai-providers/mock": {
    assertMockAIProviderAllowed: () => undefined,
    isMockAIProviderUrl: () => false,
  },
  "@/lib/ai-providers/network-safety": {
    assertSafeAIProviderBaseUrl: async () => undefined,
  },
  "@/lib/ai-providers/response-limits": responseLimits,
});

const originalExtractionPrompt = "ORIGINAL PDF EXTRACTION CONTRACT";
extractionResponses = [
  '{"questions":[],"warnings":[]}',
  '{"questions":[{"title":"Synthetic question","content_html":"<p>What is 2 + 3?</p>"}],"warnings":[]}',
];
const repairedExtraction = await chat.callAIPdfExtractionProvider({
  fileName: "synthetic.pdf",
  inputStrategy: "gemini_native_pdf",
  pageImageDataUrls: [],
  pdfBase64: "",
  pdfBytes: Buffer.from("synthetic-pdf"),
  profile: {
    apiKey: "synthetic-test-key",
    base_url: "https://provider.invalid",
    model: "synthetic-model",
    name: "Synthetic Provider",
    provider: "gemini_native",
    supports_pdf_input: true,
    supports_vision_images: false,
  },
  prompt: originalExtractionPrompt,
});
assert.equal(repairedExtraction.questions.length, 1);
assert.equal(extractionPrompts.length, 2);
assert.deepEqual(extractionOutputContracts, [
  structuredOutput.GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT,
  structuredOutput.GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT,
]);
assert.equal(extractionPrompts[0], originalExtractionPrompt);
assert(extractionPrompts[1].includes("Original extraction instructions:"));
assert(extractionPrompts[1].includes(originalExtractionPrompt));
assert(extractionPrompts[1].includes("zero importable questions"));
assert(extractionPrompts[1].includes('{"questions":[],"warnings":[]}'));
assert(extractionPrompts[1].includes('"question_number"'));
assert(!extractionPrompts[1].includes('"question_code"'));

const priorPromptCount = extractionPrompts.length;
extractionResponses = ['{"questions":[],"warnings":[]}'];
const oneAttemptBudget = budgetModule.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
});
await assert.rejects(
  chat.callAIPdfExtractionProvider({
    executionObserver: oneAttemptBudget,
    fileName: "synthetic.pdf",
    inputStrategy: "gemini_native_pdf",
    pageImageDataUrls: [],
    pdfBase64: "",
    pdfBytes: Buffer.from("synthetic-pdf"),
    profile: {
      apiKey: "synthetic-test-key",
      base_url: "https://provider.invalid",
      model: "synthetic-model",
      name: "Synthetic Provider",
      provider: "gemini_native",
      supports_pdf_input: true,
      supports_vision_images: false,
    },
    prompt: originalExtractionPrompt,
  }),
  (error) => {
    assert(!(error instanceof errors.AIProviderError));
    assert.match(error.message, /at least one item|zero importable questions/);
    assert(!error.message.includes("provider_execution_budget_exhausted"));
    return true;
  },
);
assert.equal(extractionPrompts.length, priorPromptCount + 1);
assert.equal(oneAttemptBudget.snapshot().providerInferenceAttempts, 1);

const rawResponseMarker = "PRIVATE_PROVIDER_OUTPUT_MUST_NOT_ESCAPE";
extractionResponses = [rawResponseMarker, rawResponseMarker];
await assert.rejects(
  chat.callAIPdfExtractionProvider({
    fileName: "synthetic.pdf",
    inputStrategy: "gemini_native_pdf",
    pageImageDataUrls: [],
    pdfBase64: "",
    pdfBytes: Buffer.from("synthetic-pdf"),
    profile: {
      apiKey: "synthetic-test-key",
      base_url: "https://provider.invalid",
      model: "synthetic-model",
      name: "Synthetic Provider",
      provider: "gemini_native",
      supports_pdf_input: true,
      supports_vision_images: false,
    },
    prompt: originalExtractionPrompt,
  }),
  (error) => {
    assert.equal(error.message, "AI provider returned non-JSON content.");
    assert(!error.message.includes(rawResponseMarker));
    assert.equal(
      errors.classifyAIProviderError({ error, operation: "ai_pdf_extraction" }).code,
      "provider_invalid_response",
    );
    return true;
  },
);

console.log(
  "PASS PDF50 Provider lifecycle runtime smoke: bounded inference / JSON PDF output / counted upload-poll-inference-cleanup / pre-inference upload failure / cleanup-failure evidence / concurrent denial / malformed-response cleanup / pre-transport exhaustion / stateless repair continuity / raw-output containment",
);
