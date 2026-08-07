import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [audit, launcher] = await Promise.all([
  readFile(resolve(root, "scripts/ai-parsing-eval/hosted-taxonomy-readonly-parity.mjs"), "utf8"),
  readFile(resolve(root, "scripts/run-ai-parsing-taxonomy-readonly-parity.ps1"), "utf8"),
]);

for (const forbidden of [
  ".insert(",
  ".update(",
  ".upsert(",
  ".delete(",
  ".storage.",
  "loadAIProvider",
  "generateContent",
  "dotenv",
  ".env.local",
]) {
  assert.equal(audit.includes(forbidden), false, `read-only audit contains ${forbidden}`);
}
assert(audit.includes('detectSessionInUrl: false'));
assert(audit.includes('persistSession: false'));
assert(audit.includes('HOSTED_WRITES=0'));
assert(audit.includes('PROVIDER_CALLS=0'));
assert(launcher.includes('"AUTHORIZED_CURRENT_CLEAN_TAXONOMY_READONLY"'));
assert(launcher.includes('"NO_WRITES_NO_PROVIDER"'));
assert(launcher.includes("PROCESS_ENVIRONMENT_CLEARED=PASS"));
assert.equal(launcher.includes("Read-Host"), false);
assert.equal(launcher.includes(".env.local"), false);

console.log("AI_PARSING_HOSTED_TAXONOMY_READONLY_SAFETY=PASS");
