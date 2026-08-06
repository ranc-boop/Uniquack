import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(
  root,
  "docs/architecture/ai-parsing-contract-fingerprints.json",
);

const fingerprintedPaths = [
  "fixtures/ai-parsing-golden/manifest.json",
  "fixtures/ai-parsing-golden/taxonomy-cases.json",
  "scripts/ai-parsing-eval/evaluate-golden.mjs",
  "scripts/ai-parsing-eval/hosted-taxonomy-readonly-parity-safety-smoke.mjs",
  "scripts/ai-parsing-eval/hosted-taxonomy-readonly-parity.mjs",
  "scripts/ai-parsing-eval/lib/golden-evaluator.mjs",
  "scripts/ai-parsing-eval/lib/taxonomy-golden-fixture.mjs",
  "scripts/ai-parsing-eval/lib/taxonomy-source-inventory.mjs",
  "scripts/ai-parsing-eval/mutation-proof.mjs",
  "scripts/ai-parsing-eval/runtime-contract-smoke.mjs",
  "scripts/ai-parsing-eval/synthetic-visual-pdf.mjs",
  "scripts/ai-parsing-eval/taxonomy-context-efficiency.mjs",
  "scripts/ai-parsing-eval/taxonomy-provenance-audit.mjs",
  "scripts/ai-parsing-eval/verify-contract-fingerprint.mjs",
  "scripts/ai-parsing-eval/visual-evidence-live-contract.mjs",
  "scripts/ai-parsing-visual-evidence-live-e2e-safety-smoke.mjs",
  "scripts/ai-parsing-visual-evidence-live-e2e.mjs",
  "scripts/ai-parsing-quality-foundation-smoke.mjs",
  "scripts/ai-provider-resilience-smoke.mjs",
  "scripts/gemini-live-resume-preflight-safety-smoke.mjs",
  "scripts/gemini-live-resume-preflight.mjs",
  "scripts/lib/pdf50-scale-provider-proof-control.mjs",
  "scripts/lib/pdf50-scale-qualification-control.json",
  "scripts/lib/pdf50-scale-qualification-control.mjs",
  "scripts/pdf50-end-to-end-live-e2e-safety-smoke.mjs",
  "scripts/pdf50-end-to-end-live-e2e.mjs",
  "scripts/pdf50-post-persistence-diagnostic-smoke.mjs",
  "scripts/pdf50-provider-lifecycle-budget-runtime-smoke.mjs",
  "scripts/pdf50-scale-qualification-live-e2e-safety-smoke.mjs",
  "scripts/pdf50-scale-qualification-live-e2e.mjs",
  "scripts/run-ai-parsing-taxonomy-readonly-parity.ps1",
  "scripts/run-ai-parsing-visual-evidence-live-e2e.ps1",
  "scripts/run-gemini-live-resume-preflight.ps1",
  "scripts/run-pdf50-scale-qualification-live-e2e.ps1",
  "src/app/api/internal/ai-jobs/run/route.ts",
  "src/lib/ai-jobs/checkpoint.ts",
  "src/lib/batch-import/fenced-persistence.ts",
  "src/lib/batch-import/service.ts",
  "src/lib/ai-pdf-import/post-persistence.ts",
  "src/lib/ai-pdf-import/service.ts",
  "src/lib/ai-pdf-import/schema.ts",
  "src/lib/ai-pdf-import/pdf.ts",
  "src/lib/ai-pdf-import/preanalysis-core.ts",
  "src/lib/ai-pdf-import/question-boundary-guard.ts",
  "src/lib/ai-pdf-import/taxonomy-persistence.ts",
  "src/lib/ai-pdf-import/tagging-v2.ts",
  "src/lib/ai-pdf-import/quality-observatory.ts",
  "src/lib/ai-pdf-import/visual-evidence.ts",
  "src/lib/ai-providers/ai-pdf-attempt-state.ts",
  "src/lib/ai-providers/chat.ts",
  "src/lib/ai-providers/errors.ts",
  "src/lib/ai-providers/gemini-ai-pdf-extraction.schema.json",
  "src/lib/ai-providers/gemini-native.ts",
  "src/lib/ai-jobs/pdf50-scale-provider-proof-control.json",
  "src/lib/ai-jobs/provider-test-control.ts",
  "src/lib/questions/review-publish-validation.ts",
  "src/lib/ai-jobs/worker.ts",
  "src/lib/tags/taxonomy-db.ts",
  "src/lib/tags/runtime-taxonomy-snapshot.ts",
  "supabase/clean-seeds/0002_local_taxonomy_seed.sql",
  "supabase/clean-migrations/0056_add_math_taxonomy_v2_catalog.sql",
];

