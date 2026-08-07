#!/usr/bin/env node

// Bounded model-quality baseline. The launcher supplies process-only secrets
// from the user-scoped DPAPI vault; this process never loads environment files.

import { spawnSync } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  aggregateProviderBenchmarkEvaluations,
  evaluateProviderBenchmarkSource,
} from "./lib/provider-benchmark-v1-evaluator.mjs";
import { buildProviderUsageBaselineReport } from "./lib/provider-usage-baseline.mjs";
import {
  AI_PARSING_PROVIDER_BENCHMARK_V1_SOURCE_IDS,
  buildAIParsingProviderBenchmarkV1Source,
  fingerprintAIParsingProviderBenchmarkV1Source,
} from "./provider-benchmark-v1-sources.mjs";

const hasReactServerCondition = process.execArgv.some(
  (argument) =>
    argument === "--conditions=react-server" || argument === "-Creact-server",
);

if (!process.env.GEMINI_BASELINE_REEXECED && !hasReactServerCondition) {
  const child = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      "--conditions=react-server",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    {
      env: { ...process.env, GEMINI_BASELINE_REEXECED: "1" },
      stdio: "inherit",
    },
  );
  process.exit(child.status ?? 1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(root, "fixtures", "ai-parsing-provider-benchmark-v1");
const manifestPath = resolve(fixtureRoot, "manifest.json");
const evaluationContractPath = resolve(fixtureRoot, "evaluation-contract.json");
const evaluatorImplementationPath = resolve(
  root,
  "scripts",
  "ai-parsing-eval",
  "lib",
  "provider-benchmark-v1-evaluator.mjs",
);
const observationsPath = resolve(fixtureRoot, "gemini-observations.json");
const requiredStartingHead = "6c7df56393b7bf3eca6c853b57967671e165f580";
const expectedModel = "gemini-2.5-flash-lite";
const expectedEnvironment = "DISPOSABLE_GEMINI_AI_PARSING_BASELINE_V1";
const expectedConfirmation = "RUN_GEMINI_AI_PARSING_BASELINE_V1";
const approvedBudgetUsd = 0.5;
const maxWholeBenchmarkRuns = 3;
const maxSemanticAttemptsPerSource = 2;
const maxInferenceRequests = 12;
const maxNetworkRequests = 120;
const maxInputBytesPerInference = 262_144;
const maxOutputTokensPerInference = 4_096;
const pricing = Object.freeze({
  cachedInputMicrosPerMillion: 10_000,
  inputMicrosPerMillion: 100_000,
  outputMicrosPerMillion: 400_000,
});
const conservativeExposureMicros =
  maxInferenceRequests *
  (Math.ceil(
    (maxInputBytesPerInference * pricing.inputMicrosPerMillion) / 1_000_000,
  ) +
    Math.ceil(
      (maxOutputTokensPerInference * pricing.outputMicrosPerMillion) / 1_000_000,
    ));
const infrastructureFailureCategories = new Set([
  "provider_busy",
  "provider_network_error",
  "provider_rate_limited",
  "provider_timeout",
]);
const blockedFailureCategories = new Set([
  "provider_configuration_error",
  "provider_execution_budget_exhausted",
  "provider_permission_error",
]);
const requiredEnvironmentNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "PDF50_E2E_EXPECTED_PROJECT_REF",
  "GEMINI_BASELINE_ENVIRONMENT",
  "GEMINI_BASELINE_CONFIRM",
  "GEMINI_BASELINE_BUDGET_USD",
  "GEMINI_BASELINE_RUN_ORDINAL",
  "GEMINI_BASELINE_EXPECTED_HEAD",
];

class BaselineError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "BaselineError";
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new BaselineError("required_process_environment_missing");
  return value;
}

function canonicalSha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fileSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new BaselineError("git_contract_failed");
  return String(result.stdout ?? "").trim();
}

function assertProjectIdentity(urlValue, expectedProjectRef) {
  if (!/^[a-z0-9]{8,40}$/.test(expectedProjectRef)) {
    throw new BaselineError("expected_project_identity_invalid");
  }
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new BaselineError("supabase_url_contract_rejected");
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match ||
    match[1] !== expectedProjectRef
  ) {
    throw new BaselineError("expected_project_identity_mismatch");
  }
}

