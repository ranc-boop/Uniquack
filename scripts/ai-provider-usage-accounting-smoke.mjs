import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

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
  const loaded = { exports: {} };
  const requireMock = (specifier) => {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    throw new Error(`Unexpected test dependency: ${specifier}`);
  };
  new Function("exports", "require", "module", "__filename", "__dirname", output)(
    loaded.exports,
    requireMock,
    loaded,
    filePath,
    dirname(filePath),
  );
  return loaded.exports;
}

const providerUsage = await loadTypeScriptModule(
  "src/lib/ai-operations/provider-usage.ts",
);
const costCatalog = await loadTypeScriptModule(
  "src/lib/ai-operations/cost-catalog.ts",
  { "@/lib/ai-operations/provider-usage": providerUsage },
);
const errors = await loadTypeScriptModule("src/lib/ai-providers/errors.ts");
const executionBudget = await loadTypeScriptModule(
  "src/lib/ai-providers/execution-budget.ts",
  { "@/lib/ai-providers/errors": errors },
);
const extractionSchema = JSON.parse(
  await readFile(
    resolve(root, "src/lib/ai-providers/gemini-ai-pdf-extraction.schema.json"),
    "utf8",
  ),
);
const structuredOutput = await loadTypeScriptModule(
  "src/lib/ai-providers/gemini-structured-output.ts",
  { "./gemini-ai-pdf-extraction.schema.json": extractionSchema },
);
const gemini = await loadTypeScriptModule(
  "src/lib/ai-providers/gemini-native.ts",
  {
    "@/lib/ai-operations/provider-usage": providerUsage,
    "@/lib/ai-providers/gemini-structured-output": structuredOutput,
    "@/lib/ai-providers/llm-debug-logs": {
      writeAIImportLLMDebugLog: async () => undefined,
    },
    "@/lib/ai-providers/network-safety": {
      assertSafeAIProviderBaseUrl: async () => undefined,
    },
    "@/lib/ai-providers/response-limits": {
      readResponseTextWithLimit: async (response, maximumBytes) => {
        const text = await response.text();
        assert(Buffer.byteLength(text, "utf8") <= maximumBytes);
        return text;
      },
    },
  },
);

const normalized = providerUsage.normalizeAIProviderUsage({
  cachedContentTokenCount: 5,
  candidatesTokenCount: 30,
  promptTokenCount: 100,
  promptTokensDetails: [
    { modality: "TEXT", tokenCount: 80 },
    { modality: "IMAGE", tokenCount: 20 },
    { modality: "unsafe modality", tokenCount: 1 },
  ],
  thoughtsTokenCount: 7,
  toolUsePromptTokenCount: 3,
  totalTokenCount: 140,
});
assert.deepEqual(normalized, {
  cachedInputTokens: 5,
  candidateOutputTokens: 30,
  inputTokens: 100,
  outputTokens: 37,
  promptTokensDetails: [
    { modality: "TEXT", tokenCount: 80 },
    { modality: "IMAGE", tokenCount: 20 },
  ],
  thoughtTokens: 7,
  toolUseInputTokens: 3,
  totalTokens: 140,
});

const unknown = providerUsage.buildAIProviderUsageAccounting({
  localContextBytes: { serializedRequestBytes: 200, sourceInputBytes: 100 },
});
assert.equal(unknown.providerReportedUsage, null);
assert(unknown.unknownUsage.fields.includes("providerReportedInputTokens"));
assert.equal(JSON.stringify(unknown).includes("inputTokens\":0"), false);

assert.deepEqual(
  costCatalog.estimateAIProviderCost({
    model: "gemini-2.5-flash-lite",
    provider: "gemini_native",
    usage: providerUsage.normalizeAIProviderUsage({
      inputTokens: null,
      outputTokens: null,
    }),
  }),
  {
    cachedInputCostMicros: null,
    inputCostMicros: null,
    outputCostMicros: null,
    totalCostMicros: null,
  },
);
assert.equal(
  costCatalog.sumAIProviderUsage([
    normalized,
    { ...normalized, inputTokens: null },
  ]).inputTokens,
  null,
  "partial aggregate usage must remain unknown",
);
assert.equal(
  costCatalog.sumAIProviderUsage([normalized, null]).inputTokens,
  null,
  "a missing attempt must keep aggregate usage unknown",
);
assert.deepEqual(
  costCatalog.estimateAIProviderCost({
    model: "gemini-2.5-flash-lite",
    provider: "gemini_native",
    usage: { ...normalized, cachedInputTokens: null },
  }),
  {
    cachedInputCostMicros: null,
    inputCostMicros: null,
    outputCostMicros: 15,
    totalCostMicros: null,
  },
  "missing cached-token usage must not be converted to zero",
);

