import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    throw new Error(`${label} sign-in failed: ${error.message}`);
  }

  assert(data.user?.id, `teacher AI Parsing smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function cleanup({ bankId, batchId }) {
  if (!serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (batchId) {
    await admin.from("import_batches").delete().eq("id", batchId);
  }

  if (bankId) {
    await admin.from("question_banks").delete().eq("id", bankId);
  }

  console.log("PASS teacher AI Parsing smoke cleanup removed smoke-created rows");
}

async function runSourceSmoke() {
  const teacherAiParsingPage = await read("src/app/teacher/ai-parsing/page.tsx");
  const bankImportUi = await read("src/app/teacher/banks/bank-import-ui.tsx");
  const bankImportsPage = await read("src/app/teacher/banks/[bankId]/imports/page.tsx");
  const bankActions = await read("src/app/teacher/banks/actions.ts");
  const batchImportService = await read("src/lib/batch-import/service.ts");
  const routeSmoke = await read("scripts/route-smoke.mjs");
  const securitySmoke = await read("scripts/security-smoke.mjs");
  const smokeAll = await read("scripts/smoke-all.mjs");

  assert(
    teacherAiParsingPage.includes("getTeacherQuestionBankDetail") &&
      teacherAiParsingPage.includes("canManageBankContent") &&
      teacherAiParsingPage.includes('redirect(`/teacher/banks/${bankId}/imports?mode=ai`)') &&
      teacherAiParsingPage.includes('redirect("/teacher/banks?intent=import")') &&
      !teacherAiParsingPage.includes("/admin/imports/pdf") &&
      !teacherAiParsingPage.includes("/admin/review"),
    "/teacher/ai-parsing must be a compatibility redirect into the bank-scoped Library Import workspace",
  );

  assert(
      bankImportUi.includes("Viewer Libraries are visible for context") &&
      bankImportUi.includes("only owners and editors can") &&
      bankImportUi.includes("aria-disabled") &&
      bankImportUi.includes("No import auto-publishes or assigns content.") &&
      bankImportUi.includes("Recent AI Parsing status") &&
      bankImportUi.includes("AI Parsing status history uses existing import batches only"),
    "bank import UI must disable viewer imports and explain review-gated bank targeting",
  );

  assert(
    bankImportsPage.includes('["manual", "json", "ai"]') &&
      bankImportsPage.includes("BankManualQuestionForm") &&
      bankImportsPage.includes("BatchImportJsonPanelLoader") &&
      bankImportsPage.includes("TeacherPdfBurstUpload") &&
      bankImportsPage.includes("Review Drafts") &&
      !bankImportsPage.includes("/admin/imports/pdf") &&
      !bankImportsPage.includes("/admin/review"),
    "/teacher/banks/[bankId]/imports must keep Manual/JSON/AI bank-scoped and avoid admin/global handoffs",
  );

  assert(
    bankActions.includes("importBatchImportJson") &&
      bankActions.includes("targetBankId: parsed.bankId") &&
      bankActions.includes("target_bank_id: parsed.bankId") &&
      bankActions.includes("`/teacher/banks/${parsed.bankId}/review`") &&
      batchImportService.includes("targetBankId") &&
      batchImportService.includes("target_bank_id"),
    "bank import action must preserve target_bank_id and hand off to the selected bank review route",
  );

  assert(
    routeSmoke.includes("teacherAiParsingPage") &&
      securitySmoke.includes("teacherAiParsingPage") &&
      smokeAll.includes("teacher-ai-parsing-bank-targeting-smoke.mjs"),
    "route/security/smoke-all must cover teacher AI Parsing bank targeting",
  );

  console.log("PASS teacher AI Parsing bank-targeting source smoke");
}

async function runLiveSmoke() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("SKIP teacher AI Parsing live smoke: missing Supabase URL/anon key.");
    return;
  }

  if (!teacherUsername || !teacherPassword) {
    console.log("SKIP teacher AI Parsing live smoke: missing TEST_TEACHER credentials.");
    return;
  }

  if (!serviceRoleKey) {
    console.log("SKIP teacher AI Parsing live smoke: missing service role cleanup key.");
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const { data: profile, error: profileError } = await teacher.client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", teacher.user.id)
    .single();

  assert(
    !profileError,
    `teacher profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile.role === "teacher", "teacher AI Parsing smoke requires TEST_TEACHER credentials");
  assert(profile.status === "active", "teacher AI Parsing smoke teacher must be active");
  assert(profile.default_organization_id, "teacher must have a default organization");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bankId = null;
  let batchId = null;

  try {
    const { data: createdBankId, error: createBankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created bank for teacher AI Parsing target validation.",
        bank_name: `Teacher AI Parsing smoke ${suffix}`,
        bank_visibility: "private",
      },
    );

    assert(
      !createBankError && createdBankId,
      `teacher bank create failed: ${summarizeSupabaseError(createBankError)}`,
    );
    bankId = createdBankId;
    console.log("PASS teacher AI Parsing live smoke created private target bank");

    const { data: membershipRows, error: membershipError } = await teacher.client
      .from("bank_members")
      .select("bank_id, role, status")
      .eq("bank_id", bankId)
      .eq("user_id", teacher.user.id);
    assert(
      !membershipError,
      `teacher bank membership lookup failed: ${summarizeSupabaseError(membershipError)}`,
    );
    assert(
      membershipRows?.[0]?.role === "owner" && membershipRows[0].status === "active",
      "teacher AI Parsing target bank must create owner membership",
    );
    console.log("PASS teacher AI Parsing live smoke confirmed owner/editor import permission");

    const { data: batch, error: batchError } = await teacher.client
      .from("import_batches")
      .insert({
        created_by: teacher.user.id,
        organization_id: profile.default_organization_id,
        source_type: "manual_json",
        status: "imported",
        summary: {
          reviewGate: "bank_review_required",
          smokeOnly: true,
          targetBankId: bankId,
        },
        target_bank_id: bankId,
      })
      .select("id, target_bank_id")
      .single();

    assert(
      !batchError && batch?.id,
      `teacher AI Parsing target import batch insert failed: ${summarizeSupabaseError(batchError)}`,
    );
    batchId = batch.id;
    assert(
      batch.target_bank_id === bankId,
      "teacher AI Parsing import batch did not preserve target_bank_id",
    );
    console.log("PASS teacher AI Parsing live smoke preserved target_bank_id on import batch");
  } finally {
    await cleanup({ bankId, batchId });
  }
}

await runSourceSmoke();
await runLiveSmoke();
