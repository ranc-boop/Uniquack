import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const hasReactServerCondition = process.execArgv.some(
  (arg) => arg === "--conditions=react-server" || arg === "-Creact-server",
);

if (!process.env.O2I_REAL_GEMINI_IMPORT_QA_REEXECED && !hasReactServerCondition) {
  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, "--conditions=react-server", scriptPath, ...process.argv.slice(2)],
    {
      env: {
        ...process.env,
        O2I_REAL_GEMINI_IMPORT_QA_REEXECED: "1",
      },
      stdio: "inherit",
    },
  );

  process.exit(child.status ?? 1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

dotenv.config({ path: resolve(repoRoot, ".env.local") });

const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: {
    "@": resolve(repoRoot, "src"),
  },
});

const { processAIPdfImport } = jiti("../src/lib/ai-pdf-import/service.ts");
const { getPdfPageCount } = jiti("../src/lib/ai-pdf-import/pdf.ts");

const AI_IMPORT_SOURCES_BUCKET = "ai-import-sources";
const RESULT_PATH = resolve(repoRoot, ".codex_tmp", "real-gemini-import-qa-result.json");

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.warn(`WARN ${message}`);
}

function sanitizeForOutput(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeForOutput);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/cipher|token|secret|password|key|prompt|response/i.test(key))
      .map(([key, entry]) => [key, sanitizeForOutput(entry)]),
  );
}

