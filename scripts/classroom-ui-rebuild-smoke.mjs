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

function usesMessageKeys(source, ...keys) {
  return keys.every((key) => source.includes(`"${key}"`));
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
      `SKIP classroom UI live smoke: ${label} credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `classroom UI smoke did not receive ${label} user`);
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
    `classroom UI smoke profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "classroom UI smoke requires active teacher profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "classroom UI smoke teacher account must be teacher/admin/super_admin",
  );

  if (profile.default_organization_id) return profile.default_organization_id;

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["teacher", "admin"])
    .limit(1);
  assert(!error, `classroom UI smoke org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "classroom UI smoke found no teacher org");
  return memberships[0].organization_id;
}

async function runSourceSmoke() {
  const listPage = await read("src/app/teacher/classrooms/page.tsx");
  const overviewPage = await read("src/app/teacher/classrooms/[id]/page.tsx");
  const peoplePage = await read("src/app/teacher/classrooms/[id]/people/page.tsx");
  const studentsPage = await read("src/app/teacher/classrooms/[id]/students/page.tsx");
  const teachersPage = await read("src/app/teacher/classrooms/[id]/teachers/page.tsx");
  const assignmentsPage = await read("src/app/teacher/classrooms/[id]/assignments/page.tsx");
  const analyticsPage = await read("src/app/teacher/classrooms/[id]/analytics/page.tsx");
  const blueprintsPage = await read("src/app/teacher/classrooms/[id]/blueprints/page.tsx");
  const settingsPage = await read("src/app/teacher/classrooms/[id]/settings/page.tsx");
  const classroomUi = await read("src/app/teacher/classrooms/classroom-ui.tsx");
  const classroomActions = await read("src/app/teacher/classrooms/actions.ts");
  const classroomHelpers = await read("src/lib/teacher-classrooms.ts");

  assert(
    usesMessageKeys(
      listPage,
      "classroom.title",
      "classroom.openContext",
      "classroom.create",
      "classroom.classCompletion",
      "classroom.latestAssignment",
    ) &&
      usesMessageKeys(classroomUi, "classroom.publishToClasses") &&
      usesMessageKeys(
        listPage,
        "classroom.yourClasses",
        "classroom.noClassesDescription",
      ),
    "/teacher/classrooms must render a Google-Classroom-like card grid with publish handoff",
  );
  assert(
    classroomHelpers.includes("listTeacherClassroomSummaries") &&
      classroomHelpers.includes("completionRate") &&
      classroomHelpers.includes("student_assignment_progress") &&
      classroomHelpers.includes("bank_blueprints") &&
      classroomHelpers.includes("assignment_practice_sessions"),
    "classroom helper must compute bounded roster, assignment, completion, and blueprint context",
  );
  for (const key of [
    "classroom.overview",
    "classroom.assignments",
    "classroom.students",
    "classroom.teachers",
    "classroom.progress",
    "classroom.blueprints",
    "classroom.settings",
  ]) {
    assert(usesMessageKeys(classroomUi, key), `classroom route tabs missing ${key}`);
  }
  assert(
    usesMessageKeys(
      overviewPage,
      "classroomOverview.recentAssignments",
      "classroomOverview.joinCodeRosterDescription",
      "classroomOverview.studentsNeedingAttention",
      "classroomOverview.classTeam",
      "classroomOverview.openBlueprintLibrary",
    ),
    "classroom overview must show stats, join code, recent assignments, attention, and blueprint context",
  );
  assert(
    peoplePage.includes("/students") &&
      usesMessageKeys(
        studentsPage,
        "classroomStudents.removeFromActiveRoster",
        "classroomStudents.removeConfirmation",
        "classroomStudents.rosterDescription",
      ) &&
      studentsPage.includes("restoreClassroomStudent") &&
      classroomActions.includes("createClassroomJoinCode") &&
      classroomActions.includes("rotateClassroomJoinCode") &&
      classroomActions.includes("disableClassroomJoining") &&
      classroomActions.includes("hashClassroomJoinCode") &&
      classroomActions.includes("removeClassroomStudent") &&
      classroomActions.includes("set_classroom_student_membership_status"),
    "Students section must show roster boundary copy, join-code recovery, and safe soft-remove action",
  );
  assert(
    usesMessageKeys(
        teachersPage,
        "classroomTeachers.addCoTeacher",
        "classroomTeachers.teamDescription",
      ) &&
      classroomActions.includes("addClassroomCoTeacher") &&
      classroomActions.includes("removeClassroomCoTeacher") &&
      !classroomActions.includes("bank_members"),
    "Teachers section must manage co-teachers without granting source bank membership",
  );
  assert(
    usesMessageKeys(
      assignmentsPage,
      "assignments.deliveryHistoryDescription",
      "assignments.publishNewWork",
    ),
    "Assignments section must remain history/detail and point to top-level Publish",
  );
  assert(
    usesMessageKeys(
      analyticsPage,
      "classroomAnalytics.title",
      "classroomAnalytics.assignmentCompletionSummaries",
      "classroomAnalytics.summaryDescription",
      "classroomAnalytics.noAnalyticsDescription",
    ) &&
    analyticsPage.includes("progressSummary") &&
    analyticsPage.includes("linkedPracticeSessionCount") &&
    !analyticsPage.includes("Feedback drafting"),
    "Analytics / Feedback must show real bounded summaries, live assignment feedback, and honest placeholders",
  );
  assert(
    usesMessageKeys(
        blueprintsPage,
        "classroomBlueprints.noLinkedTitle",
        "classroomBlueprints.openLibrary",
      ) &&
      !blueprintsPage.includes("generate original"),
    "Linked Blueprints section must not implement blueprint generation",
  );
  assert(
    usesMessageKeys(
        settingsPage,
        "classroomSettings.joinCodeLifecycle",
        "classroomSettings.archive",
        "classroomSettings.reopen",
      ) &&
      classroomActions.includes("archiveClassroom") &&
      classroomActions.includes("reopenClassroom") &&
      classroomActions.includes('status: "archived"'),
    "Settings must expose safe identity, join-code, archive, and reopen lifecycle behavior",
  );
  assert(
    !listPage.includes("Google Classroom integration") &&
      !overviewPage.includes("wearable") &&
      !analyticsPage.includes("provider"),
    "classroom UI rebuild must not add non-goal integrations",
  );

  console.log("PASS classroom UI rebuild source checks");
}

async function runLiveSmoke() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("SKIP classroom UI live smoke: missing Supabase URL/anon key.");
    return;
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "SKIP classroom UI live smoke: missing TEST_TEACHER or TEST_ADMIN credentials and TEST_STUDENT credentials.",
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
      p_description: "Classroom UI rebuild smoke classroom",
      p_name: `Classroom UI smoke ${Date.now()}`,
      p_organization_id: organizationId,
      p_request_id: randomUUID(),
      p_subject: "Smoke test",
    },
  );

  if (createError?.message?.includes("function public.create_teacher_classroom")) {
    console.log("SKIP classroom UI live smoke: migration 0043 is not applied remotely.");
    return;
  }

  assert(!createError, `teacher classroom RPC failed: ${summarizeSupabaseError(createError)}`);
  const classroom = Array.isArray(classroomRows) ? classroomRows[0] : classroomRows;
  assert(classroom?.classroom_id, "teacher classroom RPC did not return a classroom id");
  assert(classroom?.display_code, "teacher classroom RPC did not return display join code");

  try {
    const { data: teacherRead, error: teacherReadError } = await teacher.client
      .from("classrooms")
      .select("id, name")
      .eq("id", classroom.classroom_id)
      .maybeSingle();
    assert(
      !teacherReadError,
      `teacher classroom read failed: ${summarizeSupabaseError(teacherReadError)}`,
    );
    assert(teacherRead?.id === classroom.classroom_id, "teacher cannot read created classroom");

    const { data: studentRead, error: studentReadError } = await student.client
      .from("classrooms")
      .select("id")
      .eq("id", classroom.classroom_id);
    assert(
      !studentReadError,
      `student unrelated classroom read errored unexpectedly: ${summarizeSupabaseError(
        studentReadError,
      )}`,
    );
    assert(
      (studentRead ?? []).length === 0,
      "student unexpectedly read a teacher classroom before joining",
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
    console.log("PASS classroom UI live teacher/student boundary checks");
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
