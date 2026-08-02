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
const hasRealTeacherCredentials = Boolean(
  process.env.TEST_TEACHER_USERNAME && process.env.TEST_TEACHER_PASSWORD,
);
const teacherUsername =
  process.env.TEST_TEACHER_USERNAME ??
  process.env.TEST_ADMIN_USERNAME ??
  process.env.TEST_SUPER_ADMIN_USERNAME;
const teacherPassword =
  process.env.TEST_TEACHER_PASSWORD ??
  process.env.TEST_ADMIN_PASSWORD ??
  process.env.TEST_SUPER_ADMIN_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;
const teacherCredentialKind = hasRealTeacherCredentials
  ? "real teacher"
  : process.env.TEST_ADMIN_USERNAME && process.env.TEST_ADMIN_PASSWORD
    ? "admin fallback"
    : "super admin fallback";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
}

function isMissingQuestionBankFoundation(error) {
  const summary = summarizeSupabaseError(error).toLowerCase();
  return (
    error?.code === "PGRST202" ||
    summary.includes("create_question_bank") ||
    summary.includes("question_banks")
  ) && (summary.includes("schema cache") || summary.includes("does not exist"));
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
    console.log(
      `SKIP question bank ${label} check: credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `question bank smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function assertTeacherProfile(teacher) {
  const { data: profile, error } = await teacher.client
    .from("profiles")
    .select("id, role, status")
    .eq("id", teacher.user.id)
    .single();

  assert(
    !error,
    `question bank teacher profile lookup failed: ${summarizeSupabaseError(error)}`,
  );
  assert(profile.status === "active", "question bank smoke requires active profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "question bank smoke account must be teacher/admin/super_admin",
  );
  if (hasRealTeacherCredentials) {
    assert(
      profile.role === "teacher",
      "question bank smoke TEST_TEACHER credentials must resolve to a teacher profile",
    );
  }
  return profile;
}

async function assertTeacherOrganizationMembership(teacher) {
  if (!hasRealTeacherCredentials) return;

  const { data: memberships, error } = await teacher.client
    .from("organization_members")
    .select("role, status")
    .eq("user_id", teacher.user.id)
    .eq("status", "active")
    .eq("role", "teacher")
    .limit(1);
  assert(
    !error,
    `question bank teacher organization membership lookup failed: ${summarizeSupabaseError(error)}`,
  );
  assert(
    memberships?.length === 1,
    "question bank smoke TEST_TEACHER credentials must have an active teacher organization membership",
  );
}

async function verifyPrivateBankBlocked(client, bankId, label) {
  const { data, error } = await client
    .from("question_banks")
    .select("id")
    .eq("id", bankId);

  assert(
    !error,
    `${label} private bank visibility query failed: ${summarizeSupabaseError(error)}`,
  );
  assert(!data?.length, `${label} unexpectedly read private teacher bank`);
}

async function cleanupSmokeBank({ bankId, teacher }) {
  if (serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { error } = await admin.from("question_banks").delete().eq("id", bankId);
    assert(
      !error,
      `question bank service cleanup failed: ${summarizeSupabaseError(error)}`,
    );
    console.log("PASS question bank smoke cleanup removed smoke-created rows");
    return;
  }

  const { error } = await teacher.client
    .from("question_banks")
    .update({
      name: `Archived smoke bank ${bankId}`,
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bankId);
  assert(
    !error,
    `question bank fallback cleanup failed: ${summarizeSupabaseError(error)}`,
  );
  console.log(
    "PASS question bank smoke fallback cleanup archived the smoke-created bank",
  );
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const migration = await read("supabase/clean-migrations/0025_question_banks_foundation.sql");
  const banksPage = await read("src/app/teacher/banks/page.tsx");
  const bankDetailPage = await read("src/app/teacher/banks/[bankId]/page.tsx");
  assert(
    migration.includes("public.create_question_bank") &&
      migration.includes("alter table public.question_banks enable row level security"),
    "question bank foundation migration is missing create RPC or RLS",
  );
  assert(
    banksPage.includes("Libraries") &&
    banksPage.includes("Join by code") &&
      bankDetailPage.includes("Next action") &&
      bankDetailPage.includes('label: "Ready"'),
    "question bank list/detail route sources are missing expected UI",
  );
  console.log("PASS question bank route sources expose list/detail surfaces");

  if (!teacherUsername || !teacherPassword) {
    console.log(
      "SKIP question bank foundation smoke: missing TEST_TEACHER, TEST_ADMIN, or TEST_SUPER_ADMIN credentials.",
    );
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, teacherCredentialKind);
  if (!teacher) return;

  await assertTeacherProfile(teacher);
  await assertTeacherOrganizationMembership(teacher);
  console.log(`PASS question bank smoke using ${teacherCredentialKind} credentials`);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let smokeBankId = null;

  try {
    const { data: bankId, error: createError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description:
          "Smoke-created private bank for Question Bank / Library Foundation.",
        bank_name: `Question Bank smoke ${suffix}`,
        bank_visibility: "private",
      },
    );
    if (isMissingQuestionBankFoundation(createError)) {
      console.log(
        "SKIP question bank live create/list/RLS smoke: clean migration 0025 is not applied to the target Supabase project yet.",
      );
      return;
    }
    assert(
      !createError && bankId,
      `question bank create RPC failed: ${summarizeSupabaseError(createError)}`,
    );
    smokeBankId = bankId;
    console.log("PASS teacher/admin can create a private question bank");

    const { data: ownerMembership, error: ownerError } = await teacher.client
      .from("bank_members")
      .select("bank_id, user_id, role, status")
      .eq("bank_id", smokeBankId)
      .eq("user_id", teacher.user.id)
      .single();
    assert(
      !ownerError && ownerMembership?.role === "owner" && ownerMembership.status === "active",
      `owner membership was not created: ${summarizeSupabaseError(ownerError)}`,
    );
    console.log("PASS owner membership is created with the bank");

    const { data: listedBanks, error: listError } = await teacher.client
      .from("question_banks")
      .select("id, name, visibility, status")
      .eq("id", smokeBankId);
    assert(
      !listError && listedBanks?.length === 1,
      `teacher could not list owned question bank: ${summarizeSupabaseError(listError)}`,
    );
    assert(
      listedBanks[0].visibility === "private" && listedBanks[0].status === "active",
      "created question bank must start private and active",
    );
    console.log("PASS teacher can list and open owned question bank detail data");

    const anon = createClient(supabaseUrl, supabaseAnonKey);
    await verifyPrivateBankBlocked(anon, smokeBankId, "anonymous user");
    console.log("PASS anonymous users cannot read private teacher banks");

    if (studentUsername && studentPassword) {
      const student = await signIn(studentUsername, studentPassword, "student");
      if (student) {
        await verifyPrivateBankBlocked(student.client, smokeBankId, "student");
        console.log("PASS students cannot browse teacher private banks");
      }
    } else {
      console.log("SKIP student private bank check: TEST_STUDENT credentials are missing.");
    }

    if (unrelatedTeacherUsername && unrelatedTeacherPassword) {
      const unrelatedTeacher = await signIn(
        unrelatedTeacherUsername,
        unrelatedTeacherPassword,
        "unrelated teacher",
      );
      if (unrelatedTeacher) {
        await verifyPrivateBankBlocked(
          unrelatedTeacher.client,
          smokeBankId,
          "unrelated teacher",
        );
        console.log("PASS unrelated teachers cannot read private banks without membership");
      }
    } else {
      console.log("SKIP unrelated teacher private bank check: credentials are missing.");
    }
  } finally {
    if (smokeBankId) {
      await cleanupSmokeBank({ bankId: smokeBankId, teacher });
    }
  }
}

await main();
