import { randomUUID } from "node:crypto";
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
    console.log(
      `SKIP teacher progress UI smoke: ${label} credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `teacher progress UI smoke did not receive ${label} user`);
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
    `teacher progress profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "teacher progress smoke requires active teacher profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "teacher progress smoke teacher account must be teacher/admin/super_admin",
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
  assert(!error, `teacher progress org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "teacher progress smoke found no teacher org");
  return memberships[0].organization_id;
}

async function createClassroom({ organizationId, student, suffix, teacher }) {
  const { data: classroomRows, error: classroomError } =
    await teacher.client.rpc("create_teacher_classroom", {
      p_description: "Teacher progress UI smoke classroom",
      p_name: `Teacher progress smoke ${suffix}`,
      p_organization_id: organizationId,
      p_request_id: randomUUID(),
      p_subject: "Teacher progress UI smoke",
    });
  const classroom = Array.isArray(classroomRows)
    ? classroomRows[0]
    : classroomRows;
  assert(
    !classroomError && classroom?.classroom_id,
    `teacher progress classroom insert failed: ${summarizeSupabaseError(classroomError)}`,
  );

  if (student) {
    const { data: joinRows, error } = await student.client.rpc(
      "join_classroom_by_code",
      { join_code: classroom.display_code },
    );
    assert(
      !error && joinRows?.[0]?.classroom_id === classroom.classroom_id,
      `teacher progress classroom member insert failed: ${summarizeSupabaseError(error)}`,
    );
  }

  return classroom.classroom_id;
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const detailPage = await read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx");
  const listPage = await read("src/app/teacher/classrooms/[id]/assignments/page.tsx");
  assert(
    detailPage.includes("One row per active classroom student") &&
      detailPage.includes("Practice evidence") &&
      detailPage.includes("Draft assignment is teacher-only") &&
      listPage.includes("Open progress"),
    "teacher progress UI source must expose progress table, evidence copy, and list summaries",
  );
  console.log("PASS teacher progress UI source exposes progress summary and student table");

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "SKIP teacher progress UI smoke DB section: missing TEST_TEACHER or TEST_ADMIN credentials and TEST_STUDENT credentials.",
    );
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const student = await signIn(studentUsername, studentPassword, "student");
  if (!teacher || !student) return;

  const organizationId = await resolveOrganizationId(teacher.client, teacher.user.id);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanup = {
    assignments: [],
    classrooms: [],
    practiceSessions: [],
    questions: [],
  };

  try {
    const classroomId = await createClassroom({
      organizationId,
      student,
      suffix,
      teacher,
    });
    cleanup.classrooms.push(classroomId);

    const unrelatedClassroomId = await createClassroom({
      organizationId,
      student: null,
      suffix: `${suffix}-hidden`,
      teacher,
    });
    cleanup.classrooms.push(unrelatedClassroomId);

    const { data: question, error: questionError } = await teacher.client
      .from("questions")
      .insert({
        content_html: "<p>Solve: 2x + 3 = 7.</p>",
        content_source: "teacher-progress-ui-smoke",
        content_source_format: "html",
        difficulty_rating: 300,
        organization_id: organizationId,
        question_code: `TEACHER-PROGRESS-${suffix}`.toUpperCase().slice(0, 80),
        question_type: "frq",
        solution_html: "<p>x = 2.</p>",
        solution_source: "teacher-progress-ui-smoke",
        solution_source_format: "html",
        status: "published",
        title: "Teacher progress UI smoke question",
        created_by: teacher.user.id,
        updated_by: teacher.user.id,
      })
      .select("id")
      .single();
    assert(
      !questionError && question,
      `teacher progress question insert failed: ${summarizeSupabaseError(questionError)}`,
    );
    cleanup.questions.push(question.id);

    const { data: assignment, error: assignmentError } = await teacher.client
      .from("assignments")
      .insert({
        assigned_at: new Date().toISOString(),
        classroom_id: classroomId,
        created_by: teacher.user.id,
        instructions: "Teacher progress smoke assignment.",
        organization_id: organizationId,
        status: "assigned",
        title: `Teacher progress UI ${suffix}`,
      })
      .select("id")
      .single();
    assert(
      !assignmentError && assignment,
      `teacher progress assignment insert failed: ${summarizeSupabaseError(assignmentError)}`,
    );
    cleanup.assignments.push(assignment.id);

    const { data: hiddenAssignment, error: hiddenAssignmentError } = await teacher.client
      .from("assignments")
      .insert({
        assigned_at: new Date().toISOString(),
        classroom_id: unrelatedClassroomId,
        created_by: teacher.user.id,
        instructions: "Hidden teacher progress assignment.",
        organization_id: organizationId,
        status: "assigned",
        title: `Teacher progress hidden ${suffix}`,
      })
      .select("id")
      .single();
    assert(
      !hiddenAssignmentError && hiddenAssignment,
      `hidden teacher progress assignment insert failed: ${summarizeSupabaseError(hiddenAssignmentError)}`,
    );
    cleanup.assignments.push(hiddenAssignment.id);

    const { error: itemError } = await teacher.client.from("assignment_items").insert({
      assignment_id: assignment.id,
      item_type: "question",
      order_index: 1,
      points: 1,
      question_id: question.id,
    });
    assert(!itemError, `teacher progress assignment item insert failed: ${summarizeSupabaseError(itemError)}`);

    const { data: session, error: sessionError } = await student.client
      .from("practice_sessions")
      .insert({
        cache_prefix_version: "practice-session-v2",
        completed_question_ids: [question.id],
        goal: "Teacher progress UI smoke",
        organization_id: organizationId,
        session_memory: "",
        session_plan: {},
        session_state: {},
        session_thread_messages: [],
        tag_context: { confirmedTagIds: [], usefulTags: [], version: 1 },
        title: "Teacher progress UI smoke session",
        user_id: student.user.id,
      })
      .select("id")
      .single();
    assert(
      !sessionError && session,
      `teacher progress practice session insert failed: ${summarizeSupabaseError(sessionError)}`,
    );
    cleanup.practiceSessions.push(session.id);

    const { error: linkError } = await student.client.from("assignment_practice_sessions").insert({
      assignment_id: assignment.id,
      practice_session_id: session.id,
      student_id: student.user.id,
    });
    assert(!linkError, `teacher progress practice link insert failed: ${summarizeSupabaseError(linkError)}`);

    const { error: progressError } = await student.client
      .from("student_assignment_progress")
      .upsert(
        {
          assignment_id: assignment.id,
          evidence_summary: {
            attemptedQuestionCount: 1,
            completedQuestionIds: [question.id],
            source: "assignment_practice",
            totalQuestionCount: 1,
          },
          last_practice_session_id: session.id,
          started_at: new Date().toISOString(),
          status: "in_progress",
          student_id: student.user.id,
        },
        { onConflict: "assignment_id,student_id" },
      );
    assert(!progressError, `teacher progress progress upsert failed: ${summarizeSupabaseError(progressError)}`);

    const [{ data: members }, { data: progressRows }, { data: links }] = await Promise.all([
      teacher.client
        .from("classroom_members")
        .select("user_id")
        .eq("classroom_id", classroomId)
        .eq("role", "student")
        .eq("status", "active"),
      teacher.client
        .from("student_assignment_progress")
        .select("student_id, status, evidence_summary, last_practice_session_id")
        .eq("assignment_id", assignment.id),
      teacher.client
        .from("assignment_practice_sessions")
        .select("student_id, practice_session_id, created_at")
        .eq("assignment_id", assignment.id),
    ]);
    assert(members?.length === 1, "teacher progress smoke expected one active student");
    assert(
      progressRows?.[0]?.student_id === student.user.id &&
        progressRows[0].status === "in_progress" &&
        progressRows[0].last_practice_session_id === session.id,
      "teacher progress smoke did not preserve student progress evidence",
    );
    assert(links?.[0]?.practice_session_id === session.id, "teacher progress smoke did not preserve practice link");
    console.log("PASS teacher can read student progress and linked Practice evidence");

    const { data: hiddenRows, error: hiddenError } = await student.client
      .from("assignments")
      .select("id")
      .eq("id", hiddenAssignment.id);
    assert(!hiddenError, `teacher progress hidden assignment read errored: ${summarizeSupabaseError(hiddenError)}`);
    assert(!hiddenRows?.length, "student unexpectedly saw unrelated classroom assignment");
    console.log("PASS unrelated classroom assignment remains hidden from student");
  } finally {
    const cleanupErrors = [];
    for (const assignmentId of cleanup.assignments) {
      const { error } = await teacher.client.from("assignments").delete().eq("id", assignmentId);
      if (error) cleanupErrors.push(`assignment ${assignmentId}: ${summarizeSupabaseError(error)}`);
    }
    for (const sessionId of cleanup.practiceSessions) {
      const { error } = await student.client
        .from("practice_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", student.user.id);
      if (error) cleanupErrors.push(`practice session ${sessionId}: ${summarizeSupabaseError(error)}`);
    }
    for (const questionId of cleanup.questions) {
      const { error } = await teacher.client.from("questions").delete().eq("id", questionId);
      if (error) cleanupErrors.push(`question ${questionId}: ${summarizeSupabaseError(error)}`);
    }
    for (const classroomId of cleanup.classrooms) {
      const { data: studentMember, error: memberLookupError } = await teacher.client
        .from("classroom_members")
        .select("id")
        .eq("classroom_id", classroomId)
        .eq("user_id", student.user.id)
        .maybeSingle();
      if (memberLookupError) {
        cleanupErrors.push(
          `classroom member lookup ${classroomId}: ${summarizeSupabaseError(memberLookupError)}`,
        );
      } else if (studentMember?.id) {
        const { error: memberError } = await teacher.client.rpc(
          "set_classroom_student_membership_status",
          {
            p_classroom_id: classroomId,
            p_member_id: studentMember.id,
            p_status: "removed",
          },
        );
        if (memberError) {
          cleanupErrors.push(
            `classroom member ${classroomId}: ${summarizeSupabaseError(memberError)}`,
          );
        }
      }
      const { error } = await teacher.client
        .from("classrooms")
        .update({ status: "archived", updated_by: teacher.user.id })
        .eq("id", classroomId);
      if (error) cleanupErrors.push(`classroom ${classroomId}: ${summarizeSupabaseError(error)}`);
    }

    if (cleanupErrors.length) {
      throw new Error(`teacher progress UI smoke cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }

  console.log("PASS teacher progress UI smoke completed with scoped cleanup");
}

await main();
