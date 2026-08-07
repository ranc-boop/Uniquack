import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runner = await readFile(
  resolve(root, "scripts", "ai-parsing-eval", "run-gemini-baseline-v1.mjs"),
  "utf8",
);
const launcher = await readFile(
  resolve(root, "scripts", "run-gemini-ai-parsing-baseline-v1.ps1"),
  "utf8",
);

assert(runner.includes('const approvedBudgetUsd = 0.5'));
assert(runner.includes('const maxWholeBenchmarkRuns = 3'));
assert(runner.includes('const maxInferenceRequests = 12'));
assert(runner.includes('const maxOutputTokensPerInference = 4_096'));
assert(runner.includes('const maxSourceConservativeExposureMicros ='));
assert(runner.includes('priorInvalidRunConservativeExposureMicros'));
assert(runner.includes('cumulativeCredibleSpendUpperBoundMicros'));
assert(runner.includes('countTokensMode: "required"'));
assert(runner.includes('providerRetryMaxAttempts: 1'));
assert(runner.includes("callAIPdfExtractionProvider"));
assert(runner.includes("buildAIPdfProviderBenchmarkContract"));
assert(runner.includes("createAIPdfQualityObservatory"));
assert(runner.includes("completed_baseline_overwrite_refused"));
assert(runner.includes("atomicWriteJson"));
assert(runner.includes("dirty_worktree_refused"));
assert(runner.includes("expected_project_identity_mismatch"));
assert(runner.includes("provider_file_cleanup_failed"));
assert(!runner.includes("dotenv"));
assert(!runner.includes(".env.local"));
assert(!runner.includes("gpt-5.6"));
assert(!runner.includes("luna"));
assert(!/\.(?:insert|upsert|delete)\s*\(/.test(runner));
assert(!/\.rpc\s*\(/.test(runner));
assert(!/\.auth\s*\.\s*admin\b/.test(runner));
const updateCallLines = runner
  .split(/\r?\n/)
  .filter((line) => /\.update\s*\(/.test(line));
assert(updateCallLines.length > 0);
assert(updateCallLines.every((line) =>
  /createHash\("sha256"\)\.update\(|decipher\.update\(/.test(line),
));
assert(!/storage\s*\.\s*from\s*\(/.test(runner));

assert(launcher.includes('"DISPOSABLE_GEMINI_AI_PARSING_BASELINE_V1"'));
assert(launcher.includes('"RUN_GEMINI_AI_PARSING_BASELINE_V1"'));
assert(launcher.includes('$env:GEMINI_BASELINE_BUDGET_USD = "0.50"'));
assert(launcher.includes('$env:GEMINI_BASELINE_RUN_ORDINAL = "2"'));
assert(launcher.includes("pdf50-e2e-secrets.clixml"));
assert(!launcher.includes("Read-Host"));
assert(!launcher.includes(".env.local"));

console.log("GEMINI_BASELINE_V1_SAFETY_CONTRACT=PASS");
console.log("MAX_RUNS=3");
console.log("MAX_BUDGET_USD=0.50");
console.log("COUNT_TOKENS_REQUIRED=PASS");
console.log("HOSTED_WRITE_SURFACES=0");
console.log("LUNA_CALLS=0");
