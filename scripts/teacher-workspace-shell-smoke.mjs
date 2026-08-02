import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });

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

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function randomJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length])
    .join("")
    .replace(/^(.{4})(.{4})$/, "$1-$2");
}

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    console.log(
      `SKIP teacher workspace live smoke: ${label} credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `teacher workspace smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function resolveOrganizationId(supabase, userId) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", userId)
    .single();
  assert(
    !profileError,
    `teacher workspace profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "teacher workspace smoke requires active profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "teacher workspace smoke teacher account must be teacher/admin/super_admin",
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
  assert(!error, `teacher workspace org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "teacher workspace smoke found no teacher org");
  return memberships[0].organization_id;
}

async function runSourceSmoke() {
  const teacherPage = await read("src/app/teacher/page.tsx");
  const teacherNav = await read("src/components/teacher/teacher-workspace-nav.tsx");
  const rootLayout = await read("src/app/layout.tsx");
  const classroomActions = await read("src/app/teacher/classrooms/actions.ts");
  const classroomDetail = await read("src/app/teacher/classrooms/[id]/page.tsx");
  const classroomUi = await read("src/app/teacher/classrooms/classroom-ui.tsx");
  const classroomPeople = await read("src/app/teacher/classrooms/[id]/people/page.tsx");
  const classroomStudents = await read("src/app/teacher/classrooms/[id]/students/page.tsx");
  const migration = await read("supabase/clean-migrations/0043_classroom_creation_rls_hardening.sql");

  for (const label of [
    "Home",
    "My Libraries",
    "Public Library",
    "Blueprints",
    "Classrooms",
    "Assignments",
    "Progress",
  ]) {
    assert(teacherNav.includes(label), `teacher nav missing ${label}`);
  }

  assert(!teacherNav.includes("/admin/imports/pdf"), "teacher nav must not route imports through admin");
  assert(!teacherNav.includes("/admin/review"), "teacher nav must not route review through admin");
  assert(
    teacherPage.includes("getTeacherHomeSummary") &&
      teacherPage.includes("Next action") &&
      teacherPage.includes('label: "Libraries"') &&
      teacherPage.includes('label: "Assignments"') &&
      teacherPage.includes('label: "Progress"') &&
      !teacherPage.includes("Bank-first teacher workflow"),
    "teacher dashboard must stay bank-first without duplicating global navigation or explanatory copy",
  );
  assert(
    rootLayout.includes("<AppChrome") &&
      rootLayout.includes("role={identity.role}") &&
      rootLayout.includes("<Suspense"),
    "root layout must expose one role-aware workspace chrome",
  );
  assert(
    classroomActions.includes("create_teacher_classroom"),
    "classroom creation must use the teacher classroom RPC",
  );
  assert(
      classroomDetail.includes("Active join code") &&
      classroomDetail.includes("Class delivery snapshot") &&
      classroomUi.includes("Overview") &&
      classroomUi.includes("Assignments") &&
      classroomUi.includes("Students") &&
      classroomUi.includes("Teachers") &&
      classroomUi.includes("Progress") &&
      classroomUi.includes("Blueprints") &&
      classroomUi.includes("Settings") &&
      classroomPeople.includes("/students") &&
      classroomStudents.includes("Removing a student stops future classroom access") &&
      classroomActions.includes("createClassroomJoinCode"),
    "classroom detail must expose teacher classroom sections and persistent join code recovery",
  );
  assert(
    migration.includes("create function public.create_teacher_classroom") &&
      migration.includes("p_request_id uuid") &&
      migration.includes("grant execute on function public.create_teacher_classroom"),
    "migration 0043 must define the narrow teacher classroom creation RPC",
  );

  console.log("PASS teacher workspace shell source checks");
}

async function runLiveSmoke() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("SKIP teacher workspace live smoke: missing Supabase URL/anon key.");
    return;
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "SKIP teacher workspace live smoke: missing TEST_TEACHER or TEST_ADMIN credentials and TEST_STUDENT credentials.",
    );
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const student = await signIn(studentUsername, studentPassword, "student");
  if (!teacher || !student) return;

  const organizationId = await resolveOrganizationId(teacher.client, teacher.user.id);
  const { data: classroomRows, error: createError } = await teacher.client.rpc(
    "create_teacher_classroom",
    {
      p_description: "Teacher workspace smoke classroom",
      p_name: `Teacher workspace smoke ${Date.now()}`,
      p_organization_id: organizationId,
      p_request_id: randomUUID(),
      p_subject: "Smoke test",
    },
  );

  if (createError?.message?.includes("function public.create_teacher_classroom")) {
    console.log("SKIP teacher workspace live smoke: migration 0043 is not applied remotely.");
    return;
  }

  assert(!createError, `teacher classroom RPC failed: ${summarizeSupabaseError(createError)}`);
  const classroom = Array.isArray(classroomRows) ? classroomRows[0] : classroomRows;
  assert(classroom?.classroom_id, "teacher classroom RPC did not return a classroom id");
  assert(classroom?.display_code, "teacher classroom RPC did not return a display join code");

  try {
    const { data: membership, error: membershipError } = await teacher.client
      .from("classroom_members")
      .select("role, status")
      .eq("classroom_id", classroom.classroom_id)
      .eq("user_id", teacher.user.id)
      .maybeSingle();
    assert(
      !membershipError,
      `teacher owner membership lookup failed: ${summarizeSupabaseError(membershipError)}`,
    );
    assert(
      membership?.role === "teacher" && membership.status === "active",
      "teacher owner membership was not created",
    );

    const { error: studentCreateError } = await student.client.from("classrooms").insert({
      created_by: student.user.id,
      name: `Forbidden student classroom ${Date.now()}`,
      organization_id: organizationId,
      owner_id: student.user.id,
      subject: "Smoke test",
      updated_by: student.user.id,
    });
    assert(studentCreateError, "student unexpectedly created a classroom");
    console.log("PASS real teacher can create classroom and student create remains blocked");
  } finally {
    await teacher.client
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", classroom.classroom_id);
    await teacher.client
      .from("classrooms")
      .update({ status: "archived", updated_by: teacher.user.id })
      .eq("id", classroom.classroom_id);
  }
}

await runSourceSmoke();
await runLiveSmoke();
