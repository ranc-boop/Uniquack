#!/usr/bin/env node

// Synthetic, read-only capability probe for the configured Gemini Developer
// API profile. It never reads environment files or prints request/response data.

import { spawnSync } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const hasReactServerCondition = process.execArgv.some(
  (argument) =>
    argument === "--conditions=react-server" || argument === "-Creact-server",
);

if (!process.env.PDF50_GEMINI_PROBE_REEXECED && !hasReactServerCondition) {
  const child = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      "--conditions=react-server",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    {
      env: {
        ...process.env,
        PDF50_GEMINI_PROBE_REEXECED: "1",
      },
      stdio: "inherit",
    },
  );

  process.exit(child.status ?? 1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});

const {
  generateWithGeminiNativeText,
  GeminiNativeRequestError,
} = jiti("../src/lib/ai-providers/gemini-native.ts");
const {
  GEMINI_AI_PDF_EXTRACTION_SCHEMA,
} = jiti("../src/lib/ai-providers/gemini-structured-output.ts");
const {
  normalizeAIPdfExtractionResponse,
} = jiti("../src/lib/ai-pdf-import/schema.ts");

const environmentLiteral = "DISPOSABLE_PDF50_GEMINI_COMPATIBILITY";
const confirmationLiteral = "RUN_SYNTHETIC_GEMINI_COMPATIBILITY_PROBE";
const knownModel = "gemini-2.5-flash-lite";
const geminiHost = "generativelanguage.googleapis.com";
const maxInferenceRequests = 18;
const maxInputTokensPerRequest = 65_536;
const maxBillableOutputTokensPerRequest = 65_536;
const maxOutputTokensPerRequest = 512;
const inputMicrosPerMillion = 100_000;
const outputMicrosPerMillion = 400_000;
const probeBudgetMicros = 600_000;
const totalBudgetMicros = 1_000_000;
const conservativeCostMicros =
  maxInferenceRequests *
  (Math.ceil(
    (maxInputTokensPerRequest * inputMicrosPerMillion) / 1_000_000,
  ) +
    Math.ceil(
      (maxBillableOutputTokensPerRequest * outputMicrosPerMillion) /
        1_000_000,
    ));

const sensitiveEnvironmentNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "PDF50_E2E_EXPECTED_PROJECT_REF",
  "PDF50_GEMINI_COMPATIBILITY_ENVIRONMENT",
  "PDF50_GEMINI_COMPATIBILITY_CONFIRM",
  "PDF50_GEMINI_COMPATIBILITY_BUDGET_USD",
];
let probeCaseAttempts = 0;
let providerNetworkRequests = 0;
let metricsPrinted = false;
const providerUsages = [];
let providerUsageMetadataMissing = 0;

class ProbeError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "ProbeError";
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new ProbeError("required_environment_missing");
  return value;
}

function assertSafetyControls() {
  if (process.env.NODE_ENV === "production") {
    throw new ProbeError("production_environment_refused");
  }
  if (
    requiredEnvironment("PDF50_GEMINI_COMPATIBILITY_ENVIRONMENT") !==
    environmentLiteral
  ) {
    throw new ProbeError("environment_acknowledgement_rejected");
  }
  if (
    requiredEnvironment("PDF50_GEMINI_COMPATIBILITY_CONFIRM") !==
    confirmationLiteral
  ) {
    throw new ProbeError("probe_acknowledgement_rejected");
  }
  if (
    requiredEnvironment("PDF50_GEMINI_COMPATIBILITY_BUDGET_USD") !== "1" ||
    conservativeCostMicros > probeBudgetMicros ||
    conservativeCostMicros > totalBudgetMicros
  ) {
    throw new ProbeError("provider_budget_rejected");
  }
}

function assertCurrentCleanIdentity(urlValue, expectedProjectRef) {
  if (!/^[a-z0-9]{8,40}$/.test(expectedProjectRef)) {
    throw new ProbeError("expected_project_identity_invalid");
  }

  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new ProbeError("supabase_url_contract_rejected");
  }

  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !match ||
    match[1] !== expectedProjectRef
  ) {
    throw new ProbeError("expected_project_identity_mismatch");
  }
}

