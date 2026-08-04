import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const probe = readFileSync(
  resolve(root, "scripts", "pdf50-gemini-structured-compatibility-probe.mjs"),
  "utf8",
);
const launcher = readFileSync(
  resolve(
    root,
    "scripts",
    "run-pdf50-gemini-structured-compatibility-probe.ps1",
  ),
  "utf8",
);
const adapter = readFileSync(
  resolve(root, "src", "lib", "ai-providers", "gemini-native.ts"),
  "utf8",
);
const structuredOutput = readFileSync(
  resolve(root, "src", "lib", "ai-providers", "gemini-structured-output.ts"),
  "utf8",
);
const extractionSchema = JSON.parse(
  readFileSync(
    resolve(
      root,
      "src",
      "lib",
      "ai-providers",
      "gemini-ai-pdf-extraction.schema.json",
    ),
    "utf8",
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const source of [probe, launcher]) {
  assert(!source.includes("dotenv"), "compatibility probe must not load dotenv");
  assert(!source.includes(".env.local"), "compatibility probe must not read .env.local");
}

for (const literal of [
  "DISPOSABLE_PDF50_GEMINI_COMPATIBILITY",
  "RUN_SYNTHETIC_GEMINI_COMPATIBILITY_PROBE",
  'PDF50_GEMINI_COMPATIBILITY_BUDGET_USD = "1"',
  "maxInferenceRequests = 18",
  "maxInputTokensPerRequest = 65_536",
  "maxBillableOutputTokensPerRequest = 65_536",
  "maxOutputTokensPerRequest = 512",
  "probeBudgetMicros = 600_000",
  "conservativeCostMicros > probeBudgetMicros",
  "conservativeCostMicros > totalBudgetMicros",
  "PROVIDER_USAGE_METADATA_MISSING",
  'actualCost === null ? "UNAVAILABLE" : actualCost',
]) {
  assert(probe.includes(literal) || launcher.includes(literal), `missing safety control ${literal}`);
}

assert(
  probe.includes('const geminiHost = "generativelanguage.googleapis.com"') &&
    probe.includes('url.hostname !== geminiHost') &&
    probe.includes('url.protocol !== "https:"'),
  "probe must fail closed to the exact HTTPS Gemini Developer API host",
);
assert(
  probe.includes('String(profile.provider ?? "").trim().toLowerCase() === "gemini_native"') &&
    probe.includes('knownModel = "gemini-2.5-flash-lite"') &&
    probe.includes("profile.supports_pdf_input === true"),
  "probe must select only the reviewed Gemini Native PDF profile",
);
assert(
  probe.includes('detectSessionInUrl: false') &&
    probe.includes('.from("ai_provider_profiles")') &&
    !/\.(?:insert|upsert|update)\s*\(\s*\{/.test(probe) &&
    !/\.delete\s*\(\s*\)/.test(probe) &&
    !probe.includes(".storage"),
  "probe must be read-only and must not access Storage",
);
assert(
  probe.includes('label: "plain_text"') &&
    probe.includes('label: "application_json_without_schema"') &&
    probe.includes('label: "response_format_tiny_object"') &&
    probe.includes('label: "response_format_tiny_array"') &&
    probe.includes('label: "response_json_schema_tiny_object"') &&
    probe.includes('label: "response_json_schema_tiny_array"') &&
    probe.includes('label: "extraction_answer_spec"') &&
    probe.includes('label: "extraction_asset_placeholders"') &&
    probe.includes('label: "extraction_full"'),
  "probe must cover the minimum and progressive structured-output matrix",
);
assert(
  probe.includes('throw new ProbeError("provider_semantic_response_invalid")') &&
    probe.includes('outcome: "semantic_rejected"'),
  "application validation failures must be classified as semantic rejection",
);
assert(
  adapter.includes("parseGeminiNativeSafeErrorDetails") &&
    adapter.includes("fieldViolationPaths") &&
    adapter.includes("detailTypes") &&
    !adapter.includes("statusText: response.statusText") &&
    !adapter.includes("message: error instanceof Error ? error.message"),
  "adapter diagnostics must contain only allowlisted safe Provider fields",
);
assert(
  !/console\.(?:log|error|warn)\([^\n]*(?:apiKey|ciphertext|response\.text|profile\.base_url|supabaseUrl|expectedProjectRef)/.test(
    probe,
  ),
  "probe must not print credentials, URLs, identities, or Provider output",
);
assert(
  launcher.includes("Import-Clixml -LiteralPath $VaultPath") &&
    launcher.includes("SecureStringToBSTR") &&
    launcher.includes("ZeroFreeBSTR") &&
    !launcher.includes('Read-Host "Enter') &&
    launcher.includes('Read-Host "Press Enter to close"'),
  "launcher must use the existing DPAPI vault without credential prompts",
);
assert(
  extractionSchema.additionalProperties === false &&
    extractionSchema.properties.questions.maxItems === undefined &&
    extractionSchema.properties.questions.items.properties.answer_spec.additionalProperties === false &&
    structuredOutput.includes("responseFormat") &&
    structuredOutput.includes("responseJsonSchema"),
  "schema and serializer must preserve explicit, testable structured-output contracts",
);

console.log("PASS PDF50 Gemini structured compatibility probe safety smoke");
