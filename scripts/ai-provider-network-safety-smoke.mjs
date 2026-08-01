#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");
const [network, limits, validation, practice, chat, gemini, blueprint] = await Promise.all([
  read("src/lib/ai-providers/network-safety.ts"),
  read("src/lib/ai-providers/response-limits.ts"),
  read("src/lib/validations/ai-provider.ts"),
  read("src/lib/practice/ai.ts"),
  read("src/lib/ai-providers/chat.ts"),
  read("src/lib/ai-providers/gemini-native.ts"),
  read("src/lib/teacher-blueprint-generation.ts"),
]);

assert.match(network, /lookup\(hostname, \{ all: true, verbatim: true \}\)/);
assert.match(network, /url\.username \|\| url\.password/);
assert.match(network, /replace\(\/\^\\\[\|\\\]\$\/g/);
assert.match(network, /\.endsWith\("\.local"\)/);
assert.match(network, /ALLOW_PRIVATE_AI_PROVIDER_NETWORK/);
assert.match(network, /ALLOW_INSECURE_AI_PROVIDER_HTTP/);
assert.match(validation, /isSafeAIProviderBaseUrlSyntax/);

assert.match(limits, /content-length/);
assert.match(limits, /reader\.cancel/);
assert.match(limits, /AIProviderResponseTooLargeError/);
assert.match(practice, /PRACTICE_PROVIDER_RESPONSE_MAX_BYTES/);
assert.match(practice, /assertResponseContentLength/);
assert.match(practice, /responseBytes > PRACTICE_PROVIDER_RESPONSE_MAX_BYTES/);
for (const provider of [practice, chat, gemini, blueprint]) {
  assert.match(provider, /assertSafeAIProviderBaseUrl/);
  assert.match(provider, /readResponse(Text|Json)WithLimit|PRACTICE_PROVIDER_RESPONSE_MAX_BYTES/);
  assert.match(provider, /redirect: "error"/);
}
assert.match(gemini, /assertSafeAIProviderBaseUrl\(uploadUrl\)/);

console.log("PASS AI provider SSRF and response-size network safety contract");
