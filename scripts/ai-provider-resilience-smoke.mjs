import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
}

async function loadResilienceModules() {
  const errorsSource = transpile(
    await read("src/lib/ai-providers/errors.ts"),
    "errors.ts",
  ).replace('import "server-only";', "");
  const errorsUrl = moduleUrl(errorsSource);
  const resilienceSource = transpile(
    await read("src/lib/ai-providers/resilience.ts"),
    "resilience.ts",
  )
    .replace('import "server-only";', "")
    .replace('from "@/lib/ai-providers/errors"', `from "${errorsUrl}"`);

  const [errors, resilience] = await Promise.all([
    import(errorsUrl),
    import(moduleUrl(resilienceSource)),
  ]);

  return { ...errors, ...resilience };
}

const {
  redactAIProviderDiagnostic,
  safeAIProviderErrorState,
  runWithAIProviderRetry,
} = await loadResilienceModules();

async function retry503ThenSuccess() {
  let calls = 0;
  const delays = [];
  const retryStates = [];
  const result = await runWithAIProviderRetry({
    onRetry: (event) => retryStates.push(event.error),
    operation: "ai_pdf_extraction",
    policy: { baseDelayMs: 100, maxAttempts: 4, maxDelayMs: 1_000 },
    random: () => 0.5,
    run: async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("Gemini 503 UNAVAILABLE high demand"), {
          status: 503,
        });
      }
      return "extracted";
    },
    sleep: async (delay) => delays.push(delay),
  });

  assert(calls === 2, "503 should retry once before succeeding");
  assert(result.value === "extracted", "503 retry should return successful provider output");
  assert(delays.length === 1 && delays[0] === 50, "full jitter delay should be injected");
  assert(
    retryStates[0]?.safeErrorCode === "provider_busy" &&
      !JSON.stringify(retryStates[0]).includes("503"),
    "retry state must classify 503 without exposing raw provider status text",
  );
}

async function retryAfterIsBounded() {
  let calls = 0;
  const delays = [];
  await runWithAIProviderRetry({
    operation: "ai_pdf_extraction",
    policy: { maxAttempts: 2, maxDelayMs: 12_000, maxRetryAfterMs: 12_000 },
    run: async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("rate limit"), {
          headers: { "retry-after": "7" },
          status: 429,
        });
      }
      return "ok";
    },
    sleep: async (delay) => delays.push(delay),
  });

  assert(delays[0] === 7_000, "Retry-After seconds must be honored without real sleep");
}

async function repeatedProviderFailureStops() {
  let calls = 0;
  let failure = null;
  try {
    await runWithAIProviderRetry({
      operation: "ai_pdf_extraction",
      policy: { maxAttempts: 3 },
      run: async () => {
        calls += 1;
        throw Object.assign(new Error("UNAVAILABLE"), { status: 503 });
      },
      sleep: async () => undefined,
    });
  } catch (error) {
    failure = error;
  }

  assert(calls === 3, "repeated 503 must stop at the configured attempt limit");
  assert(
    failure?.name === "AIProviderError",
    "retry exhaustion must return a typed provider error",
  );
  const safe = safeAIProviderErrorState({ error: failure });
  assert(
    safe.nextAction === "retry_later" &&
      !safe.safeMessage.includes("503") &&
      safe.attemptCount === 3,
    "final provider failure must provide safe retry-later guidance",
  );
}

async function permanentAndNetworkCases() {
  let invalidCalls = 0;
  let permissionCalls = 0;
  let timeoutCalls = 0;

  for (const [status, counter] of [[400, "invalid"], [401, "permission"]]) {
    try {
      await runWithAIProviderRetry({
        operation: "blueprint_generation",
        run: async () => {
          if (counter === "invalid") invalidCalls += 1;
          else permissionCalls += 1;
          throw Object.assign(new Error(`status ${status}`), { status });
        },
        sleep: async () => undefined,
      });
    } catch {
      // Expected: permanent provider failures are not retried.
    }
  }

  const timeoutResult = await runWithAIProviderRetry({
    operation: "blueprint_generation",
    run: async () => {
      timeoutCalls += 1;
      if (timeoutCalls === 1) throw new Error("deadline exceeded");
      return "drafts";
    },
    sleep: async () => undefined,
  });

  assert(invalidCalls === 1, "400 must not retry");
  assert(permissionCalls === 1, "401 must not retry");
  assert(timeoutCalls === 2 && timeoutResult.value === "drafts", "timeout should retry once");
}

