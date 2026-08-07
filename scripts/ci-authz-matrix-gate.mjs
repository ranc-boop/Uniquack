import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/authz-matrix-runner.mjs"], { encoding: "utf8", env: process.env });
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const summary = (result.stdout ?? "").match(/Controls failed:\s*(\d+)\s*\|\s*Findings:\s*(\d+)/);
if (!summary) throw new Error("Authorization matrix did not emit a parseable summary.");
const controlFailures = Number(summary[1]);
const findings = Number(summary[2]);
if (controlFailures > 0 || findings > 0) {
  console.error(`Authorization gate failed: ${controlFailures} control failure(s), ${findings} finding(s).`);
  process.exit(1);
}
console.log("PASS authorization matrix has green controls and no findings");