function git(args, encoding) {
  return execFileSync("git", args, {
    cwd: root,
    encoding,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function resolveCommit(value) {
  return git(["rev-parse", `${value}^{commit}`], "utf8").trim();
}

function isAncestor(ancestor, descendant) {
  try {
    git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function anchorRecord(anchor, path) {
  let blob;
  try {
    blob = git(["rev-parse", `${anchor}:${path}`], "utf8").trim();
  } catch {
    return null;
  }

  const bytes = git(["cat-file", "blob", blob]);
  return {
    blob,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function canonicalWorkingTreeSha(path) {
  const bytes = readFileSync(resolve(root, path));
  const canonical = Buffer.from(
    bytes.toString("utf8").replace(/\r\n/g, "\n"),
    "utf8",
  );
  return createHash("sha256").update(canonical).digest("hex");
}

if (process.argv[2] === "--emit") {
  const baseline = resolveCommit(process.argv[3]);
  const treatment = resolveCommit(process.argv[4]);
  assert.equal(
    isAncestor(baseline, treatment),
    true,
    "Baseline must be an ancestor of treatment.",
  );

  console.log(
    JSON.stringify(
      {
        baselineAnchor: baseline,
        contractVersion: "ai-pdf-parsing/provider-neutral-v5",
        files: fingerprintedPaths.map((path) => ({
          baseline: anchorRecord(baseline, path),
          path,
          treatment: anchorRecord(treatment, path),
        })),
        schemaVersion: 1,
        treatmentAnchor: treatment,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const baseline = resolveCommit(manifest.baselineAnchor);
const treatment = resolveCommit(manifest.treatmentAnchor);
const head = resolveCommit("HEAD");

assert.equal(manifest.schemaVersion, 1);
assert.equal(
  manifest.contractVersion,
  "ai-pdf-parsing/provider-neutral-v5",
);
assert.equal(baseline, manifest.baselineAnchor);
assert.equal(treatment, manifest.treatmentAnchor);
assert.equal(isAncestor(baseline, treatment), true);
assert.equal(isAncestor(treatment, head), true);
assert.deepEqual(
  manifest.files.map((entry) => entry.path),
  fingerprintedPaths,
);
assert.equal(new Set(fingerprintedPaths).size, fingerprintedPaths.length);

for (const entry of manifest.files) {
  const baselineRecord = anchorRecord(baseline, entry.path);
  const treatmentRecord = anchorRecord(treatment, entry.path);

  assert.deepEqual(baselineRecord, entry.baseline, `${entry.path}: baseline drift`);
  assert.deepEqual(
    treatmentRecord,
    entry.treatment,
    `${entry.path}: treatment drift`,
  );
  assert.ok(treatmentRecord, `${entry.path}: treatment file is absent`);
  assert.equal(existsSync(resolve(root, entry.path)), true);
  assert.equal(
    canonicalWorkingTreeSha(entry.path),
    treatmentRecord.sha256,
    `${entry.path}: current bytes differ from treatment anchor`,
  );
}

console.log("AI_PARSING_CONTRACT_FINGERPRINT=PASS");
console.log(`BASELINE_ANCHOR=${baseline}`);
console.log(`TREATMENT_ANCHOR=${treatment}`);
console.log(`FINGERPRINTED_FILES=${manifest.files.length}`);
