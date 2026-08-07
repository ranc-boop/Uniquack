import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProviderUsageBaselineReport } from "./lib/provider-usage-baseline.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(
  root,
  "fixtures",
  "ai-parsing-provider-benchmark-v1",
);

async function load(name) {
  return JSON.parse(await readFile(resolve(fixtureRoot, name), "utf8"));
}

const [manifest, observations] = await Promise.all([
  load("manifest.json"),
  load("gemini-observations.json"),
]);
const report = buildProviderUsageBaselineReport({
  manifest,
  observations,
  pricing: {
    cachedInputMicrosPerMillion: 10_000,
    inputMicrosPerMillion: 100_000,
    outputMicrosPerMillion: 400_000,
  },
});

console.log(`EVIDENCE_CLASS=${report.evidenceClass}`);
console.log(`OPERATIONAL_EVIDENCE_CLASS=${report.operationalEvidenceClass}`);
console.log(`BENCHMARK_CORPUS_VERSION=${report.benchmarkCorpusVersion}`);
console.log(`BENCHMARK_MANIFEST_SHA256=${report.benchmarkManifestSha256}`);
console.log(`BASELINE_STATUS=${report.status}`);
console.log(`BASELINE_CLASSIFICATION=${report.classification}`);
if (report.remainingGap) {
  console.log(`REMAINING_BASELINE_GAP=${report.remainingGap}`);
}
console.log("PROVIDER_CALLS=0");
