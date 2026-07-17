import { randomUUID } from "node:crypto";
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
  const classroomName = `Smoke classroom ${Date.now()}`;
  const { data: classroomRows, error: classroomError } = await teacher.rpc(
    "create_teacher_classroom",
    {
      p_description: "Classroom foundation smoke classroom",
      p_name: classroomName,
      p_organization_id: organizationId,
      p_request_id: randomUUID(),
      p_subject: "Smoke test",
    },
  );
  assert(!classroomError, `teacher classroom RPC failed: ${classroomError?.message}`);
  const createdClassroom = Array.isArray(classroomRows) ? classroomRows[0] : classroomRows;
  assert(createdClassroom?.classroom_id, "classroom RPC did not return a classroom id");
  assert(createdClassroom?.display_code, "classroom RPC did not return a display join code");
  const classroom = { id: createdClassroom.classroom_id, name: classroomName };
  const joinCode = createdClassroom.display_code;
  let studentMembershipId = null;

  try {
    console.log("PASS teacher can create classroom through the server-verified RPC");

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
    studentMembershipId = joinRows?.[0]?.membership_id ?? null;
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
    if (studentMembershipId) {
      await teacher.rpc("set_classroom_student_membership_status", {
        p_classroom_id: classroom.id,
        p_member_id: studentMembershipId,
        p_status: "removed",
      });
    }
    await teacher
      .from("classrooms")
      .update({ status: "archived", updated_by: teacherUser.id })
      .eq("id", classroom.id);
  }

  console.log("PASS classroom foundation smoke completed with archived test classroom");
}

await main();