function normalizeGeminiBaseUrl(value) {
  const raw = String(value ?? "").trim() || `https://${geminiHost}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ProbeError("provider_base_url_rejected");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== geminiHost ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/(?:v1beta\/?)?$/.test(url.pathname)
  ) {
    throw new ProbeError("provider_base_url_rejected");
  }

  return raw;
}

function decryptProviderKey(profile) {
  const encryptionSecret = requiredEnvironment("AI_PROVIDER_ENCRYPTION_KEY");
  if (encryptionSecret.length < 24) {
    throw new ProbeError("provider_encryption_contract_rejected");
  }
  if (!profile.api_key_ciphertext || !profile.api_key_iv || !profile.api_key_tag) {
    throw new ProbeError("provider_credential_missing");
  }

  try {
    const key = createHash("sha256").update(encryptionSecret).digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(profile.api_key_iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(profile.api_key_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(profile.api_key_ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ProbeError("provider_credential_decryption_failed");
  }
}

async function loadConfiguredProvider() {
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const expectedProjectRef = requiredEnvironment(
    "PDF50_E2E_EXPECTED_PROJECT_REF",
  );
  assertCurrentCleanIdentity(supabaseUrl, expectedProjectRef);

  const service = createClient(
    supabaseUrl,
    requiredEnvironment("CLEAN_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const { data, error } = await service
    .from("ai_provider_profiles")
    .select(
      "provider, base_url, model, enabled, is_default, supports_pdf_input, api_key_ciphertext, api_key_iv, api_key_tag",
    )
    .eq("enabled", true)
    .is("deleted_at", null);

  if (error) throw new ProbeError("provider_profile_read_failed");

  const candidates = (data ?? []).filter(
    (profile) =>
      String(profile.provider ?? "").trim().toLowerCase() === "gemini_native" &&
      String(profile.model ?? "").trim().toLowerCase() === knownModel &&
      profile.supports_pdf_input === true,
  );
  const defaults = candidates.filter((profile) => profile.is_default === true);
  const profile = defaults.length === 1
    ? defaults[0]
    : defaults.length === 0 && candidates.length === 1
      ? candidates[0]
      : null;

  if (!profile) throw new ProbeError("provider_profile_ambiguous_or_missing");

  return {
    apiKey: decryptProviderKey(profile),
    baseUrl: normalizeGeminiBaseUrl(profile.base_url),
    model: knownModel,
  };
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProbeError("provider_semantic_response_invalid");
  }
  return value;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProbeError("provider_semantic_response_invalid");
  }
}

function outputContract(transport, schema) {
  return { mode: "json_schema", schema, transport };
}

function extractionSchemaFor(fields) {
  const full = GEMINI_AI_PDF_EXTRACTION_SCHEMA;
  const rootProperties = full.properties;
  const questions = rootProperties.questions;
  const question = questions.items;
  const selectedQuestionProperties = Object.fromEntries(
    fields.map((field) => [field, question.properties[field]]),
  );

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: selectedQuestionProperties,
          required: ["title", "question_type", "content_html"],
        },
      },
      warnings: rootProperties.warnings,
    },
    required: ["questions", "warnings"],
  };
}

function safeFailureDetails(error) {
  if (
    error instanceof GeminiNativeRequestError ||
    (Number.isInteger(error?.statusCode) && error?.name === "GeminiNativeRequestError")
  ) {
    return {
      detailTypes: Array.isArray(error.detailTypes) ? error.detailTypes : [],
      fieldViolationPaths: Array.isArray(error.fieldViolationPaths)
        ? error.fieldViolationPaths
        : [],
      providerStatus:
        typeof error.providerStatus === "string" ? error.providerStatus : "NONE",
      statusCode: error.statusCode,
    };
  }
  return null;
}

function safeFatalCategory(error) {
  if (error instanceof ProbeError) return error.code;
  const providerFailure = safeFailureDetails(error);
  if (providerFailure?.statusCode >= 500) return "provider_temporarily_unavailable";
  if (providerFailure) return "provider_request_rejected";
  if (error instanceof TypeError) return "provider_transport_failed";
  return "unexpected_failure";
}

function safeList(values) {
  return values.length ? values.join(",") : "NONE";
}

function usageValue(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function actualEstimatedCostMicros() {
  if (providerUsageMetadataMissing > 0) return null;
  return providerUsages.reduce((total, usage) => {
    return (
      total +
      Math.ceil(
        (usageValue(usage?.inputTokens) * inputMicrosPerMillion) / 1_000_000,
      ) +
      Math.ceil(
        (usageValue(usage?.outputTokens) * outputMicrosPerMillion) / 1_000_000,
      )
    );
  }, 0);
}

function printMetrics() {
  if (metricsPrinted) return;
  metricsPrinted = true;
  const actualCost = actualEstimatedCostMicros();
  console.log(`PROBE_CASE_ATTEMPTS=${probeCaseAttempts}`);
  console.log(`PROVIDER_INFERENCE_REQUESTS=${providerNetworkRequests}`);
  console.log(`PROVIDER_NETWORK_REQUESTS=${providerNetworkRequests}`);
  console.log(`PROVIDER_USAGE_METADATA_MISSING=${providerUsageMetadataMissing}`);
  console.log(
    `ACTUAL_ESTIMATED_COST_MICROS=${actualCost === null ? "UNAVAILABLE" : actualCost}`,
  );
}

async function main() {
  assertSafetyControls();
  delete process.env.AI_IMPORT_LLM_DEBUG_LOGS;

  console.log("PROVIDER_SURFACE=GEMINI_DEVELOPER_API_RAW_REST_GENERATE_CONTENT");
  console.log(`MODEL_CONTRACT=${knownModel}`);
  console.log(`PROBE_CONSERVATIVE_COST_MICROS=${conservativeCostMicros}`);

  const provider = await loadConfiguredProvider();
  console.log("PROVIDER_PROFILE_READ=PASS");

  async function runCase({ label, maxOutputTokens, contract, prompt, validate }) {
    if (probeCaseAttempts >= maxInferenceRequests) {
      throw new ProbeError("probe_inference_budget_exhausted");
    }
    probeCaseAttempts += 1;
    let beforeInferenceCalls = 0;
    const observer = {
      maxOutputTokens,
      beforeInference() {
        beforeInferenceCalls += 1;
        if (beforeInferenceCalls !== 1) {
          throw new ProbeError("probe_attempt_contract_failed");
        }
      },
      recordNetworkRequest(kind) {
        if (kind !== "inference") {
          throw new ProbeError("probe_network_contract_failed");
        }
        providerNetworkRequests += 1;
        if (providerNetworkRequests > maxInferenceRequests) {
          throw new ProbeError("probe_network_budget_exhausted");
        }
      },
    };

    try {
      const response = await generateWithGeminiNativeText({
        ...provider,
        executionObserver: observer,
        outputContract: contract,
        prompt,
      });
      if (response.usage) providerUsages.push(response.usage);
      else providerUsageMetadataMissing += 1;
      try {
        validate(response.text);
      } catch {
        throw new ProbeError("provider_semantic_response_invalid");
      }
      console.log(
        `MATRIX_CASE=${label};RESULT=PASS;INPUT_TOKENS=${usageValue(
          response.usage?.inputTokens,
        )};CANDIDATE_OUTPUT_TOKENS=${usageValue(
          response.usage?.candidateOutputTokens,
        )};THOUGHT_TOKENS=${usageValue(
          response.usage?.thoughtTokens,
        )};BILLABLE_OUTPUT_TOKENS=${usageValue(response.usage?.outputTokens)}`,
      );
      return { accepted: true, outcome: "pass" };
    } catch (error) {
      const providerFailure = safeFailureDetails(error);
      if (providerFailure?.statusCode >= 400 && providerFailure.statusCode < 500) {
        console.log(
          `MATRIX_CASE=${label};RESULT=REJECTED;STATUS=${providerFailure.statusCode};PROVIDER_STATUS=${providerFailure.providerStatus};FIELD_PATHS=${safeList(
            providerFailure.fieldViolationPaths,
          )};DETAIL_TYPES=${safeList(providerFailure.detailTypes)}`,
        );
        return { accepted: false, outcome: "provider_rejected" };
      }
      if (error instanceof ProbeError) {
        console.log(`MATRIX_CASE=${label};RESULT=SEMANTIC_REJECTED`);
        return { accepted: false, outcome: "semantic_rejected" };
      }
      throw error;
    }
  }

  const tinyObjectSchema = {
    type: "object",
    additionalProperties: false,
    properties: { value: { type: "string" } },
    required: ["value"],
  };
  const tinyArraySchema = {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: {
      type: "object",
      additionalProperties: false,
      properties: { value: { type: "string" } },
      required: ["value"],
    },
  };

  const plainTextAccepted = await runCase({
    label: "plain_text",
    maxOutputTokens: 16,
    contract: { mode: "text" },
    prompt: "Return the single word OK.",
    validate(text) {
      if (!text.trim()) throw new ProbeError("provider_semantic_response_invalid");
    },
  });
  if (!plainTextAccepted.accepted) {
    throw new ProbeError("plain_text_unavailable");
  }

  const jsonWithoutSchemaAccepted = await runCase({
    label: "application_json_without_schema",
    maxOutputTokens: 64,
    contract: { mode: "json" },
    prompt: 'Return JSON with exactly one string field named "value".',
    validate(text) {
      asObject(parseJson(text));
    },
  });
  if (!jsonWithoutSchemaAccepted.accepted) {
    throw new ProbeError("application_json_unavailable");
  }

  const formatObject = await runCase({
    label: "response_format_tiny_object",
    maxOutputTokens: 64,
    contract: outputContract("response_format", tinyObjectSchema),
    prompt: "Return one synthetic value matching the supplied schema.",
    validate(text) {
      const value = asObject(parseJson(text));
      if (typeof value.value !== "string") {
        throw new ProbeError("provider_semantic_response_invalid");
      }
    },
  });
  const formatArray = await runCase({
    label: "response_format_tiny_array",
    maxOutputTokens: 64,
    contract: outputContract("response_format", tinyArraySchema),
    prompt: "Return one synthetic array item matching the supplied schema.",
    validate(text) {
      const value = parseJson(text);
      if (!Array.isArray(value) || typeof value[0]?.value !== "string") {
        throw new ProbeError("provider_semantic_response_invalid");
      }
    },
  });
  const jsonSchemaObject = await runCase({
    label: "response_json_schema_tiny_object",
    maxOutputTokens: 64,
    contract: outputContract("response_json_schema", tinyObjectSchema),
    prompt: "Return one synthetic value matching the supplied schema.",
    validate(text) {
      const value = asObject(parseJson(text));
      if (typeof value.value !== "string") {
        throw new ProbeError("provider_semantic_response_invalid");
      }
    },
  });
  const jsonSchemaArray = await runCase({
    label: "response_json_schema_tiny_array",
    maxOutputTokens: 64,
    contract: outputContract("response_json_schema", tinyArraySchema),
    prompt: "Return one synthetic array item matching the supplied schema.",
    validate(text) {
      const value = parseJson(text);
      if (!Array.isArray(value) || typeof value[0]?.value !== "string") {
        throw new ProbeError("provider_semantic_response_invalid");
      }
    },
  });

  const transport = formatObject.accepted && formatArray.accepted
    ? "response_format"
    : jsonSchemaObject.accepted && jsonSchemaArray.accepted
      ? "response_json_schema"
      : null;
  if (!transport) throw new ProbeError("structured_transport_unavailable");
  console.log(`SELECTED_TRANSPORT=${transport}`);

  const requiredExtractionFields = [
    "title",
    "question_type",
    "content_html",
  ];
  const incrementalExtractionFields = [
    { field: "question_number", label: "extraction_question_number" },
    { field: "difficulty_rating", label: "extraction_difficulty_rating" },
    { field: "content_source", label: "extraction_content_source" },
    { field: "solution_html", label: "extraction_solution_html" },
    { field: "solution_source", label: "extraction_solution_source" },
    { field: "options", label: "extraction_options" },
    { field: "answer_spec", label: "extraction_answer_spec" },
    { field: "tag_ids", label: "extraction_tag_ids" },
    { field: "page_refs", label: "extraction_page_refs" },
    { field: "asset_placeholders", label: "extraction_asset_placeholders" },
  ];
  const extractionStages = [
    {
      label: "extraction_minimal",
      fields: requiredExtractionFields,
    },
    ...incrementalExtractionFields.map((entry, index) => ({
      label: entry.label,
      fields: [
        ...requiredExtractionFields,
        ...incrementalExtractionFields
          .slice(0, index + 1)
          .map((candidate) => candidate.field),
      ],
    })),
    {
      label: "extraction_full",
      schema: GEMINI_AI_PDF_EXTRACTION_SCHEMA,
    },
  ];
  let firstIncompatibleStage = null;
  let firstIncompatibleKind = null;
  for (const stage of extractionStages) {
    const accepted = await runCase({
      label: stage.label,
      maxOutputTokens: maxOutputTokensPerRequest,
      contract: outputContract(
        transport,
        stage.schema ?? extractionSchemaFor(stage.fields),
      ),
      prompt:
        "Return one synthetic arithmetic question in the supplied extraction schema. Use 2 + 3 = 5, page 1, no tags, no assets, and no warnings.",
      validate(text) {
        normalizeAIPdfExtractionResponse(parseJson(text));
      },
    });
    if (!accepted.accepted) {
      firstIncompatibleStage = stage.label;
      firstIncompatibleKind = accepted.outcome;
      break;
    }
  }

  printMetrics();
  console.log(
    `SCHEMA_FIRST_INCOMPATIBLE_STAGE=${firstIncompatibleStage ?? "NONE"}`,
  );
  console.log(
    `SCHEMA_FIRST_INCOMPATIBLE_KIND=${firstIncompatibleKind ?? "NONE"}`,
  );

  if (firstIncompatibleStage) {
    throw new ProbeError("extraction_schema_incompatible");
  }

  console.log("PDF50_GEMINI_COMPATIBILITY_PROBE=PASS");
}

let exitCode = 1;
try {
  await main();
  exitCode = 0;
} catch (error) {
  console.log("PDF50_GEMINI_COMPATIBILITY_PROBE=BLOCKED");
  console.log(`FAILURE_CATEGORY=${safeFatalCategory(error)}`);
} finally {
  printMetrics();
  for (const name of sensitiveEnvironmentNames) {
    delete process.env[name];
  }
  delete process.env.PDF50_GEMINI_PROBE_REEXECED;
  delete process.env.AI_IMPORT_LLM_DEBUG_LOGS;
  console.log("PROCESS_ENVIRONMENT_CLEARED=PASS");
}

process.exit(exitCode);