function redactionCase() {
  const fakeKey = `AIza${"a".repeat(32)}`;
  const fakeDatabaseUrl = ["postgres:", "//user:password@host/db"].join("");
  const raw = `Bearer ${fakeKey} ${fakeDatabaseUrl} https://example.test/?token=private data:text/plain;base64,${"A".repeat(32)}\n at fakeStack`;
  const redacted = redactAIProviderDiagnostic(raw);

  assert(!redacted.includes(fakeKey), "provider key-shaped values must be redacted");
  assert(
    !redacted.includes(["postgres:", "//"].join("")),
    "database URLs must be redacted",
  );
  assert(!redacted.includes("base64,"), "base64 payloads must be redacted");
  assert(!redacted.includes("fakeStack"), "stack traces must be removed");
}

function functionSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `${startMarker} source block is missing`);
  const end = source.indexOf(endMarker, start);
  return end >= 0 ? source.slice(start, end) : source.slice(start);
}

function sourceIntegrationChecks({
  blueprintGeneration,
  chunking,
  pdfService,
  teacherActions,
  teacherPdfBurstActions,
}) {
  const singlePass = pdfService.slice(
    pdfService.indexOf("async function processAIPdfSinglePass"),
    pdfService.indexOf("export async function processAIPdfImport"),
  );
  const sequential = pdfService.slice(
    pdfService.indexOf("export async function processAIPdfImport"),
  );
  const coverageRecoveryAction = functionSlice(
    teacherActions,
    "export async function queueBankPdfCoverageRecovery",
    "export async function approveBankReviewQuestion",
  );
  const burstReservationAction = functionSlice(
    teacherPdfBurstActions,
    "export async function reserveTeacherAIPdfBurst",
    "async function markBurstItemFailed",
  );
  const burstFinalizeAction = functionSlice(
    teacherPdfBurstActions,
    "export async function finalizeTeacherAIPdfBurstItem",
    "export async function cancelTeacherAIPdfBurst",
  );

  assert(
    pdfService.includes("recordAIPdfProviderFailure") &&
      pdfService.includes('phase: "provider_retry_wait"') &&
      pdfService.includes("retryAttemptHistory") &&
      pdfService.includes("targetBankId: input.targetBankId"),
    "AI PDF failures must preserve safe retry state and target Bank lineage",
  );
  assert(
    singlePass.includes("runWithAIProviderRetry") &&
      singlePass.indexOf("runWithAIProviderRetry") < singlePass.indexOf("importBatchImportJson"),
    "full-PDF provider retries must finish before durable import writes",
  );
  assert(
    sequential.includes("runWithAIProviderRetry") &&
      sequential.includes("chunk,") &&
      pdfService.includes('status: "retrying"'),
    "sequential extraction must retry only the active chunk",
  );
  assert(
    chunking.includes('"retrying"') && chunking.includes("safeErrorCode"),
    "chunk summaries must support safe retry state without raw provider diagnostics",
  );
  assert(
    blueprintGeneration.includes("runWithAIProviderRetry") &&
      blueprintGeneration.includes("recordTeacherBlueprintGenerationFailure") &&
      blueprintGeneration.indexOf("runWithAIProviderRetry") <
        blueprintGeneration.indexOf("importBatchImportJson") &&
      !blueprintGeneration.includes("createAssignment"),
    "Blueprint retries must finish before one Review Draft handoff and must not create assignments",
  );
  assert(
    burstReservationAction.includes("resolveTeacherAIPdfProviderProfile") &&
      burstReservationAction.includes("p_provider_profile_id: provider.id") &&
      burstFinalizeAction.includes("releaseAIPdfBurstAdmissionJobs") &&
      coverageRecoveryAction.includes("assertNoRawProviderConfig(formData)") &&
      coverageRecoveryAction.includes("enqueueAIProviderJob") &&
      coverageRecoveryAction.includes("buildAIPdfCoverageRecoveryJobIdempotencyKey") &&
      coverageRecoveryAction.includes("resolveTeacherAIPdfProviderProfile") &&
      !coverageRecoveryAction.includes("await processAIPdfImport") &&
      !coverageRecoveryAction.includes("providerProfileId: formData") &&
      !burstReservationAction.includes("providerProfileId: formData"),
    "teacher imports must keep provider routing server-side and enqueue durable work without client provider configuration",
  );
}

await retry503ThenSuccess();
await retryAfterIsBounded();
await repeatedProviderFailureStops();
await permanentAndNetworkCases();
redactionCase();
sourceIntegrationChecks({
  blueprintGeneration: await read("src/lib/teacher-blueprint-generation.ts"),
  chunking: await read("src/lib/ai-pdf-import/chunking.ts"),
  pdfService: await read("src/lib/ai-pdf-import/service.ts"),
  teacherActions: await read("src/app/teacher/banks/actions.ts"),
  teacherPdfBurstActions: await read("src/app/teacher/banks/pdf-burst-actions.ts"),
});

console.log("PASS AI provider resilience smoke");
