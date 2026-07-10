import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local"), override: false });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// The disposable seed supplies this manager account. It keeps the smoke on the
// same clean-project identity as the established assignment evidence checks.
const teacherUsername = process.env.TEST_ADMIN_USERNAME ?? process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_ADMIN_PASSWORD ?? process.env.TEST_TEACHER_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code].filter(Boolean).join(" | ");
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function signIn(username, password, label) {
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  assert(!error && data.user?.id, `${label} sign-in failed: ${summarizeSupabaseError(error)}`);
  return { client, user: data.user };
}

async function resolveOrganizationId(teacher) {
  const { data: profile, error: profileError } = await teacher.client
    .from("profiles")
    .select("id, default_organization_id, role, status")
    .eq("id", teacher.user.id)
    .single();
  assert(!profileError, `teacher profile lookup failed: ${summarizeSupabaseError(profileError)}`);
  assert(profile?.status === "active", "feedback smoke requires an active teacher profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile?.role),
    "feedback smoke requires a teacher/admin profile",
  );

  if (profile.default_organization_id) return profile.default_organization_id;

  const { data: membership, error } = await teacher.client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", teacher.user.id)
    .eq("status", "active")
    .in("role", ["teacher", "admin"])
    .limit(1)
    .maybeSingle();
  assert(!error && membership?.organization_id, "feedback smoke found no teacher organization");
  return membership.organization_id;
}

async function createSmokeFixture({ organizationId, teacher, student, unrelatedTeacher }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: classroom, error: classroomError } = await teacher.client
    .from("classrooms")
    .insert({
      created_by: teacher.user.id,
      name: `Feedback notes smoke ${suffix}`,
      organization_id: organizationId,
      owner_id: teacher.user.id,
      subject: "Teacher feedback notes smoke",
      updated_by: teacher.user.id,
    })
    .select("id, organization_id")
    .single();
  assert(
    !classroomError && classroom?.id,
    `classroom create failed: ${summarizeSupabaseError(classroomError)}`,
  );

  const { error: teacherMemberError } = await teacher.client.from("classroom_members").insert({
    classroom_id: classroom.id,
    joined_at: new Date().toISOString(),
    role: "teacher",
    status: "active",
    user_id: teacher.user.id,
  });
  assert(
    !teacherMemberError,
    `teacher membership failed: ${summarizeSupabaseError(teacherMemberError)}`,
  );

  const { error: studentMemberError } = await teacher.client.from("classroom_members").insert([
    {
      classroom_id: classroom.id,
      joined_at: new Date().toISOString(),
      role: "student",
      status: "active",
      user_id: student.user.id,
    },
    {
      classroom_id: classroom.id,
      joined_at: new Date().toISOString(),
      role: "student",
      status: "active",
      user_id: unrelatedTeacher.user.id,
    },
  ]);
  assert(!studentMemberError, `student memberships failed: ${summarizeSupabaseError(studentMemberError)}`);

  const { data: assignment, error: assignmentError } = await teacher.client
    .from("assignments")
    .insert({
      assigned_at: new Date().toISOString(),
      classroom_id: classroom.id,
      created_by: teacher.user.id,
      due_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: "Feedback smoke fixture.",
      organization_id: classroom.organization_id,
      status: "assigned",
      title: `Feedback notes assignment ${suffix}`,
    })
    .select("id")
    .single();
  assert(!assignmentError && assignment, `assignment create failed: ${summarizeSupabaseError(assignmentError)}`);

  return { assignment, classroomId: classroom.id };
}