function assertSafetyContract() {
  if (process.env.NODE_ENV === "production") {
    throw new BaselineError("production_environment_refused");
  }
  if (requiredEnvironment("GEMINI_BASELINE_ENVIRONMENT") !== expectedEnvironment) {
    throw new BaselineError("environment_acknowledgement_rejected");
  }
  if (requiredEnvironment("GEMINI_BASELINE_CONFIRM") !== expectedConfirmation) {
    throw new BaselineError("execution_acknowledgement_rejected");
  }
  if (Number(requiredEnvironment("GEMINI_BASELINE_BUDGET_USD")) !== approvedBudgetUsd) {
    throw new BaselineError("provider_budget_rejected");
  }
  const runOrdinal = Number(requiredEnvironment("GEMINI_BASELINE_RUN_ORDINAL"));
  if (
    !Number.isSafeInteger(runOrdinal) ||
    runOrdinal < 1 ||
    runOrdinal > maxWholeBenchmarkRuns
  ) {
    throw new BaselineError("benchmark_run_ordinal_rejected");
  }
  if (conservativeExposureMicros > approvedBudgetUsd * 1_000_000) {
    throw new BaselineError("theoretical_provider_exposure_rejected");
  }
  delete process.env.AI_IMPORT_LLM_DEBUG_LOGS;
}

function assertGitContract() {
  const expectedHead = requiredEnvironment("GEMINI_BASELINE_EXPECTED_HEAD");
  const currentHead = runGit(["rev-parse", "HEAD"]);
  if (currentHead !== expectedHead) throw new BaselineError("source_head_mismatch");
  if (runGit(["status", "--porcelain=v1", "--untracked-files=all"])) {
    throw new BaselineError("dirty_worktree_refused");
  }
  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", requiredStartingHead, currentHead],
    { cwd: root, windowsHide: true },
  );
  if (ancestor.status !== 0) throw new BaselineError("starting_head_not_in_history");
  return currentHead;
}

