import { createHash, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const teacherUsername =
  process.env.TEST_TEACHER_USERNAME ?? process.env.TEST_ADMIN_USERNAME;
const teacherPassword =
  process.env.TEST_TEACHER_PASSWORD ?? process.env.TEST_ADMIN_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function normalizeJoinCode(code) {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hashJoinCode(code) {
  return createHash("sha256").update(normalizeJoinCode(code), "utf8").digest("hex");
}

function randomJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length])
    .join("")
    .replace(/^(.{4})(.{4})$/, "$1-$2");
}

async function signIn(username, password) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });
  if (error) {
    console.log(
      `SKIP classroom foundation smoke: supplied test credentials could not sign in (${error.message}).`,
    );
    return null;
  }
  assert(data.user?.id, "classroom smoke did not receive an authenticated user");
  return supabase;
}

async function resolveOrganizationId(supabase, userId) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", userId)
    .single();
  assert(!profileError, `classroom smoke profile lookup failed: ${profileError?.message}`);
  assert(profile?.status === "active", "classroom smoke requires active test profiles");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "classroom smoke teacher account must be teacher/admin/super_admin",
  );

  if (profile.default_organization_id) {
    return profile.default_organization_id;
  }

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["teacher", "admin"])
    .limit(1);
  assert(!error, `classroom smoke organization lookup failed: ${error?.message}`);
  assert(memberships?.[0]?.organization_id, "classroom smoke found no teacher organization");
  return memberships[0].organization_id;
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "SKIP classroom foundation smoke: missing TEST_TEACHER or TEST_ADMIN credentials and TEST_STUDENT credentials.",
    );
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword);
  const student = await signIn(studentUsername, studentPassword);

  if (!teacher || !student) {
    return;
  }

  const {
    data: { user: teacherUser },
  } = await teacher.auth.getUser();
  const organizationId = await resolveOrganizationId(teacher, teacherUser.id);
  const joinCode = randomJoinCode();
  const classroomName = `Smoke classroom ${Date.now()}`;
  const { data: classroom, error: classroomError } = await teacher
    .from("classrooms")
    .insert({
      created_by: teacherUser.id,
      name: classroomName,
      organization_id: organizationId,
      owner_id: teacherUser.id,
      subject: "Smoke test",
      updated_by: teacherUser.id,
    })
    .select("id, name")
    .single();
  assert(!classroomError, `teacher could not create classroom: ${classroomError?.message}`);

  try {
    const { error: teacherMemberError } = await teacher.from("classroom_members").insert({
      classroom_id: classroom.id,
      joined_at: new Date().toISOString(),
      role: "teacher",
      status: "active",
      user_id: teacherUser.id,
    });
    assert(!teacherMemberError, `teacher membership insert failed: ${teacherMemberError?.message}`);

    const { error: codeError } = await teacher.from("classroom_join_codes").insert({
      classroom_id: classroom.id,
      code_hash: hashJoinCode(joinCode),
      code_hint: `...${normalizeJoinCode(joinCode).slice(-4)}`,
      created_by: teacherUser.id,
      status: "active",
    });
    assert(!codeError, `join code insert failed: ${codeError?.message}`);
    console.log("PASS teacher can create classroom and hashed join code");

    const { data: hiddenClassroom, error: hiddenError } = await student
      .from("classrooms")
      .select("id")
      .eq("id", classroom.id)
      .maybeSingle();
    assert(!hiddenError, `pre-join student classroom read errored: ${hiddenError?.message}`);
    assert(!hiddenClassroom, "student unexpectedly saw classroom before joining");
    console.log("PASS student cannot see classroom before joining");

    const { data: joinRows, error: joinError } = await student.rpc("join_classroom_by_code", {
      join_code: joinCode,
    });
    assert(!joinError, `student join RPC failed: ${joinError?.message}`);
    assert(joinRows?.[0]?.classroom_id === classroom.id, "student join RPC returned wrong classroom");
    console.log("PASS student can join classroom by code");

    const { data: joinedClassroom, error: joinedError } = await student
      .from("classrooms")
      .select("id, name")
      .eq("id", classroom.id)
      .single();
    assert(!joinedError, `joined student classroom read failed: ${joinedError?.message}`);
    assert(joinedClassroom?.id === classroom.id, "student could not see joined classroom");
    console.log("PASS student can see joined classroom");

    const { data: roster, error: rosterError } = await teacher
      .from("classroom_members")
      .select("user_id, role, status")
      .eq("classroom_id", classroom.id);
    assert(!rosterError, `teacher roster read failed: ${rosterError?.message}`);
    assert(
      roster?.some((member) => member.role === "student" && member.status === "active"),
      "teacher roster did not show joined student",
    );
    console.log("PASS teacher roster shows joined student");

    const anon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: anonClassroom, error: anonError } = await anon
      .from("classrooms")
      .select("id")
      .eq("id", classroom.id)
      .maybeSingle();
    assert(!anonError, `anon classroom read errored: ${anonError?.message}`);
    assert(!anonClassroom, "anon unexpectedly read classroom");
    console.log("PASS anon cannot read classroom data");
  } finally {
    await teacher
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", classroom.id);
    await teacher
      .from("classroom_members")
      .update({ status: "removed" })
      .eq("classroom_id", classroom.id)
      .neq("user_id", teacherUser.id);
    await teacher
      .from("classrooms")
      .update({ status: "archived", updated_by: teacherUser.id })
      .eq("id", classroom.id);
  }

  console.log("PASS classroom foundation smoke completed with archived test classroom");
}

await main();