async function main() {
  const [migration, actions, helper, teacherPage, studentPage, smokeAll] = await Promise.all([
    read("supabase/clean-migrations/0032_teacher_feedback_notes.sql"),
    read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/feedback-actions.ts"),
    read("src/lib/teacher-feedback-notes.ts"),
    read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx"),
    read("src/app/student/work/[id]/page.tsx"),
    read("scripts/smoke-all.mjs"),
  ]);
  const normalizedTeacherPage = teacherPage.replace(/\s+/g, " ");
  const normalizedStudentPage = studentPage.replace(/\s+/g, " ");

  assert(
    migration.includes("create table if not exists public.teacher_feedback_notes") &&
      migration.includes("visibility in ('private_teacher', 'sent_to_student')") &&
      migration.includes("status in ('draft', 'sent', 'archived')") &&
      migration.includes("private.can_manage_teacher_feedback_assignment") &&
      migration.includes("teacher_feedback_notes_student_sent_read") &&
      migration.includes("teacher_feedback_notes_teacher_insert") &&
      migration.includes("teacher_feedback_notes_teacher_update") &&
      migration.includes("teacher_feedback_notes_teacher_delete") &&
      migration.includes("student_id = auth.uid()") &&
      migration.includes("assignment.status = 'assigned'") &&
      migration.includes("p_organization_id uuid") &&
      migration.includes("assignment.organization_id = p_organization_id") &&
      !migration.includes("to anon"),
    "feedback migration must bind assignment, classroom, and organization scope with teacher-only and sent-student RLS boundaries",
  );

  assert(
    actions.includes("requireTeacher") &&
      actions.includes("assertFeedbackScope") &&
      actions.includes("assignment_practice_sessions") &&
      actions.includes("teacher_feedback_notes") &&
      actions.includes("private_teacher") &&
      actions.includes("sent_to_student") &&
      actions.includes("revalidatePath(`/student/work/${parsed.assignmentId}`)") &&
      !actions.includes("AI_PROVIDER") &&
      !actions.includes("createServiceRoleClient") &&
      !actions.includes("source_bank_id"),
    "feedback actions must be teacher-guarded, assignment-linked, provider-free, and server-side",
  );

  assert(
    helper.includes('import "server-only"') &&
      helper.includes("listTeacherAssignmentFeedbackNotes") &&
      helper.includes("listStudentSentAssignmentFeedbackNotes") &&
      helper.includes('.eq("visibility", "sent_to_student")') &&
      helper.includes('.eq("status", "sent")') &&
      helper.includes(".limit(") &&
      !helper.includes('.select("*")') &&
      !helper.includes("source_bank_id") &&
      !helper.includes("AI_PROVIDER"),
    "feedback readers must be bounded, server-only, and limited to sent student feedback",
  );

  assert(
    normalizedTeacherPage.includes("Teacher feedback notes") &&
      normalizedTeacherPage.includes("Save private note") &&
      normalizedTeacherPage.includes("Send to student") &&
      normalizedTeacherPage.includes("Private teacher note") &&
      normalizedTeacherPage.includes("Sent to student") &&
      normalizedStudentPage.includes("Teacher feedback") &&
      normalizedStudentPage.includes("Feedback your teacher explicitly sent") &&
      normalizedStudentPage.includes("Private teacher notes are not shown here") &&
      smokeAll.includes("./teacher-feedback-notes-mvp-smoke.mjs"),
    "teacher and student UI must distinguish private notes from explicitly sent feedback",
  );

  console.log("PASS teacher feedback notes source checks");

  if (process.argv.includes("--source-only")) {
    console.log("SKIP teacher feedback notes live smoke: source-only mode.");
    return;
  }

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !teacherUsername ||
    !teacherPassword ||
    !studentUsername ||
    !studentPassword ||
    !unrelatedTeacherUsername ||
    !unrelatedTeacherPassword
  ) {
    console.log("SKIP teacher feedback notes live smoke: required disposable test credentials are unavailable.");
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const student = await signIn(studentUsername, studentPassword, "student");
  const unrelatedTeacher = await signIn(
    unrelatedTeacherUsername,
    unrelatedTeacherPassword,
    "unrelated teacher",
  );
  const anonymous = createClient(supabaseUrl, supabaseAnonKey);
  const organizationId = await resolveOrganizationId(teacher);
  const cleanup = { assignmentId: null, classroomId: null, noteIds: [] };

  try {
    const fixture = await createSmokeFixture({
      organizationId,
      teacher,
      student,
      unrelatedTeacher,
    });
    cleanup.assignmentId = fixture.assignment.id;
    cleanup.classroomId = fixture.classroomId;

    const { data: privateNote, error: privateNoteError } = await teacher.client
      .from("teacher_feedback_notes")
      .insert({
        assignment_id: fixture.assignment.id,
        author_id: teacher.user.id,
        body: "Private teacher observation for the assigned work.",
        classroom_id: fixture.classroomId,
        organization_id: organizationId,
        status: "draft",
        student_id: student.user.id,
        visibility: "private_teacher",
      })
      .select("id")
      .single();
    assert(!privateNoteError && privateNote, `private note create failed: ${summarizeSupabaseError(privateNoteError)}`);
    cleanup.noteIds.push(privateNote.id);
    console.log("PASS teacher can create private feedback note");

    const { data: sentNote, error: sentNoteError } = await teacher.client
      .from("teacher_feedback_notes")
      .insert({
        assignment_id: fixture.assignment.id,
        author_id: teacher.user.id,
        body: "Review the first step, then try the assigned question again.",
        classroom_id: fixture.classroomId,
        organization_id: organizationId,
        sent_at: new Date().toISOString(),
        status: "sent",
        student_id: student.user.id,
        visibility: "sent_to_student",
      })
      .select("id")
      .single();
    assert(!sentNoteError && sentNote, `sent feedback create failed: ${summarizeSupabaseError(sentNoteError)}`);
    cleanup.noteIds.push(sentNote.id);
    console.log("PASS teacher can send student-visible feedback");

    const { data: otherStudentNote, error: otherStudentNoteError } = await teacher.client
      .from("teacher_feedback_notes")
      .insert({
        assignment_id: fixture.assignment.id,
        author_id: teacher.user.id,
        body: "Feedback for a different active classroom student.",
        classroom_id: fixture.classroomId,
        organization_id: organizationId,
        sent_at: new Date().toISOString(),
        status: "sent",
        student_id: unrelatedTeacher.user.id,
        visibility: "sent_to_student",
      })
      .select("id")
      .single();
    assert(
      !otherStudentNoteError && otherStudentNote,
      `other-student feedback create failed: ${summarizeSupabaseError(otherStudentNoteError)}`,
    );
    cleanup.noteIds.push(otherStudentNote.id);

    const { data: studentVisible, error: studentVisibleError } = await student.client
      .from("teacher_feedback_notes")
      .select("id, body")
      .eq("assignment_id", fixture.assignment.id);
    assert(!studentVisibleError, `student sent feedback read failed: ${summarizeSupabaseError(studentVisibleError)}`);
    assert(
      studentVisible?.length === 1 && studentVisible[0]?.id === sentNote.id,
      "student must read only their own sent feedback",
    );
    console.log("PASS student can read own sent feedback and cannot read private or other-student feedback");

    const { data: unrelatedTeacherRead, error: unrelatedTeacherReadError } = await unrelatedTeacher.client
      .from("teacher_feedback_notes")
      .select("id")
      .eq("id", sentNote.id);
    assert(
      !unrelatedTeacherReadError && unrelatedTeacherRead?.length === 0,
      "unrelated teacher must not read feedback for a classroom they do not manage",
    );
    console.log("PASS unrelated teacher is blocked from assignment feedback");

    const { data: anonymousRead, error: anonymousReadError } = await anonymous
      .from("teacher_feedback_notes")
      .select("id")
      .eq("id", sentNote.id);
    assert(
      !anonymousReadError && anonymousRead?.length === 0,
      "anonymous user must not read assignment feedback",
    );
    console.log("PASS anonymous user is blocked from assignment feedback");
  } finally {
    if (cleanup.noteIds.length) {
      await teacher.client.from("teacher_feedback_notes").delete().in("id", cleanup.noteIds);
    }
    if (cleanup.assignmentId) {
      await teacher.client.from("assignments").delete().eq("id", cleanup.assignmentId);
    }
    if (cleanup.classroomId) {
      await teacher.client.from("classrooms").delete().eq("id", cleanup.classroomId);
    }
    console.log("PASS teacher feedback notes smoke cleanup removed fixture rows");
  }
}

await main();