function decryptProviderKey(profile, encryptionSecret) {
  if (!profile.api_key_ciphertext || !profile.api_key_iv || !profile.api_key_tag) {
    throw new BaselineError("provider_credential_unavailable");
  }
  try {
    const key = createHash("sha256").update(encryptionSecret).digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(profile.api_key_iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(profile.api_key_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(profile.api_key_ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new BaselineError("provider_credential_decryption_failed");
  }
}

async function loadConfiguredProvider(supabase, encryptionSecret) {
  const { data, error } = await supabase
    .from("ai_provider_profiles")
    .select(
      "name, provider, base_url, model, enabled, is_default, supports_pdf_input, api_key_ciphertext, api_key_iv, api_key_tag",
    )
    .eq("enabled", true)
    .eq("model", expectedModel)
    .is("deleted_at", null);
  if (error) throw new BaselineError("provider_profile_read_failed");
  const candidates = (data ?? [])
    .filter((profile) => profile.supports_pdf_input)
    .sort((left, right) => Number(right.is_default) - Number(left.is_default));
  if (!candidates.length) throw new BaselineError("provider_profile_unavailable");
  const profile = candidates[0];
  return {
    apiKey: decryptProviderKey(profile, encryptionSecret),
    base_url: profile.base_url,
    model: profile.model,
    name: profile.name,
    provider: profile.provider,
  };
}

function createGlobalBudget() {
  const counters = {
    cleanupFailures: 0,
    cleanupRequests: 0,
    inferenceAttempts: 0,
    inferenceRequests: 0,
    networkRequests: 0,
    tokenCountRequests: 0,
  };
  return {
    beforeInference(_operation, inputBytes) {
      if (counters.inferenceAttempts >= maxInferenceRequests) {
        throw new BaselineError("global_inference_budget_exhausted");
      }
      if (
        inputBytes !== undefined &&
        (!Number.isSafeInteger(inputBytes) ||
          inputBytes < 1 ||
          inputBytes > maxInputBytesPerInference)
      ) {
        throw new BaselineError("global_input_budget_exhausted");
      }
      counters.inferenceAttempts += 1;
    },
    maxOutputTokens: maxOutputTokensPerInference,
    recordCleanupResult(succeeded) {
      if (!succeeded) counters.cleanupFailures += 1;
    },
    recordNetworkRequest(kind) {
      if (counters.networkRequests >= maxNetworkRequests) {
        throw new BaselineError("global_network_budget_exhausted");
      }
      counters.networkRequests += 1;
      if (kind === "file_cleanup") counters.cleanupRequests += 1;
      if (kind === "inference") counters.inferenceRequests += 1;
      if (kind === "token_count") counters.tokenCountRequests += 1;
    },
    snapshot() {
      return { ...counters };
    },
  };
}

function combineBudgets(globalBudget, sourceBudget) {
  return {
    beforeInference(operation, inputBytes) {
      globalBudget.beforeInference(operation, inputBytes);
      sourceBudget.beforeInference(operation, inputBytes);
    },
    maxOutputTokens: maxOutputTokensPerInference,
    recordCleanupResult(succeeded) {
      globalBudget.recordCleanupResult(succeeded);
      sourceBudget.recordCleanupResult?.(succeeded);
    },
    recordNetworkRequest(kind) {
      globalBudget.recordNetworkRequest(kind);
      sourceBudget.recordNetworkRequest(kind);
    },
  };
}

function aggregateHistogram(jobs) {
  const histogram = {};
  for (const job of jobs) {
    for (const [reason, count] of Object.entries(job.attemptHistogram)) {
      histogram[reason] = (histogram[reason] ?? 0) + Number(count ?? 0);
    }
  }
  return histogram;
}

function percentile(values, quantile) {
  const sorted = values.slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function nullableRate(numerator, denominator) {
  return denominator
    ? Number((numerator / denominator).toFixed(6))
    : null;
}

function providerOutcomeFromSnapshot(snapshot) {
  const last = snapshot.attempts.at(-1);
  if (!last) return "model_quality_rejection";
  if (infrastructureFailureCategories.has(last.failureCategory)) {
    throw new BaselineError(`infrastructure_${last.failureCategory}`);
  }
  if (blockedFailureCategories.has(last.failureCategory)) {
    throw new BaselineError(last.failureCategory);
  }
  return "model_quality_rejection";
}

async function atomicWriteJson(path, payload) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  assertSafetyContract();
  const sourceHead = assertGitContract();
  const runOrdinal = Number(requiredEnvironment("GEMINI_BASELINE_RUN_ORDINAL"));
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("CLEAN_SUPABASE_SERVICE_ROLE_KEY");
  const encryptionSecret = requiredEnvironment("AI_PROVIDER_ENCRYPTION_KEY");
  const projectRef = requiredEnvironment("PDF50_E2E_EXPECTED_PROJECT_REF");
  assertProjectIdentity(supabaseUrl, projectRef);

  const [
    manifest,
    evaluationContract,
    evaluatorImplementation,
    priorObservations,
  ] = await Promise.all([
    loadJson(manifestPath),
    loadJson(evaluationContractPath),
    readFile(evaluatorImplementationPath, "utf8"),
    loadJson(observationsPath),
  ]);
  if (priorObservations.status === "COMPLETE") {
    throw new BaselineError("completed_baseline_overwrite_refused");
  }
  if (manifest.sources.length !== 6) {
    throw new BaselineError("benchmark_source_count_mismatch");
  }
  if (
    canonicalSha256(evaluationContract) !==
    manifest.evaluationContract.sha256
  ) {
    throw new BaselineError("evaluation_contract_fingerprint_mismatch");
  }
  if (evaluationContract.frozenBeforeProviderObservation !== true) {
    throw new BaselineError("evaluation_contract_not_frozen");
  }
  if (
    fileSha256(Buffer.from(evaluatorImplementation.replace(/\r\n/g, "\n"), "utf8")) !==
      manifest.evaluationContract.implementationSha256NormalizedLf
  ) {
    throw new BaselineError("evaluator_implementation_fingerprint_mismatch");
  }
  for (const source of manifest.sources) {
    const fingerprint = fingerprintAIParsingProviderBenchmarkV1Source(source.sourceId);
    if (
      fingerprint.byteLength !== source.byteLength ||
      fingerprint.sha256 !== source.sha256
    ) {
      throw new BaselineError("benchmark_source_fingerprint_mismatch");
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { "X-Client-Info": "edustruct-gemini-baseline-v1" } },
  });

  const require = createRequire(import.meta.url);
  const jiti = require("jiti")(import.meta.url, {
    alias: { "@": resolve(root, "src") },
    cache: false,
  });
  const { callAIPdfExtractionProvider } = jiti(
    "../../src/lib/ai-providers/chat.ts",
  );
  const { createAIProviderExecutionBudget } = jiti(
    "../../src/lib/ai-providers/execution-budget.ts",
  );
  const { createAIPdfQualityObservatory } = jiti(
    "../../src/lib/ai-pdf-import/quality-observatory.ts",
  );
  const { buildAIPdfProviderBenchmarkContract } = jiti(
    "../../src/lib/ai-pdf-import/service.ts",
  );

  let provider = await loadConfiguredProvider(supabase, encryptionSecret);
  if (provider.model !== expectedModel) {
    throw new BaselineError("provider_model_contract_mismatch");
  }
  const globalBudget = createGlobalBudget();
  const rows = [];
  const jobs = [];
  const evaluations = [];
  const candidateHashes = new Set();

  for (const [sourceIndex, sourceId] of AI_PARSING_PROVIDER_BENCHMARK_V1_SOURCE_IDS.entries()) {
    const sourceManifest = manifest.sources.find((source) => source.sourceId === sourceId);
    if (!sourceManifest) throw new BaselineError("benchmark_manifest_source_missing");
    const pdfBytes = buildAIParsingProviderBenchmarkV1Source(sourceId);
    const providerContract = await buildAIPdfProviderBenchmarkContract({
      fileName: `synthetic-source-${String(sourceIndex + 1).padStart(2, "0")}.pdf`,
      pageCount: sourceManifest.pageCount,
      supabase,
    });
    if (
      providerContract.contractEvidence.parsingContractSha256 !==
        manifest.runtimeBindings.parsingContractSha256 ||
      providerContract.contractEvidence.taxonomySnapshotSha256 !==
        manifest.runtimeBindings.taxonomySnapshotSha256
    ) {
      throw new BaselineError("runtime_contract_binding_mismatch");
    }
    candidateHashes.add(
      providerContract.contractEvidence.candidateSubsetSha256,
    );
    const expectedTaxonomyIds =
      evaluationContract.sources[sourceId].taxonomy?.expectedIds ?? [];
    const authoritativeTagIds = new Set(providerContract.authoritativeTagIds);
    if (expectedTaxonomyIds.some((tagId) => !authoritativeTagIds.has(tagId))) {
      throw new BaselineError("evaluation_taxonomy_contract_invalid");
    }
    const qualityObserver = createAIPdfQualityObservatory();
    qualityObserver.recordContractEvidence(providerContract.contractEvidence);
    const sourceBudget = createAIProviderExecutionBudget({
      maxInferenceAttempts: maxSemanticAttemptsPerSource,
      maxNetworkRequests: 20,
      maxOutputTokens: maxOutputTokensPerInference,
    });
    const executionObserver = combineBudgets(globalBudget, sourceBudget);
    let extraction = null;
    let providerOutcome = "success";
    try {
      extraction = await callAIPdfExtractionProvider({
        attemptScope: `benchmark-${sourceIndex + 1}`,
        countTokensMode: "required",
        executionObserver,
        fileName: `synthetic-source-${String(sourceIndex + 1).padStart(2, "0")}.pdf`,
        inputStrategy: "gemini_native_pdf",
        pageImageDataUrls: [],
        pdfBase64: pdfBytes.toString("base64"),
        pdfBytes,
        profile: provider,
        prompt: providerContract.promptText,
        promptContext: providerContract.promptContext,
        providerRetryMaxAttempts: 1,
        qualityObserver,
      });
    } catch {
      providerOutcome = providerOutcomeFromSnapshot(qualityObserver.snapshot());
    }
    const evaluation = evaluateProviderBenchmarkSource({
      activeTagFacets: providerContract.activeTags,
      activeTagIds: providerContract.activeTagIds,
      contract: evaluationContract,
      extraction,
      providerOutcome,
      sourceId,
    });
    evaluations.push(evaluation);
    const snapshot = qualityObserver.snapshot();
    for (const [attemptIndex, attempt] of snapshot.attempts.entries()) {
      rows.push({
        attemptOrdinal: attemptIndex + 1,
        attemptReason: attempt.reason,
        benchmarkCorpusVersion: manifest.version,
        candidateSubsetSha256:
          providerContract.contractEvidence.candidateSubsetSha256,
        durationMs: attempt.durationMs,
        evidenceClass: manifest.evidenceClass,
        jobOrdinal: sourceIndex + 1,
        model: provider.model,
        parsingContractSha256:
          providerContract.contractEvidence.parsingContractSha256,
        provider: "gemini_native",
        sourceId,
        taxonomySnapshotSha256:
          providerContract.contractEvidence.taxonomySnapshotSha256,
        usageAccounting: attempt.usageAccounting,
      });
    }
    jobs.push({
      attemptHistogram: snapshot.attemptHistogram,
      attempts: snapshot.attemptsPerJob,
      completed: true,
      contextComposition: snapshot.contextComposition,
      firstAttemptSuccess: snapshot.firstAttemptSuccess,
      jobOrdinal: sourceIndex + 1,
      metrics: evaluation,
      providerCounters: sourceBudget.snapshot(),
      repairSucceeded:
        snapshot.attemptsPerJob > 1 && snapshot.attempts.at(-1)?.outcome === "success",
      sourceId,
      validReviewDrafts: evaluation.parsing.validReviewDrafts,
    });
  }

  const qualityAggregate = aggregateProviderBenchmarkEvaluations(evaluations);
  const attemptHistogram = aggregateHistogram(jobs);
  const attemptsPerSource = jobs.map((job) => job.attempts);
  const repairedJobs = jobs.filter((job) => job.attempts > 1);
  const observations = {
    benchmarkCorpusVersion: manifest.version,
    benchmarkManifestSha256: canonicalSha256(manifest),
    candidateSubsetSha256: [...candidateHashes].sort(),
    cleanup: {
      databaseFixturesCreated: 0,
      databaseRowsWritten: 0,
      localTemporaryFilesRemaining: 0,
      providerCleanupFailures: globalBudget.snapshot().cleanupFailures,
      providerFilesCleanupRequested: globalBudget.snapshot().cleanupRequests,
      storageObjectsWritten: 0,
    },
    dashboardObservedCost: {
      source: "UNKNOWN_USAGE",
      valueMicros: null,
    },
    evidenceClass: manifest.evidenceClass,
    evaluationContractSha256: canonicalSha256(evaluationContract),
    evaluatorVersion: evaluationContract.version,
    jobs,
    model: provider.model,
    provider: "gemini_native",
    qualityAggregate,
    reliability: {
      attemptHistogram,
      firstAttemptSuccessRate: Number((
        jobs.filter((job) => job.firstAttemptSuccess).length / jobs.length
      ).toFixed(6)),
      p50AttemptsPerSource: percentile(attemptsPerSource, 0.5),
      p95AttemptsPerSource: percentile(attemptsPerSource, 0.95),
      repairRate: Number((
        jobs.filter((job) => job.attempts > 1).length / jobs.length
      ).toFixed(6)),
      repairSuccessRate: nullableRate(
        repairedJobs.filter((job) => job.repairSucceeded).length,
        repairedJobs.length,
      ),
      sourceBackedSemanticRecoveryRate: Number((
        jobs.filter(
          (job) =>
            Number(job.attemptHistogram.SOURCE_BACKED_SEMANTIC_RECOVERY ?? 0) > 0,
        ).length / jobs.length
      ).toFixed(6)),
      transientRetryRate: Number((
        jobs.filter((job) =>
          ["PROVIDER_BUSY_RETRY", "RATE_LIMIT_RETRY", "NETWORK_RETRY", "TIMEOUT_RETRY"]
            .some((reason) => Number(job.attemptHistogram[reason] ?? 0) > 0),
        ).length / jobs.length
      ).toFixed(6)),
    },
    rows,
    run: {
      approvedBudgetUsd,
      completedAt: new Date().toISOString(),
      conservativeExposureMicros,
      globalProviderCounters: globalBudget.snapshot(),
      maxWholeBenchmarkRuns,
      runOrdinal,
      sourceHead,
    },
    status: "COMPLETE",
  };
  const report = buildProviderUsageBaselineReport({
    manifest,
    observations,
    pricing,
  });
  if (
    report.aggregate.inputTokenCoverage !== `${rows.length}/${rows.length}` ||
    report.aggregate.outputTokenCoverage !== `${rows.length}/${rows.length}` ||
    report.aggregate.totalTokenCoverage !== `${rows.length}/${rows.length}` ||
    report.aggregate.countTokensComparisonCoverage !== `${rows.length}/${rows.length}`
  ) {
    throw new BaselineError("usage_accounting_incomplete");
  }
  if (
    report.jobTotals.some((job) => job.usageDerivedCostMicros === null) ||
    report.jobTotals.reduce(
      (total, job) => total + job.usageDerivedCostMicros,
      0,
    ) > approvedBudgetUsd * 1_000_000
  ) {
    throw new BaselineError("credible_provider_spend_unresolved");
  }
  if (globalBudget.snapshot().cleanupFailures > 0) {
    throw new BaselineError("provider_file_cleanup_failed");
  }

  await atomicWriteJson(observationsPath, observations);
  provider = null;
  console.log("GEMINI_AI_PARSING_BASELINE_V1=COMPLETE");
  console.log(`BENCHMARK_RUN_ORDINAL=${runOrdinal}`);
  console.log(`BENCHMARK_SOURCES=${jobs.length}`);
  console.log(`PROVIDER_INFERENCE_REQUESTS=${globalBudget.snapshot().inferenceRequests}`);
  console.log(`PROVIDER_COUNT_TOKENS_REQUESTS=${globalBudget.snapshot().tokenCountRequests}`);
  console.log(`VALID_REVIEW_DRAFTS=${qualityAggregate.parsing.validReviewDrafts}`);
  console.log(`NEEDS_MORE_EVIDENCE_DRAFTS=${qualityAggregate.parsing.needsMoreEvidenceDrafts}`);
  console.log(`USAGE_DERIVED_COST_MICROS=${report.jobTotals.reduce(
    (total, job) => total + job.usageDerivedCostMicros,
    0,
  )}`);
  console.log("DASHBOARD_COST=UNKNOWN_USAGE");
  console.log("PROVIDER_FILE_CLEANUP=PASS");
  console.log("HOSTED_WRITES=0");
}

let lockHandle = null;
const lockPath = resolve(tmpdir(), "edustruct-gemini-ai-parsing-baseline-v1.lock");
try {
  lockHandle = await open(lockPath, "wx", 0o600);
  await main();
} catch (error) {
  const code = error instanceof BaselineError ? error.code : "unexpected_failure";
  console.log("GEMINI_AI_PARSING_BASELINE_V1=BLOCKED");
  console.log(`FAILURE_CATEGORY=${code}`);
  process.exitCode = 1;
} finally {
  await lockHandle?.close().catch(() => {});
  await rm(lockPath, { force: true }).catch(() => {});
  for (const name of requiredEnvironmentNames) delete process.env[name];
  delete process.env.AI_IMPORT_LLM_DEBUG_LOGS;
  delete process.env.GEMINI_BASELINE_REEXECED;
  console.log("PROCESS_ENVIRONMENT_CLEARED=PASS");
}
