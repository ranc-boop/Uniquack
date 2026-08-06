#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const preflight = await readFile(
  new URL("./gemini-live-resume-preflight.mjs", import.meta.url),
  "utf8",
);
const launcher = await readFile(
  new URL("./run-gemini-live-resume-preflight.ps1", import.meta.url),
  "utf8",
);

for (const forbidden of [
  ".insert(",
  ".update(",
  ".upsert(",
  ".delete(",
  ".remove(",
  ".upload(",
  ".rpc(",
  "generateContent",
  "AI_PROVIDER_ENCRYPTION_KEY",
]) {
  assert(!preflight.includes(forbidden), `forbidden preflight operation: ${forbidden}`);
}

assert(preflight.includes("GEMINI_LIVE_RESUME_PREFLIGHT=PASS"));
assert(preflight.includes("PROVIDER_INFERENCE_REQUESTS=0"));
assert(preflight.includes("PROVIDER_SOURCE_CONTENT_REQUESTS=0"));
assert(preflight.includes("HOSTED_WRITES=0"));
assert(preflight.includes("AbortController"));
assert(preflight.includes("fixture_kind"));
assert(preflight.includes('"queued", "retry_wait", "leased", "processing"'));
assert(launcher.includes("Import-Clixml -LiteralPath $VaultPath"));
assert(launcher.includes("CURRENT_WINDOWS_USER_AND_COMPUTER"));
assert(launcher.includes("PROCESS_ENVIRONMENT_CLEARED=PASS"));
assert(!launcher.includes("Read-Host \"Enter"));

console.log("PASS Gemini live-resume preflight is read-only and credential-safe");
