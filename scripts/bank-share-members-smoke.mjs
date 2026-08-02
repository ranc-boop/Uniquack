import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const disposableEnvPath = resolve(root, ".env.disposable-smoke.local");
dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: disposableEnvPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
let unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
let unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;

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

function randomSmokePassword() {
  return `Teacher-${randomBytes(18)
    .toString("base64")
    .replace(/[+/=]/g, "9")}`;
}

function isMissingBankShareSchema(error) {
  const summary = summarizeSupabaseError(error).toLowerCase();
  return (
    error?.code === "PGRST202" ||
    summary.includes("bank_share_codes") ||
    summary.includes("create_bank_share_code") ||
    summary.includes("join_question_bank_by_code")
  ) && (summary.includes("schema cache") || summary.includes("does not exist"));
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

  assert(data.user?.id, `bank share smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function getProfile(client, userId) {
  const { data, error } = await client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", userId)
    .single();
  assert(!error, `profile lookup failed: ${summarizeSupabaseError(error)}`);
  return data;
}

async function resolveTeacherOrganizationId(teacher) {
  const profile = await getProfile(teacher.client, teacher.user.id);
  assert(profile.role === "teacher", "primary smoke user must be a real teacher");
  assert(profile.status === "active", "primary smoke teacher must be active");

  if (profile.default_organization_id) {
    return profile.default_organization_id;
  }

  const { data, error } = await teacher.client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", teacher.user.id)
    .eq("role", "teacher")
    .eq("status", "active")
    .limit(1);
  assert(!error, `teacher org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(data?.[0]?.organization_id, "primary smoke teacher needs an organization");
  return data[0].organization_id;
}

async function listAllAuthUsers(admin) {
  const users = [];
  let page = 1;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    assert(!error, `auth user list failed: ${error?.message}`);
    users.push(...(data?.users ?? []));
    if (!data?.users?.length || data.users.length < 1000) break;
    page += 1;
  }

  return users;
}

async function ensureUnrelatedTeacher({ organizationId }) {
  if (unrelatedTeacherUsername && unrelatedTeacherPassword) {
    return;
  }

  assert(
    serviceRoleKey,
    "TEST_UNRELATED_TEACHER credentials missing and service role is unavailable for disposable smoke bootstrap",
  );

  const email = "teacher.unrelated.smoke@o2i.local";
  const password = randomSmokePassword();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const users = await listAllAuthUsers(admin);
  let authUser = users.find((user) => user.email?.toLowerCase() === email);

  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        bootstrap_role: "teacher",
        smoke_only: true,
      },
    });
    assert(!error, `unrelated teacher auth create failed: ${error?.message}`);
    authUser = data.user;
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: {
        ...(authUser.user_metadata ?? {}),
        bootstrap_role: "teacher",
        smoke_only: true,
      },
    });
    assert(!error, `unrelated teacher auth update failed: ${error?.message}`);
    authUser = data.user;
  }

  assert(authUser?.id, "unrelated teacher auth user was not available");

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      default_organization_id: organizationId,
      display_name: email,
      email,
      id: authUser.id,
      role: "teacher",
      status: "active",
      username: email,
    },
    { onConflict: "id" },
  );
  assert(
    !profileError,
    `unrelated teacher profile upsert failed: ${summarizeSupabaseError(profileError)}`,
  );

  const { error: memberError } = await admin.from("organization_members").upsert(
    {
      organization_id: organizationId,
      role: "teacher",
      status: "active",
      user_id: authUser.id,
    },
    { onConflict: "organization_id,user_id" },
  );
  assert(
    !memberError,
    `unrelated teacher membership upsert failed: ${summarizeSupabaseError(memberError)}`,
  );

  await appendFile(
    disposableEnvPath,
    `\nTEST_UNRELATED_TEACHER_USERNAME=${email}\nTEST_UNRELATED_TEACHER_PASSWORD=${password}\n`,
    "utf8",
  );
  unrelatedTeacherUsername = email;
  unrelatedTeacherPassword = password;
  console.log("PASS created disposable unrelated teacher smoke credentials in ignored env");
}

