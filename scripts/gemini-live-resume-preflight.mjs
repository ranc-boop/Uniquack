#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const bankPrefix = "!pdf50-provider-e2e-";
const organizationPrefix = "pdf50-provider-e2e-";
const fixtureKind = "pdf50_provider_e2e";
const expectedEnvironment = "AUTHORIZED_GEMINI_LIVE_RESUME_PREFLIGHT";
const expectedConfirmation = "READ_ONLY_NO_PROVIDER_CONTENT";
const activeJobStatuses = ["queued", "retry_wait", "leased", "processing"];
const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "PDF50_E2E_EXPECTED_PROJECT_REF",
  "GEMINI_LIVE_RESUME_PREFLIGHT_ENVIRONMENT",
  "GEMINI_LIVE_RESUME_PREFLIGHT_CONFIRMATION",
];

class PreflightError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new PreflightError(category);
}

function projectRefFromUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) return null;
    const projectRef = hostname.slice(0, -suffix.length);
    return /^[a-z0-9]{20}$/.test(projectRef) ? projectRef : null;
  } catch {
    return null;
  }
}

async function countRows(query, category) {
  const result = await query;
  if (result.error) throw new PreflightError(category);
  return Number(result.count ?? 0);
}

async function listSyntheticAuthUsers(service) {
  let count = 0;
  for (let page = 1; page <= 10; page += 1) {
    const result = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new PreflightError("auth_residue_check_failed");
    const users = result.data.users ?? [];
    count += users.filter(
      (user) => user.user_metadata?.fixture_kind === fixtureKind,
    ).length;
    if (users.length < 1000) return count;
  }
  throw new PreflightError("auth_residue_check_unbounded");
}

async function checkCredentialFreeGeminiHttps() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        cache: "no-store",
        method: "GET",
        redirect: "error",
        signal: controller.signal,
      },
    );
    assert(response.status >= 200 && response.status < 500, "external_https_unavailable");
    return `${Math.floor(response.status / 100)}xx`;
  } catch {
    throw new PreflightError("external_https_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  for (const name of requiredEnvironment) {
    console.log(`${name}=${process.env[name]?.trim() ? "PRESENT" : "MISSING"}`);
  }
  assert(
    requiredEnvironment.every((name) => process.env[name]?.trim()),
    "missing_process_environment",
  );
  assert(
    process.env.NODE_ENV?.trim().toLowerCase() !== "production",
    "production_environment_refused",
  );
  assert(
    process.env.GEMINI_LIVE_RESUME_PREFLIGHT_ENVIRONMENT === expectedEnvironment &&
      process.env.GEMINI_LIVE_RESUME_PREFLIGHT_CONFIRMATION === expectedConfirmation,
    "safety_confirmation_rejected",
  );

  const projectRef = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  assert(
    projectRef &&
      projectRef ===
        process.env.PDF50_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase(),
    "expected_project_identity_mismatch",
  );

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const banks = await service
    .from("question_banks")
    .select("id")
    .like("name", `${bankPrefix}%`)
    // perf-budget-allow-large-query: bounded synthetic-residue inventory selects IDs only and fails closed at the cap.
    .limit(1000);
  if (banks.error) throw new PreflightError("database_residue_check_failed");
  const bankIds = (banks.data ?? []).map((row) => row.id);
  assert(bankIds.length < 1000, "database_residue_check_unbounded");

  const organizationCount = await countRows(
    service
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .like("slug", `${organizationPrefix}%`),
    "database_residue_check_failed",
  );
  const sourceAssetCount = await countRows(
    service
      .from("import_batch_assets")
      .select("id", { count: "exact", head: true })
      .or(
        "original_filename.like.synthetic-scale-%,original_filename.eq.ai-parsing-visual-evidence.pdf",
      ),
    "database_residue_check_failed",
  );
  const syntheticJobCount = bankIds.length
    ? await countRows(
        service
          .from("ai_provider_jobs")
          .select("id", { count: "exact", head: true })
          .in("target_bank_id", bankIds)
          .in("status", activeJobStatuses),
        "database_residue_check_failed",
      )
    : 0;
  const globalActiveJobCount = await countRows(
    service
      .from("ai_provider_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["leased", "processing"]),
    "database_residue_check_failed",
  );
  const authUserCount = await listSyntheticAuthUsers(service);

  console.log(`SYNTHETIC_BANK_RESIDUE_COUNT=${bankIds.length}`);
  console.log(`SYNTHETIC_ORGANIZATION_RESIDUE_COUNT=${organizationCount}`);
  console.log(`SYNTHETIC_SOURCE_ASSET_RESIDUE_COUNT=${sourceAssetCount}`);
  console.log(`SYNTHETIC_ACTIVE_JOB_RESIDUE_COUNT=${syntheticJobCount}`);
  console.log(`SYNTHETIC_AUTH_USER_RESIDUE_COUNT=${authUserCount}`);
  console.log(`GLOBAL_LEASED_OR_PROCESSING_JOB_COUNT=${globalActiveJobCount}`);
  assert(
    bankIds.length === 0 &&
      organizationCount === 0 &&
      sourceAssetCount === 0 &&
      syntheticJobCount === 0 &&
      authUserCount === 0,
    "synthetic_residue_present",
  );
  assert(globalActiveJobCount === 0, "active_worker_queue_present");

  const httpsStatusClass = await checkCredentialFreeGeminiHttps();
  console.log(`GEMINI_HTTPS_STATUS_CLASS=${httpsStatusClass}`);
  console.log("GEMINI_HTTPS_CONNECTIVITY=PASS");
  console.log("PROVIDER_INFERENCE_REQUESTS=0");
  console.log("PROVIDER_SOURCE_CONTENT_REQUESTS=0");
  console.log("HOSTED_WRITES=0");
  console.log("GEMINI_LIVE_RESUME_PREFLIGHT=PASS");
}

try {
  await main();
} catch (error) {
  console.error("GEMINI_LIVE_RESUME_PREFLIGHT=BLOCKED");
  console.error(
    `FAILURE_CATEGORY=${
      error instanceof PreflightError ? error.category : "unexpected_failure"
    }`,
  );
  process.exitCode = 1;
}
