import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const MODEL_QUALITY_PROVIDER_BENCHMARK =
  "MODEL_QUALITY_PROVIDER_BENCHMARK";
export const OPERATIONAL_PDF50_EVIDENCE = "OPERATIONAL_PDF50_EVIDENCE";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ATTEMPT_REASON_PATTERN = /^[A-Z][A-Z0-9_]{2,79}$/;

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function numeric(value) {
  return isCount(value) ? value : null;
}

function assertSha256(value, label) {
  assert.equal(
    typeof value === "string" && SHA256_PATTERN.test(value),
    true,
    `${label} must be a lowercase SHA-256`,
  );
}

function canonicalFingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function percentile(values, quantile) {
  const sorted = values
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

function strictSum(values) {
  return values.length && values.every((value) => typeof value === "number")
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function safeRatio(numerator, denominator) {
  return typeof numerator === "number" && denominator > 0
    ? Number((numerator / denominator).toFixed(6))
    : null;
}

function tokenMeasurement(value, source) {
  return typeof value === "number"
    ? { source, value }
    : { source: "UNKNOWN_USAGE", value: null };
}

function selectInputTokens(accounting) {
  const providerValue = numeric(
    accounting?.providerReportedUsage?.usage?.inputTokens,
  );
  if (providerValue !== null) {
    return tokenMeasurement(providerValue, "PROVIDER_REPORTED_USAGE");
  }
  const countTokensValue = numeric(
    accounting?.providerCountTokens?.inputTokens,
  );
  if (countTokensValue !== null) {
    return tokenMeasurement(countTokensValue, "PROVIDER_COUNT_TOKENS");
  }
  const estimatedValue = numeric(accounting?.estimatedUsage?.usage?.inputTokens);
  return estimatedValue === null
    ? tokenMeasurement(null, "UNKNOWN_USAGE")
    : tokenMeasurement(estimatedValue, "ESTIMATED_USAGE");
}

function selectCountTokensInput(accounting) {
  const value = numeric(accounting?.providerCountTokens?.inputTokens);
  return value === null
    ? tokenMeasurement(null, "UNKNOWN_USAGE")
    : tokenMeasurement(value, "PROVIDER_COUNT_TOKENS");
}

function selectProviderToken(accounting, key) {
  const value = numeric(accounting?.providerReportedUsage?.usage?.[key]);
  if (value !== null) {
    return tokenMeasurement(value, "PROVIDER_REPORTED_USAGE");
  }
  const estimated = numeric(accounting?.estimatedUsage?.usage?.[key]);
  return estimated === null
    ? tokenMeasurement(null, "UNKNOWN_USAGE")
    : tokenMeasurement(estimated, "ESTIMATED_USAGE");
}

function costMicros({ cachedInputTokens, inputTokens, outputTokens, pricing }) {
  if (inputTokens.value === null || outputTokens.value === null) return null;
  const hasDistinctCachedPrice =
    typeof pricing.cachedInputMicrosPerMillion === "number";
  if (hasDistinctCachedPrice && cachedInputTokens.value === null) return null;
  const cachedTokens = cachedInputTokens.value ?? 0;
  const uncachedTokens = Math.max(0, inputTokens.value - cachedTokens);
  return Math.round(
    (uncachedTokens * pricing.inputMicrosPerMillion +
      cachedTokens *
        (pricing.cachedInputMicrosPerMillion ?? pricing.inputMicrosPerMillion) +
      outputTokens.value * pricing.outputMicrosPerMillion) /
      1_000_000,
  );
}

function assertAccounting(accounting) {
  assert.equal(accounting?.schemaVersion, 1, "usage schema must be v1");
  assert.equal(
    accounting?.localContextBytes?.source,
    "LOCAL_CONTEXT_BYTES",
    "local byte accounting is required and must remain byte-only",
  );
  assert.equal(
    isCount(accounting.localContextBytes.serializedRequestBytes),
    true,
  );
  assert.equal(isCount(accounting.localContextBytes.sourceInputBytes), true);
  if (accounting.providerReportedUsage) {
    assert.equal(
      accounting.providerReportedUsage.source,
      "PROVIDER_REPORTED_USAGE",
    );
  }
  if (accounting.providerCountTokens) {
    assert.equal(
      accounting.providerCountTokens.source,
      "PROVIDER_COUNT_TOKENS",
    );
  }
  if (accounting.estimatedUsage) {
    assert.equal(accounting.estimatedUsage.source, "ESTIMATED_USAGE");
  }
  assert.equal(accounting.unknownUsage?.source, "UNKNOWN_USAGE");
}

function assertRowBindings(row, manifest) {
  assert.equal(row.benchmarkCorpusVersion, manifest.version);
  assert.equal(row.evidenceClass, MODEL_QUALITY_PROVIDER_BENCHMARK);
  assert.equal(typeof row.provider, "string");
  assert.equal(typeof row.model, "string");
  assert.equal(ATTEMPT_REASON_PATTERN.test(row.attemptReason), true);
  assertSha256(row.parsingContractSha256, "parsing contract");
  assertSha256(row.taxonomySnapshotSha256, "taxonomy snapshot");
  assertSha256(row.candidateSubsetSha256, "candidate subset");
  assert.equal(
    row.parsingContractSha256,
    manifest.runtimeBindings.parsingContractSha256,
  );
  assert.equal(
    row.taxonomySnapshotSha256,
    manifest.runtimeBindings.taxonomySnapshotSha256,
  );
  assert.equal(
    manifest.sources.some((source) => source.sourceId === row.sourceId),
    true,
  );
}

function attemptObservation(row, manifest, pricing) {
  assertRowBindings(row, manifest);
  assertAccounting(row.usageAccounting);
  assert.equal(isCount(row.jobOrdinal) && row.jobOrdinal > 0, true);
  assert.equal(isCount(row.attemptOrdinal) && row.attemptOrdinal > 0, true);
  assert.equal(isCount(row.durationMs), true);
  const inputTokens = selectInputTokens(row.usageAccounting);
  const countTokensInput = selectCountTokensInput(row.usageAccounting);
  const cachedInputTokens = selectProviderToken(
    row.usageAccounting,
    "cachedInputTokens",
  );
  const candidateOutputTokens = selectProviderToken(
    row.usageAccounting,
    "candidateOutputTokens",
  );
  const thinkingTokens = selectProviderToken(
    row.usageAccounting,
    "thoughtTokens",
  );
  const billedOutputTokens = selectProviderToken(
    row.usageAccounting,
    "outputTokens",
  );
  const totalTokens = selectProviderToken(
    row.usageAccounting,
    "totalTokens",
  );
  const toolUseInputTokens = selectProviderToken(
    row.usageAccounting,
    "toolUseInputTokens",
  );

  return {
    attemptOrdinal: row.attemptOrdinal,
    attemptReason: row.attemptReason,
    benchmarkCorpusVersion: row.benchmarkCorpusVersion,
    cachedInputTokens,
    candidateOutputTokens,
    candidateSubsetSha256: row.candidateSubsetSha256,
    durationMs: row.durationMs,
    evidenceClass: row.evidenceClass,
    inputTokens,
    countTokensInput,
    jobOrdinal: row.jobOrdinal,
    model: row.model,
    parsingContractSha256: row.parsingContractSha256,
    provider: row.provider,
    sourceId: row.sourceId,
    taxonomySnapshotSha256: row.taxonomySnapshotSha256,
    thinkingTokens,
    toolUseInputTokens,
    totalTokens,
    outputTokens: billedOutputTokens,
    usageDerivedCostMicros: costMicros({
      cachedInputTokens,
      inputTokens,
      outputTokens: billedOutputTokens,
      pricing,
    }),
  };
}

export function buildProviderUsageBaselineReport({
  manifest,
  observations,
  pricing,
}) {
  assert.equal(manifest.version, "AI_PARSING_PROVIDER_BENCHMARK_V1");
  assert.equal(manifest.evidenceClass, MODEL_QUALITY_PROVIDER_BENCHMARK);
  assert.equal(observations.benchmarkCorpusVersion, manifest.version);
  assert.equal(observations.evidenceClass, MODEL_QUALITY_PROVIDER_BENCHMARK);
  assert.equal(
    pricing.cachedInputMicrosPerMillion == null ||
      pricing.cachedInputMicrosPerMillion >= 0,
    true,
  );
  assert.equal(pricing.inputMicrosPerMillion >= 0, true);
  assert.equal(pricing.outputMicrosPerMillion >= 0, true);

  if (observations.status !== "COMPLETE") {
    assert.deepEqual(observations.rows, []);
    assert.deepEqual(observations.jobs, []);
    return {
      benchmarkCorpusVersion: manifest.version,
      benchmarkManifestSha256: canonicalFingerprint(manifest),
      classification: "GEMINI_BASELINE_PROVIDER_OBSERVATIONS_NOT_RUN",
      evidenceClass: MODEL_QUALITY_PROVIDER_BENCHMARK,
      operationalEvidenceClass: OPERATIONAL_PDF50_EVIDENCE,
      remainingGap:
        "A separately authorized bounded Gemini run over the fixed benchmark sources is required; no Provider call was made by this report.",
      rows: [],
      status: observations.status,
    };
  }

  assert.equal(Array.isArray(observations.rows), true);
  assert.equal(Array.isArray(observations.jobs), true);
  const rows = observations.rows.map((row) =>
    attemptObservation(row, manifest, pricing),
  );
  const sourceIds = new Set(rows.map((row) => row.sourceId));
  assert.deepEqual(
    [...sourceIds].sort(),
    manifest.sources.map((source) => source.sourceId).sort(),
    "complete baseline must cover every fixed source",
  );
  const jobsByOrdinal = new Map(
    observations.jobs.map((job) => [job.jobOrdinal, job]),
  );
  assert.equal(jobsByOrdinal.size, observations.jobs.length);
  const jobTotals = [];

  for (const job of observations.jobs) {
    assert.equal(isCount(job.jobOrdinal) && job.jobOrdinal > 0, true);
    assert.equal(typeof job.completed === "boolean", true);
    assert.equal(isCount(job.validReviewDrafts), true);
    const attempts = rows.filter((row) => row.jobOrdinal === job.jobOrdinal);
    assert.equal(attempts.length > 0, true);
    const totalTokens = strictSum(
      attempts.map((attempt) => attempt.totalTokens.value),
    );
    const usageDerivedCostMicros = strictSum(
      attempts.map((attempt) => attempt.usageDerivedCostMicros),
    );
    jobTotals.push({
      completed: job.completed,
      jobOrdinal: job.jobOrdinal,
      totalTokens,
      usageDerivedCostMicros,
      validReviewDrafts: job.validReviewDrafts,
    });
  }

  assert.equal(
    rows.every((row) => jobsByOrdinal.has(row.jobOrdinal)),
    true,
  );
  const completedJobs = jobTotals.filter((job) => job.completed);
  const validReviewDrafts = jobTotals.reduce(
    (total, job) => total + job.validReviewDrafts,
    0,
  );
  const totalTokens = strictSum(rows.map((row) => row.totalTokens.value));
  const totalUsageDerivedCostMicros = strictSum(
    rows.map((row) => row.usageDerivedCostMicros),
  );
  const availableInputTokens = rows
    .map((row) => row.inputTokens.value)
    .filter((value) => typeof value === "number");
  const availableTotalTokens = rows
    .map((row) => row.totalTokens.value)
    .filter((value) => typeof value === "number");
  const latencies = rows.map((row) => row.durationMs);
  const availableOutputTokens = rows
    .map((row) => row.outputTokens.value)
    .filter((value) => typeof value === "number");
  const availableThinkingTokens = rows
    .map((row) => row.thinkingTokens.value)
    .filter((value) => typeof value === "number");
  const totalInputTokens = strictSum(rows.map((row) => row.inputTokens.value));
  const totalOutputTokens = strictSum(rows.map((row) => row.outputTokens.value));
  const totalThinkingTokens = strictSum(
    rows.map((row) => row.thinkingTokens.value),
  );
  const countTokenComparisons = rows
    .filter(
      (row) =>
        typeof row.countTokensInput.value === "number" &&
        typeof row.inputTokens.value === "number",
    )
    .map((row) => ({
      absoluteDelta: Math.abs(
        row.inputTokens.value - row.countTokensInput.value,
      ),
      countTokensInput: row.countTokensInput.value,
      providerReportedInput: row.inputTokens.value,
    }));
  const providerHttpRequestCount = numeric(
    observations.run?.globalProviderCounters?.networkRequests,
  );
  const providerCountTokensRequestCount = numeric(
    observations.run?.globalProviderCounters?.tokenCountRequests,
  );

  return {
    aggregate: {
      attemptsPerValidReviewDraft: safeRatio(rows.length, validReviewDrafts),
      providerCountTokensRequestCount,
      providerHttpRequestCount,
      providerInferenceRequestCount: rows.length,
      providerInferenceRequestsPerValidReviewDraft: safeRatio(
        rows.length,
        validReviewDrafts,
      ),
      providerRequestsPerValidReviewDraft: safeRatio(
        providerHttpRequestCount,
        validReviewDrafts,
      ),
      completedJobs: completedJobs.length,
      countTokensComparisonCoverage: `${countTokenComparisons.length}/${rows.length}`,
      countTokensInputAbsoluteDeltaTotal: countTokenComparisons.length
        ? countTokenComparisons.reduce(
            (total, comparison) => total + comparison.absoluteDelta,
            0,
          )
        : null,
      inputTokenCoverage: `${availableInputTokens.length}/${rows.length}`,
      p50InputTokens: percentile(availableInputTokens, 0.5),
      p50LatencyMs: percentile(latencies, 0.5),
      p50OutputTokens: percentile(availableOutputTokens, 0.5),
      p50ThinkingTokens: percentile(availableThinkingTokens, 0.5),
      p50TotalTokens: percentile(availableTotalTokens, 0.5),
      p95InputTokens: percentile(availableInputTokens, 0.95),
      p95LatencyMs: percentile(latencies, 0.95),
      p95OutputTokens: percentile(availableOutputTokens, 0.95),
      p95ThinkingTokens: percentile(availableThinkingTokens, 0.95),
      p95TotalTokens: percentile(availableTotalTokens, 0.95),
      inputTokensPerValidReviewDraft: safeRatio(
        totalInputTokens,
        validReviewDrafts,
      ),
      outputTokensPerValidReviewDraft: safeRatio(
        totalOutputTokens,
        validReviewDrafts,
      ),
      thinkingTokensPerValidReviewDraft: safeRatio(
        totalThinkingTokens,
        validReviewDrafts,
      ),
      outputTokenCoverage: `${availableOutputTokens.length}/${rows.length}`,
      thinkingTokenCoverage: `${availableThinkingTokens.length}/${rows.length}`,
      totalTokenCoverage: `${availableTotalTokens.length}/${rows.length}`,
      totalTokensPerCompletedJob: safeRatio(
        totalTokens,
        completedJobs.length,
      ),
      totalTokensPerValidReviewDraft: safeRatio(
        totalTokens,
        validReviewDrafts,
      ),
      usageDerivedCostMicrosPerValidReviewDraft: safeRatio(
        totalUsageDerivedCostMicros,
        validReviewDrafts,
      ),
      validReviewDrafts,
    },
    benchmarkCorpusVersion: manifest.version,
    benchmarkManifestSha256: canonicalFingerprint(manifest),
    classification: "GEMINI_AI_PARSING_BASELINE_V1_COMPLETE",
    evidenceClass: MODEL_QUALITY_PROVIDER_BENCHMARK,
    jobTotals,
    operationalEvidenceClass: OPERATIONAL_PDF50_EVIDENCE,
    rows,
    status: observations.status,
  };
}