const prompt = "SYNTHETIC_PRIVATE_PROMPT_MUST_NOT_ENTER_USAGE";
const requests = [];
const budget = executionBudget.createAIProviderExecutionBudget({
  maxInferenceAttempts: 1,
  maxNetworkRequests: 2,
  maxOutputTokens: 64,
});
const result = await gemini.generateWithGeminiNativeText({
  apiKey: "synthetic-test-key",
  baseUrl: "https://provider.invalid",
  countTokensMode: "required",
  executionObserver: budget,
  fetchImpl: async (url, init) => {
    const body = JSON.parse(String(init.body));
    requests.push({ body, url: String(url) });
    if (String(url).includes(":countTokens")) {
      return Response.json({
        cachedContentTokenCount: 4,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 120 }],
        totalTokens: 120,
      });
    }
    return Response.json({
      candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }],
      usageMetadata: {
        cachedContentTokenCount: 4,
        candidatesTokenCount: 12,
        promptTokenCount: 121,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 121 }],
        thoughtsTokenCount: 2,
        toolUsePromptTokenCount: 0,
        totalTokenCount: 135,
      },
    });
  },
  model: "synthetic-model",
  outputContract: { mode: "json" },
  prompt,
});

assert.equal(requests.length, 2);
const countRequest = requests.find((request) =>
  request.url.includes(":countTokens"),
).body.generateContentRequest;
const generateRequest = requests.find((request) =>
  request.url.includes(":generateContent"),
).body;
const { model: countedModel, ...countedSemanticRequest } = countRequest;
assert.equal(countedModel, "models/synthetic-model");
assert.deepEqual(countedSemanticRequest, generateRequest);
assert.equal(
  result.usageAccounting.providerCountTokens.inputTokens,
  120,
);
assert.equal(
  result.usageAccounting.providerReportedUsage.usage.inputTokens,
  121,
);
assert.equal(
  result.usageAccounting.providerReportedUsage.usage.candidateOutputTokens,
  12,
);
assert.equal(
  result.usageAccounting.providerReportedUsage.usage.thoughtTokens,
  2,
);
assert.equal(JSON.stringify(result.usageAccounting).includes(prompt), false);
assert.deepEqual(budget.snapshot(), {
  maxInferenceAttempts: 1,
  maxNetworkRequests: 2,
  maxOutputTokens: 64,
  providerCleanupFailures: 0,
  providerCleanupRequests: 0,
  providerInputBytesMax: 0,
  providerInferenceAttempts: 1,
  providerInferenceRequests: 1,
  providerNetworkRequests: 2,
  providerPollRequests: 0,
  providerTokenCountRequests: 1,
  providerUploadRequests: 0,
});

let failedAccounting = null;
await assert.rejects(
  gemini.generateWithGeminiNativeText({
    apiKey: "synthetic-test-key",
    baseUrl: "https://provider.invalid",
    countTokensMode: "required",
    fetchImpl: async (url) => {
      if (String(url).includes(":countTokens")) {
        return Response.json({ totalTokens: 55 });
      }
      throw new TypeError("synthetic response loss");
    },
    model: "synthetic-model",
    prompt,
  }),
  (error) => {
    failedAccounting = providerUsage.readAIProviderUsageAccountingFromError(
      error,
    );
    return true;
  },
);
assert.equal(failedAccounting.providerCountTokens.inputTokens, 55);
assert.equal(failedAccounting.providerReportedUsage, null);
assert(failedAccounting.unknownUsage.fields.includes("candidateOutputTokens"));
assert(failedAccounting.unknownUsage.fields.includes("thoughtTokens"));
assert.equal(JSON.stringify(failedAccounting).includes(prompt), false);

console.log("AI_PROVIDER_USAGE_ACCOUNTING=PASS");
console.log("GEMINI_COUNT_TOKENS_SEMANTIC_REQUEST_PARITY=PASS");
console.log("MISSING_USAGE_REMAINS_UNKNOWN=PASS");
console.log("PROVIDER_CALLS=0");
