import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MODEL_QUALITY_PROVIDER_BENCHMARK,
  OPERATIONAL_PDF50_EVIDENCE,
  buildProviderUsageBaselineReport,
  estimateProviderAttemptCostUpperBoundMicros,
} from "./lib/provider-usage-baseline.mjs";
import {
  AI_PARSING_PROVIDER_BENCHMARK_V1_SOURCE_IDS,
  buildAIParsingProviderBenchmarkV1Source,
  fingerprintAIParsingProviderBenchmarkV1Source,
} from "./provider-benchmark-v1-sources.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const benchmarkRoot = resolve(
  root,
  "fixtures",
  "ai-parsing-provider-benchmark-v1",
);
const goldenRoot = resolve(root, "fixtures", "ai-parsing-golden");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const expectedCapabilities = [
  "answer-key",
  "equation",
  "free-response",
  "insufficient-evidence",
  "missing-visual",
  "multi-part",
  "table",
  "taxonomy-ambiguous",
  "text",
  "visual",
];

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function canonicalSha256(path) {
  const text = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  return createHash("sha256").update(text).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateManifest(candidate, goldenRefs) {
  assert.equal(candidate.version, "AI_PARSING_PROVIDER_BENCHMARK_V1");
  assert.equal(candidate.manifestVersion, 2);
  assert.equal(candidate.evidenceClass, MODEL_QUALITY_PROVIDER_BENCHMARK);
  assert.equal(candidate.productionTuningProhibited, true);
  assert.equal(candidate.sourceCorrection.providerRunsBeforeCorrection, 0);
  assert.equal(
    candidate.treatmentVersion,
    "AI_PARSING_PROVIDER_BENCHMARK_V1_SOURCE_EXACT_V2",
  );
  assert.match(candidate.evaluationContract.sha256, SHA256_PATTERN);
  assert.match(
    candidate.evaluationContract.implementationSha256NormalizedLf,
    SHA256_PATTERN,
  );
  assert.equal(candidate.sources.length > 0, true);
  assert.equal(
    new Set(candidate.sources.map((source) => source.sourceId)).size,
    candidate.sources.length,
    "benchmark source IDs must be unique",
  );
  assert.deepEqual(
    candidate.sources.map((source) => source.sourceId).sort(),
    [...AI_PARSING_PROVIDER_BENCHMARK_V1_SOURCE_IDS],
  );
  assert.deepEqual(
    [...new Set(candidate.sources.flatMap((source) => source.capabilities))].sort(),
    expectedCapabilities,
  );
  assert.deepEqual([...candidate.requiredCapabilities].sort(), expectedCapabilities);
  assert.match(candidate.runtimeBindings.parsingContractSha256, SHA256_PATTERN);
  assert.match(candidate.runtimeBindings.taxonomySnapshotSha256, SHA256_PATTERN);
  assert.equal(
    candidate.runtimeBindings.candidateSubsetSha256,
    "RECORD_PER_ATTEMPT_AT_RUN",
  );

  for (const source of candidate.sources) {
    assert.match(source.sha256, SHA256_PATTERN);
    assert.equal(Number.isSafeInteger(source.byteLength), true);
    assert.equal(source.byteLength > 0, true);
    assert.equal(Number.isSafeInteger(source.pageCount), true);
    assert.equal(source.pageCount > 0, true);
    assert.equal(source.capabilities.length > 0, true);
    assert.equal(source.goldenRefs.length > 0, true);
    for (const ref of source.goldenRefs) {
      assert.equal(goldenRefs.has(ref), true, `unknown Golden reference: ${ref}`);
    }
  }
}

function usageAccounting(index, { reported = true } = {}) {
  const inputTokens = 100 + index * 10;
  const candidateOutputTokens = 20 + index;
  const thoughtTokens = 2;
  const outputTokens = candidateOutputTokens + thoughtTokens;
  return {
    schemaVersion: 1,
    providerReportedUsage: reported
      ? {
          source: "PROVIDER_REPORTED_USAGE",
          usage: {
            cachedInputTokens: 0,
            candidateOutputTokens,
            inputTokens,
            outputTokens,
            promptTokensDetails: [{ modality: "TEXT", tokenCount: inputTokens }],
            thoughtTokens,
            toolUseInputTokens: 0,
            totalTokens: inputTokens + outputTokens,
          },
        }
      : null,
    providerCountTokens: reported
      ? null
      : {
          inputTokens: 900 + index,
          promptTokensDetails: [{ modality: "TEXT", tokenCount: 900 + index }],
          source: "PROVIDER_COUNT_TOKENS",
        },
    localContextBytes: {
      serializedRequestBytes: 50_000 + index,
      source: "LOCAL_CONTEXT_BYTES",
      sourceInputBytes: 40_000 + index,
    },
    estimatedUsage: null,
    unknownUsage: {
      fields: reported
        ? []
        : [
            "providerReportedInputTokens",
            "candidateOutputTokens",
            "thoughtTokens",
            "totalTokens",
          ],
      source: "UNKNOWN_USAGE",
    },
  };
}

function completeObservations(manifest) {
  return {
    benchmarkCorpusVersion: manifest.version,
    evidenceClass: MODEL_QUALITY_PROVIDER_BENCHMARK,
    status: "COMPLETE",
    provider: "gemini_native",
    model: "gemini-2.5-flash-lite",
    run: {
      globalProviderCounters: {
        networkRequests: 12,
        tokenCountRequests: 6,
      },
    },
    rows: manifest.sources.map((source, index) => ({
      attemptOrdinal: 1,
      attemptReason: "FIRST_ATTEMPT",
      benchmarkCorpusVersion: manifest.version,
      candidateSubsetSha256: createHash("sha256")
        .update(`candidate:${source.sourceId}`)
        .digest("hex"),
      durationMs: (index + 1) * 10,
      evidenceClass: MODEL_QUALITY_PROVIDER_BENCHMARK,
      jobOrdinal: index + 1,
      model: "gemini-2.5-flash-lite",
      parsingContractSha256: manifest.runtimeBindings.parsingContractSha256,
      provider: "gemini_native",
      sourceId: source.sourceId,
      taxonomySnapshotSha256: manifest.runtimeBindings.taxonomySnapshotSha256,
      usageAccounting: usageAccounting(index),
    })),
    jobs: manifest.sources.map((_, index) => ({
      completed: true,
      jobOrdinal: index + 1,
      validReviewDrafts: 1,
    })),
  };
}

const manifest = await loadJson(resolve(benchmarkRoot, "manifest.json"));
const evaluationContract = await loadJson(
  resolve(benchmarkRoot, "evaluation-contract.json"),
);
const observations = await loadJson(
  resolve(benchmarkRoot, "gemini-observations.json"),
);
const parsingCases = await loadJson(resolve(goldenRoot, "parsing-cases.json"));
const taxonomyCases = await loadJson(resolve(goldenRoot, "taxonomy-cases.json"));
const visualCases = await loadJson(resolve(goldenRoot, "visual-cases.json"));
const goldenRefs = new Set([
  ...parsingCases.map((entry) => `parsing/${entry.id}`),
  ...taxonomyCases.cases.map((entry) => `taxonomy/${entry.id}`),
  ...visualCases.map((entry) => `visual/${entry.id}`),
]);

validateManifest(manifest, goldenRefs);
assert.equal(
  manifest.evaluationContract.sha256,
  createHash("sha256")
    .update(JSON.stringify(evaluationContract))
    .digest("hex"),
);
assert.equal(evaluationContract.frozenBeforeProviderObservation, true);
assert.equal(
  manifest.evaluationContract.implementationSha256NormalizedLf,
  await canonicalSha256(resolve(root, manifest.evaluationContract.implementationPath)),
);
assert.equal(
  manifest.goldenCorpus.manifestSha256,
  await canonicalSha256(resolve(goldenRoot, "manifest.json")),
);
assert.equal(
  manifest.goldenCorpus.parsingCasesSha256,
  await canonicalSha256(resolve(goldenRoot, "parsing-cases.json")),
);
assert.equal(
  manifest.goldenCorpus.taxonomyCasesSha256,
  await canonicalSha256(resolve(goldenRoot, "taxonomy-cases.json")),
);
assert.equal(
  manifest.goldenCorpus.visualCasesSha256,
  await canonicalSha256(resolve(goldenRoot, "visual-cases.json")),
);

for (const source of manifest.sources) {
  const fingerprint = fingerprintAIParsingProviderBenchmarkV1Source(
    source.sourceId,
  );
  assert.equal(fingerprint.byteLength, source.byteLength);
  assert.equal(fingerprint.sha256, source.sha256);
  assert.equal(
    buildAIParsingProviderBenchmarkV1Source(source.sourceId)
      .subarray(0, 5)
      .toString("ascii"),
    "%PDF-",
  );
}

const pricing = {
  cachedInputMicrosPerMillion: 10_000,
  inputMicrosPerMillion: 100_000,
  outputMicrosPerMillion: 400_000,
};
const complete = completeObservations(manifest);
const report = buildProviderUsageBaselineReport({
  manifest,
  observations: complete,
  pricing,
});
assert.equal(report.classification, "GEMINI_AI_PARSING_BASELINE_V1_COMPLETE");
assert.equal(report.evidenceClass, MODEL_QUALITY_PROVIDER_BENCHMARK);
assert.equal(report.operationalEvidenceClass, OPERATIONAL_PDF50_EVIDENCE);
assert.equal(report.aggregate.attemptsPerValidReviewDraft, 1);
assert.equal(report.aggregate.providerInferenceRequestCount, 6);
assert.equal(report.aggregate.providerCountTokensRequestCount, 6);
assert.equal(report.aggregate.providerHttpRequestCount, 12);
assert.equal(report.aggregate.providerRequestsPerValidReviewDraft, 2);
assert.equal(report.aggregate.totalTokensPerCompletedJob, 149.5);
assert.equal(report.aggregate.totalTokensPerValidReviewDraft, 149.5);
assert.equal(report.aggregate.p50InputTokens, 120);
assert.equal(report.aggregate.p95InputTokens, 150);
assert.equal(report.aggregate.p50TotalTokens, 144);
assert.equal(report.aggregate.p95TotalTokens, 177);
assert.equal(report.aggregate.p50OutputTokens, 24);
assert.equal(report.aggregate.p95OutputTokens, 27);
assert.equal(report.aggregate.p50ThinkingTokens, 2);
assert.equal(report.aggregate.p95ThinkingTokens, 2);
assert.equal(report.aggregate.p50LatencyMs, 30);
assert.equal(report.aggregate.p95LatencyMs, 60);
assert.deepEqual(report.aggregate.usageDerivedCostBasisHistogram, {
  USAGE_DERIVED_ESTIMATE: 6,
});
assert.equal(report.rows[0].inputTokens.source, "PROVIDER_REPORTED_USAGE");
assert.equal(report.rows[0].inputTokens.value, 100);
assert.equal(report.rows[0].countTokensInput.value, null);
assert.equal(report.rows[0].cachedInputTokens.value, 0);
assert.equal(report.rows[0].toolUseInputTokens.value, 0);
assert.notEqual(
  report.rows[0].inputTokens.value,
  complete.rows[0].usageAccounting.localContextBytes.serializedRequestBytes,
  "local bytes must never become token usage",
);

const missingCachedUsage = clone(complete);
delete missingCachedUsage.rows[0].usageAccounting.providerReportedUsage.usage
  .cachedInputTokens;
missingCachedUsage.rows[0].usageAccounting.unknownUsage.fields.push(
  "cachedInputTokens",
);
const missingCachedReport = buildProviderUsageBaselineReport({
  manifest,
  observations: missingCachedUsage,
  pricing,
});
assert.equal(missingCachedReport.rows[0].cachedInputTokens.value, null);
assert.equal(
  missingCachedReport.rows[0].cachedInputTokens.source,
  "UNKNOWN_USAGE",
);
assert.equal(
  missingCachedReport.rows[0].usageDerivedCostBasis,
  "UNCACHED_INPUT_UPPER_BOUND",
);
assert.equal(missingCachedReport.rows[0].usageDerivedCostMicros, 19);
assert.deepEqual(
  estimateProviderAttemptCostUpperBoundMicros({
    maxOutputTokens: 4_096,
    pricing,
    usageAccounting: missingCachedUsage.rows[0].usageAccounting,
  }),
  {
    basis: "UNCACHED_INPUT_UPPER_BOUND",
    valueMicros: 19,
  },
);

const partialUsage = clone(complete);
partialUsage.rows[0].usageAccounting = usageAccounting(0, { reported: false });
const partialReport = buildProviderUsageBaselineReport({
  manifest,
  observations: partialUsage,
  pricing,
});
assert.equal(partialReport.rows[0].inputTokens.source, "PROVIDER_COUNT_TOKENS");
assert.equal(partialReport.rows[0].inputTokens.value, 900);
assert.equal(partialReport.rows[0].countTokensInput.value, 900);
assert.equal(partialReport.rows[0].candidateOutputTokens.value, null);
assert.equal(partialReport.rows[0].thinkingTokens.value, null);
assert.equal(partialReport.rows[0].cachedInputTokens.value, null);
assert.equal(partialReport.rows[0].toolUseInputTokens.value, null);
assert.equal(partialReport.rows[0].totalTokens.value, null);
assert.equal(partialReport.rows[0].usageDerivedCostMicros, null);
assert.equal(partialReport.aggregate.totalTokensPerCompletedJob, null);
assert.equal(partialReport.aggregate.usageDerivedCostMicrosPerValidReviewDraft, null);

const frozenReport = buildProviderUsageBaselineReport({
  manifest,
  observations,
  pricing,
});
assert.equal(
  frozenReport.classification,
  "GEMINI_AI_PARSING_BASELINE_V1_COMPLETE",
);
assert.equal(frozenReport.aggregate.completedJobs, 6);
assert.equal(frozenReport.aggregate.validReviewDrafts, 8);
assert.equal(frozenReport.aggregate.countTokensComparisonCoverage, "6/6");
assert.equal(frozenReport.aggregate.countTokensInputAbsoluteDeltaTotal, 0);
assert.deepEqual(frozenReport.aggregate.usageDerivedCostBasisHistogram, {
  UNCACHED_INPUT_UPPER_BOUND: 6,
});

const notRunObservations = clone(observations);
notRunObservations.status = "NOT_RUN";
notRunObservations.rows = [];
notRunObservations.jobs = [];
const notRunReport = buildProviderUsageBaselineReport({
  manifest,
  observations: notRunObservations,
  pricing,
});
assert.equal(
  notRunReport.classification,
  "GEMINI_BASELINE_PROVIDER_OBSERVATIONS_NOT_RUN",
);
assert.deepEqual(notRunReport.rows, []);

const wrongSourceHash = clone(manifest);
wrongSourceHash.sources[0].sha256 = "0".repeat(64);
assert.throws(() => {
  validateManifest(wrongSourceHash, goldenRefs);
  assert.equal(
    fingerprintAIParsingProviderBenchmarkV1Source(
      wrongSourceHash.sources[0].sourceId,
    ).sha256,
    wrongSourceHash.sources[0].sha256,
  );
});

const missingCapability = clone(manifest);
missingCapability.requiredCapabilities.pop();
assert.throws(() => validateManifest(missingCapability, goldenRefs));

const duplicateSource = clone(manifest);
duplicateSource.sources.push(clone(duplicateSource.sources[0]));
assert.throws(() => validateManifest(duplicateSource, goldenRefs));

const wrongVersion = clone(complete);
wrongVersion.benchmarkCorpusVersion = "AI_PARSING_PROVIDER_BENCHMARK_V2";
assert.throws(() =>
  buildProviderUsageBaselineReport({ manifest, observations: wrongVersion, pricing }),
);

const wrongBinding = clone(complete);
wrongBinding.rows[0].taxonomySnapshotSha256 = "f".repeat(64);
assert.throws(() =>
  buildProviderUsageBaselineReport({ manifest, observations: wrongBinding, pricing }),
);

const invalidCandidateFingerprint = clone(complete);
invalidCandidateFingerprint.rows[0].candidateSubsetSha256 = "not-a-sha";
assert.throws(() =>
  buildProviderUsageBaselineReport({
    manifest,
    observations: invalidCandidateFingerprint,
    pricing,
  }),
);

const missingSource = clone(complete);
missingSource.rows.pop();
missingSource.jobs.pop();
assert.throws(() =>
  buildProviderUsageBaselineReport({ manifest, observations: missingSource, pricing }),
);

assert.equal(JSON.stringify(report).includes("source text"), false);
assert.equal(JSON.stringify(report).includes("apiKey"), false);
assert.equal(JSON.stringify(report).includes("filename"), false);

console.log("AI_PARSING_PROVIDER_BENCHMARK_V1=PASS");
console.log("BENCHMARK_IMMUTABLE_SOURCE_FINGERPRINTS=PASS");
console.log("PROVIDER_USAGE_BASELINE_MUTATIONS=PASS");
console.log("MODEL_QUALITY_AND_OPERATIONAL_EVIDENCE_SEPARATION=PASS");
console.log("PROVIDER_CALLS=0");