async function verifyPrivateBankBlocked(client, bankId, label) {
  const { data, error } = await client
    .from("question_banks")
    .select("id")
    .eq("id", bankId);
  assert(!error, `${label} read query failed: ${summarizeSupabaseError(error)}`);
  assert(!data?.length, `${label} unexpectedly read private bank`);
}

async function readMemberRole(client, bankId, userId) {
  const { data, error } = await client
    .from("bank_members")
    .select("role, status")
    .eq("bank_id", bankId)
    .eq("user_id", userId)
    .maybeSingle();
  assert(!error, `member role lookup failed: ${summarizeSupabaseError(error)}`);
  return data;
}

async function cleanupSmokeBank(bankId) {
  assert(serviceRoleKey, "service role key required for bank share smoke cleanup");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { error } = await admin.from("question_banks").delete().eq("id", bankId);
  assert(!error, `bank share smoke cleanup failed: ${summarizeSupabaseError(error)}`);
  console.log("PASS bank share smoke cleanup removed smoke-created rows");
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const migration = await read("supabase/clean-migrations/0026_bank_share_codes_and_members.sql");
  const membersPage = await read("src/app/teacher/banks/[bankId]/members/page.tsx");
  const joinPage = await read("src/app/teacher/banks/join/page.tsx");
  assert(
    migration.includes("create table if not exists public.bank_share_codes") &&
      migration.includes("public.join_question_bank_by_code") &&
      migration.includes("private.bank_share_code_hash"),
    "bank share migration is missing table/hash/join RPC",
  );
  assert(
    membersPage.includes("Copy this code now") &&
      joinPage.includes("Joining a Library is separate from") &&
      joinPage.includes("joining a classroom"),
    "bank share route sources are missing expected UI copy",
  );
  console.log("PASS bank share route sources expose member/share and join surfaces");

  if (!teacherUsername || !teacherPassword) {
    throw new Error("Missing TEST_TEACHER credentials for bank share smoke.");
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher A");
  const organizationId = await resolveTeacherOrganizationId(teacher);
  await ensureUnrelatedTeacher({ organizationId });
  const unrelatedTeacher = await signIn(
    unrelatedTeacherUsername,
    unrelatedTeacherPassword,
    "teacher B",
  );
  const student =
    studentUsername && studentPassword
      ? await signIn(studentUsername, studentPassword, "student")
      : null;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bankId = null;

  try {
    const { data: createdBankId, error: createBankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created bank for share-code validation.",
        bank_name: `Bank share smoke ${suffix}`,
        bank_visibility: "private",
      },
    );
    assert(
      !createBankError && createdBankId,
      `teacher A bank create failed: ${summarizeSupabaseError(createBankError)}`,
    );
    bankId = createdBankId;
    console.log("PASS teacher A created private smoke bank");

    await verifyPrivateBankBlocked(unrelatedTeacher.client, bankId, "teacher B before join");
    console.log("PASS teacher B cannot read private bank before joining");

    if (student) {
      await verifyPrivateBankBlocked(student.client, bankId, "student before explicit membership");
      console.log("PASS student cannot read private bank by default");
    } else {
      console.log("SKIP student default block check: TEST_STUDENT credentials are missing.");
    }

    const { data: shareRows, error: shareError } = await teacher.client.rpc(
      "create_bank_share_code",
      {
        expires_at: null,
        granted_role: "viewer",
        target_bank_id: bankId,
      },
    );
    if (isMissingBankShareSchema(shareError)) {
      console.log(
        "SKIP bank share live smoke: clean migration 0026 is not applied to the target Supabase project yet.",
      );
      return;
    }
    assert(
      !shareError && shareRows?.[0]?.raw_share_code,
      `share code create failed: ${summarizeSupabaseError(shareError)}`,
    );
    const shareCode = shareRows[0];
    console.log("PASS teacher A created viewer share code");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { data: storedCode, error: storedCodeError } = await admin
      .from("bank_share_codes")
      .select("id, code_hash, code_hint, role_granted, status")
      .eq("id", shareCode.share_code_id)
      .single();
    assert(
      !storedCodeError,
      `stored share code lookup failed: ${summarizeSupabaseError(storedCodeError)}`,
    );
    assert(storedCode.code_hash && storedCode.code_hash.length === 64, "share code hash is missing");
    assert(
      storedCode.code_hash !== shareCode.raw_share_code,
      "raw share code must not be stored as code_hash",
    );
    assert(!("raw_share_code" in storedCode), "raw share code must not be stored");
    console.log("PASS DB stores share code hash/hint only");

    const { data: joinedRows, error: joinError } = await unrelatedTeacher.client.rpc(
      "join_question_bank_by_code",
      {
        raw_share_code: shareCode.raw_share_code,
      },
    );
    assert(
      !joinError && joinedRows?.[0]?.bank_id === bankId,
      `teacher B join failed: ${summarizeSupabaseError(joinError)}`,
    );
    console.log("PASS teacher B joined bank by share code");

    const { data: teacherBReads, error: teacherBReadError } = await unrelatedTeacher.client
      .from("question_banks")
      .select("id")
      .eq("id", bankId);
    assert(
      !teacherBReadError && teacherBReads?.length === 1,
      `teacher B could not read joined bank: ${summarizeSupabaseError(teacherBReadError)}`,
    );
    const teacherBViewerMember = await readMemberRole(
      unrelatedTeacher.client,
      bankId,
      unrelatedTeacher.user.id,
    );
    assert(
      teacherBViewerMember?.role === "viewer" && teacherBViewerMember.status === "active",
      "teacher B should join as active viewer",
    );
    console.log("PASS teacher B can read joined bank as viewer");

    const { error: viewerManageError } = await unrelatedTeacher.client.rpc(
      "create_bank_share_code",
      {
        expires_at: null,
        granted_role: "viewer",
        target_bank_id: bankId,
      },
    );
    assert(viewerManageError, "teacher B viewer unexpectedly managed share codes");
    console.log("PASS teacher B viewer cannot manage share codes");

    const { error: roleError } = await teacher.client.rpc("update_bank_member_role", {
      new_role: "editor",
      target_bank_id: bankId,
      target_user_id: unrelatedTeacher.user.id,
    });
    assert(!roleError, `teacher A role update failed: ${summarizeSupabaseError(roleError)}`);
    const teacherBEditorMember = await readMemberRole(
      unrelatedTeacher.client,
      bankId,
      unrelatedTeacher.user.id,
    );
    assert(teacherBEditorMember?.role === "editor", "teacher B should now be editor");
    console.log("PASS teacher A updated teacher B role to editor");

    const { error: removeError } = await teacher.client.rpc("remove_bank_member", {
      target_bank_id: bankId,
      target_user_id: unrelatedTeacher.user.id,
    });
    assert(!removeError, `teacher A remove member failed: ${summarizeSupabaseError(removeError)}`);
    await verifyPrivateBankBlocked(unrelatedTeacher.client, bankId, "teacher B after removal");
    console.log("PASS removed teacher B loses bank access");

    const { data: revokeRows, error: revokeCreateError } = await teacher.client.rpc(
      "create_bank_share_code",
      {
        expires_at: null,
        granted_role: "viewer",
        target_bank_id: bankId,
      },
    );
    assert(
      !revokeCreateError && revokeRows?.[0]?.raw_share_code,
      `revocation code create failed: ${summarizeSupabaseError(revokeCreateError)}`,
    );
    const { error: revokeError } = await teacher.client.rpc("revoke_bank_share_code", {
      target_share_code_id: revokeRows[0].share_code_id,
    });
    assert(!revokeError, `share code revoke failed: ${summarizeSupabaseError(revokeError)}`);
    const { error: revokedJoinError } = await unrelatedTeacher.client.rpc(
      "join_question_bank_by_code",
      {
        raw_share_code: revokeRows[0].raw_share_code,
      },
    );
    assert(revokedJoinError, "revoked share code unexpectedly allowed join");
    console.log("PASS revoked share code cannot be used");
  } finally {
    if (bankId) {
      await cleanupSmokeBank(bankId);
    }
  }
}

await main();