function buildSyntheticPdf() {
  const textLines = [
    "Synthetic QA import fixture",
    "Question 1. Solve 2x + 3 = 7. What is x?",
    "A. 1",
    "B. 2",
    "C. 5",
    "D. 10",
    "Answer: B. x = 2 because 2x = 4.",
  ];
  const escapedText = textLines
    .map((line, index) => {
      const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      return index === 0
        ? `72 720 Td (${escaped}) Tj`
        : `0 -24 Td (${escaped}) Tj`;
    })
    .join("\n");
  const stream = `BT\n/F1 14 Tf\n${escapedText}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

async function signInSuperAdmin({ anonKey, url }) {
  const attempts = [
    ["TEST_SUPER_ADMIN_USERNAME", "TEST_SUPER_ADMIN_PASSWORD"],
    ["TEST_ADMIN_USERNAME", "TEST_ADMIN_PASSWORD"],
  ];

  const errors = [];
  for (const [usernameEnv, passwordEnv] of attempts) {
    const username = process.env[usernameEnv]?.trim();
    const password = process.env[passwordEnv]?.trim();

    if (!username || !password) {
      errors.push(`${usernameEnv}/${passwordEnv} missing`);
      continue;
    }

    const client = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });

    if (error || !data.user) {
      errors.push(`${usernameEnv} sign-in failed`);
      continue;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, role, status, default_organization_id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      errors.push(`${usernameEnv} profile lookup failed: ${summarizeSupabaseError(profileError)}`);
      continue;
    }

    if (profile?.role !== "super_admin") {
      errors.push(`${usernameEnv} is not super_admin`);
      continue;
    }

    if (!profile.default_organization_id) {
      errors.push(`${usernameEnv} profile has no default organization`);
      continue;
    }

    pass("authenticated clean super-admin session established");
    return { client, profile, user: data.user, usernameEnv };
  }

  throw new Error(
    `Unable to establish authenticated super-admin QA session: ${errors.join("; ")}`,
  );
}

async function selectGeminiProvider(client) {
  const { data, error } = await client.rpc(
    "list_enabled_ai_provider_profiles_for_gateway",
    { gateway_token: requiredEnv("AI_PROVIDER_GATEWAY_TOKEN") },
  );

  if (error) {
    throw new Error(`provider gateway list failed: ${summarizeSupabaseError(error)}`);
  }

  const providers = data ?? [];
  const provider = providers.find((item) => {
    const providerName = String(item.provider ?? "").toLowerCase();
    const model = String(item.model ?? "").toLowerCase();
    return (
      providerName.includes("gemini") &&
      model.includes("gemini") &&
      item.supports_pdf_input === true
    );
  });

  if (!provider) {
    throw new Error(
      `Authenticated provider gateway returned ${providers.length} enabled provider(s), but no Gemini PDF provider.`,
    );
  }

  pass("authenticated provider gateway returned enabled Gemini PDF provider metadata");
  return provider;
}

async function createSyntheticImport({ client, organizationId, profileId, pdfBuffer }) {
  const originalFilename = `real-gemini-qa-${Date.now()}.pdf`;
  const { data: batch, error: batchError } = await client
    .from("import_batches")
    .insert({
      created_by: profileId,
      organization_id: organizationId,
      source_type: "ai_pdf",
      status: "validating",
      summary: {
        aiPdfImport: {
          fileName: originalFilename,
          phase: "qa_source_uploaded",
          qa: {
            synthetic: true,
            purpose: "real_gemini_reimport_quality_qa",
          },
        },
      },
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(`import batch insert failed: ${summarizeSupabaseError(batchError)}`);
  }

  const assetId = crypto.randomUUID();
  const sourceObjectPath = `ai-pdf-imports/${batch.id}/${assetId}-${originalFilename}`;
  const pageCount = await getPdfPageCount(pdfBuffer);
  const { data: asset, error: assetError } = await client
    .from("import_batch_assets")
    .insert({
      asset_role: "source_pdf",
      batch_id: batch.id,
      created_by: profileId,
      id: assetId,
      metadata: {
        pageCount,
        qa: "real_gemini_reimport_quality_qa",
        uploadReadyAt: new Date().toISOString(),
        uploadState: "ready",
      },
      mime_type: "application/pdf",
      object_path: sourceObjectPath,
      original_filename: originalFilename,
      size_bytes: pdfBuffer.length,
      status: "ready",
    })
    .select("*")
    .single();

  if (assetError || !asset) {
    await client.from("import_batches").delete().eq("id", batch.id);
    throw new Error(`source asset insert failed: ${summarizeSupabaseError(assetError)}`);
  }

  const { data: signedUpload, error: signedUploadError } = await client.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .createSignedUploadUrl(sourceObjectPath);

  if (signedUploadError || !signedUpload?.token) {
    throw new Error(`source upload URL failed: ${summarizeSupabaseError(signedUploadError)}`);
  }

  const { error: uploadError } = await client.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .uploadToSignedUrl(sourceObjectPath, signedUpload.token, pdfBuffer, {
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error(`source PDF upload failed: ${summarizeSupabaseError(uploadError)}`);
  }

  pass("synthetic AI PDF import batch and source asset created");
  return {
    batchId: batch.id,
    fileName: originalFilename,
    pageCount,
    sourceAssetId: asset.id,
    sourceObjectPath,
  };
}

async function loadBatchSummary({ batchId, client }) {
  const { data, error } = await client
    .from("import_batches")
    .select("id, organization_id, source_type, status, summary, created_at, updated_at")
    .eq("id", batchId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`batch lookup failed: ${summarizeSupabaseError(error)}`);
  }

  return data;
}

async function collectQualityStats({ batchId, client, organizationId, providerProfileId }) {
  const { data: items, error: itemsError } = await client
    .from("import_batch_items")
    .select("id, status, created_question_id, validation_errors")
    .eq("batch_id", batchId)
    .order("item_index", { ascending: true });

  if (itemsError) {
    throw new Error(`import items lookup failed: ${summarizeSupabaseError(itemsError)}`);
  }

  const questionIds = (items ?? [])
    .map((item) => item.created_question_id)
    .filter(Boolean);

  let questions = [];
  if (questionIds.length) {
    const { data, error } = await client
      .from("questions")
      .select(
        "id, organization_id, question_code, title, status, question_type, options, answer_spec, content_html, content_source, content_source_format, solution_html, solution_source, solution_source_format, source, source_kind",
      )
      .in("id", questionIds);

    if (error) {
      throw new Error(`question lookup failed: ${summarizeSupabaseError(error)}`);
    }
    questions = data ?? [];
  }

  const mcqQuestions = questions.filter(
    (question) =>
      Array.isArray(question.options) &&
      question.options.length > 0,
  );
  const emptySolutionQuestions = questions.filter(
    (question) =>
      !String(question.solution_html ?? "").trim() &&
      !String(question.solution_source ?? "").trim(),
  );
  const mcqWithNonFrqAnswerSpec = mcqQuestions.filter((question) => {
    const answerSpec = question.answer_spec ?? {};
    return typeof answerSpec === "object" && answerSpec.kind && answerSpec.kind !== "frq";
  });
  const autoPublishedQuestions = questions.filter((question) => question.status === "published");
  const wrongOrganizationQuestions = questions.filter(
    (question) => question.organization_id !== organizationId,
  );
  const missingSourceMetadataQuestions = questions.filter(
    (question) =>
      !String(question.content_source ?? "").trim() ||
      !String(question.content_source_format ?? "").trim() ||
      !String(question.source ?? "").trim() ||
      !String(question.source_kind ?? "").trim(),
  );

  let assets = [];
  if (questionIds.length) {
    const { data, error } = await client
      .from("question_assets")
      .select("id, question_id, asset_kind, storage_bucket, storage_path, label, alt_text")
      .in("question_id", questionIds);

    if (error) {
      throw new Error(`question assets lookup failed: ${summarizeSupabaseError(error)}`);
    }
    assets = data ?? [];
  }

  let assignments = [];
  if (questionIds.length) {
    const { data, error } = await client
      .from("question_taxonomy_assignments")
      .select("id, question_id, tag_id, review_status, source")
      .in("question_id", questionIds);

    if (error) {
      throw new Error(`taxonomy assignment lookup failed: ${summarizeSupabaseError(error)}`);
    }
    assignments = data ?? [];
  }

  const { data: operationLogs, error: logError } = await client
    .from("ai_provider_operation_logs")
    .select(
      "id, provider_profile_id, operation_kind, provider, model, mode, status, token_counts, cost_estimate, redacted_error, redacted_error_kind, related_record_kind, related_record_id, created_at",
    )
    .eq("provider_profile_id", providerProfileId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (logError) {
    throw new Error(`provider operation log lookup failed: ${summarizeSupabaseError(logError)}`);
  }

  return {
    assetCount: assets.length,
    assetsUseCleanFields: assets.every(
      (asset) =>
        asset.asset_kind &&
        asset.storage_bucket &&
        asset.storage_path &&
        asset.label &&
        asset.alt_text,
    ),
    assignmentCount: assignments.length,
    autoPublishedCount: autoPublishedQuestions.length,
    createdQuestionCount: questions.length,
    emptySolutionCount: emptySolutionQuestions.length,
    importedItemCount: (items ?? []).filter((item) => item.status === "imported").length,
    itemCount: items?.length ?? 0,
    mcqAnswerSpecNonFrqCount: mcqWithNonFrqAnswerSpec.length,
    mcqQuestionCount: mcqQuestions.length,
    missingSourceMetadataCount: missingSourceMetadataQuestions.length,
    operationLogs: sanitizeForOutput(operationLogs ?? []),
    pendingReviewAssignmentCount: assignments.filter(
      (assignment) => assignment.review_status === "pending_review",
    ).length,
    questionCodes: questions.map((question) => question.question_code),
    statuses: Array.from(new Set(questions.map((question) => question.status))),
    taxonomySources: Array.from(new Set(assignments.map((assignment) => assignment.source))),
    wrongOrganizationQuestionCount: wrongOrganizationQuestions.length,
  };
}

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  requiredEnv("AI_PROVIDER_GATEWAY_TOKEN");
  requiredEnv("AI_PROVIDER_ENCRYPTION_KEY");

  const { client, profile, user, usernameEnv } = await signInSuperAdmin({ anonKey, url });
  const provider = await selectGeminiProvider(client);
  const pdfBuffer = buildSyntheticPdf();
  const importFixture = await createSyntheticImport({
    client,
    organizationId: profile.default_organization_id,
    pdfBuffer,
    profileId: user.id,
  });

  await processAIPdfImport({
    batchId: importFixture.batchId,
    fileName: importFixture.fileName,
    pdfBuffer,
    profileId: user.id,
    providerProfileId: provider.id,
    sourceAssetId: importFixture.sourceAssetId,
    sourceObjectPath: importFixture.sourceObjectPath,
    supabase: client,
  });
  pass("processAIPdfImport completed without throwing");

  const batch = await loadBatchSummary({ batchId: importFixture.batchId, client });
  const quality = await collectQualityStats({
    batchId: importFixture.batchId,
    client,
    organizationId: profile.default_organization_id,
    providerProfileId: provider.id,
  });
  const aiPdfImport = batch.summary?.aiPdfImport ?? {};

  const result = {
    authenticatedPath: {
      gatewayRpc: "list_enabled_ai_provider_profiles_for_gateway",
      signInEnv: usernameEnv,
      usedAnonClientSession: true,
      usedServiceRoleForProviderPath: false,
    },
    batch: {
      id: batch.id,
      organizationMatchesProfileDefault:
        batch.organization_id === profile.default_organization_id,
      phase: aiPdfImport.phase ?? null,
      status: batch.status,
      warningCount: Array.isArray(aiPdfImport.warnings) ? aiPdfImport.warnings.length : 0,
    },
    importFixture: {
      fileName: importFixture.fileName,
      pageCount: importFixture.pageCount,
      synthetic: true,
    },
    provider: {
      id: provider.id,
      model: provider.model,
      name: provider.name,
      provider: provider.provider,
    },
    quality,
    safety: {
      noAutoPublish: quality.autoPublishedCount === 0,
      noWrongOrganizationQuestions: quality.wrongOrganizationQuestionCount === 0,
      providerLogsSanitized: true,
      reviewOnlyDrafts: quality.statuses.every((status) => status === "draft"),
      taxonomyPendingReviewOnly:
        quality.assignmentCount === 0 ||
        quality.pendingReviewAssignmentCount === quality.assignmentCount,
    },
  };

  await import("node:fs/promises").then((fs) =>
    fs.writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8"),
  );

  if (quality.autoPublishedCount > 0) {
    throw new Error("AI import auto-published generated questions.");
  }

  if (quality.wrongOrganizationQuestionCount > 0) {
    throw new Error("Generated questions do not align with the authenticated profile organization.");
  }

  if (!quality.assetsUseCleanFields) {
    throw new Error("One or more question assets are missing clean schema fields.");
  }

  if (quality.mcqQuestionCount > 0 && quality.mcqAnswerSpecNonFrqCount !== quality.mcqQuestionCount) {
    throw new Error("At least one MCQ draft still has an FRQ or missing answer_spec kind.");
  }

  pass(`real Gemini QA import finished with ${quality.createdQuestionCount} draft question(s)`);
  if (quality.emptySolutionCount > 0) {
    warn(`${quality.emptySolutionCount} draft question(s) still need solution/explanation review`);
  }
  console.log(`Wrote sanitized QA result to ${RESULT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
