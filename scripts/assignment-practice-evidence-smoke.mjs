import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

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
      `SKIP assignment practice evidence smoke: ${label} credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `assignment practice smoke did not receive ${label} user`);
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
    `assignment practice profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "assignment practice smoke requires active teacher profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "assignment practice smoke teacher account must be teacher/admin/super_admin",
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
  assert(!error, `assignment practice org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "assignment practice smoke found no teacher org");
  return memberships[0].organization_id;
}

async function createSmokeClassroom({ name, organizationId, student, teacher }) {
  const { data: classroomRows, error: classroomError } =
    await teacher.client.rpc("create_teacher_classroom", {
      p_description: "Assignment practice evidence smoke classroom",
      p_name: name,
      p_organization_id: organizationId,
      p_request_id: randomUUID(),
      p_subject: "Assignment practice evidence smoke",
    });
  const createdClassroom = Array.isArray(classroomRows)
    ? classroomRows[0]
    : classroomRows;
  const classroom = createdClassroom?.classroom_id
    ? { id: createdClassroom.classroom_id, name }
    : null;
  assert(
    !classroomError && classroom,
    `teacher could not create evidence smoke classroom: ${summarizeSupabaseError(classroomError)}`,
  );

  const { data: joinRows, error: studentMemberError } =
    await student.client.rpc("join_classroom_by_code", {
      join_code: createdClassroom.display_code,
    });
  assert(
    !studentMemberError && joinRows?.[0]?.classroom_id === classroom.id,
    `student join failed: ${summarizeSupabaseError(studentMemberError)}`,
  );

  return classroom;
}

async function main() {
  const [
    assignmentLinkage,
    gradeRoute,
    practiceClient,
    practiceTools,
  ] = await Promise.all([
    read("src/lib/practice/assignment-linkage.ts"),
    read("src/app/api/practice/grade/route.ts"),
    read("src/components/practice/practice-agent-client.tsx"),
    read("src/lib/practice/tools.ts"),
  ]);

  assert(
    assignmentLinkage.includes("startAssignmentPractice") &&
      assignmentLinkage.includes(".from(\"assignment_items\")") &&
      assignmentLinkage.includes(".from(\"questions\")") &&
      !assignmentLinkage.includes('.eq("status", "published")') &&
      practiceClient.includes("/api/practice/assignments/start") &&
      practiceClient.includes("/api/practice/grade") &&
      practiceClient.includes("reviewFromGradeFallback") &&
      gradeRoute.includes("persistQuestionReviewResults") &&
      gradeRoute.includes("updateLinkedAssignmentProgressAfterPractice") &&
      !/function loadQuestionForHint[\s\S]*?\.eq\("status",\s*"published"\)/.test(practiceTools),
    "assignment practice runtime must load assigned bank-private questions, support hint lookup by RLS, and persist deterministic grade fallback evidence",
  );
  console.log("PASS assignment practice static checks cover bank-private start, hints, and grade fallback");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log(
      "BLOCKED assignment Practice evidence live smoke: required disposable Supabase process-environment categories are missing.",
    );
    return;
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "BLOCKED assignment Practice evidence live smoke: required disposable Teacher and Student process-environment credentials are missing.",
    );
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const student = await signIn(studentUsername, studentPassword, "student");

  if (!teacher || !student) {
    return;
  }

  const organizationId = await resolveOrganizationId(teacher.client, teacher.user.id);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanup = {
    assignments: [],
    classrooms: [],
    practiceSessions: [],
    questions: [],
  };

  try {
    const classroom = await createSmokeClassroom({
      name: `Assignment practice evidence classroom ${suffix}`,
      organizationId,
      student,
      teacher,
    });
    cleanup.classrooms.push(classroom.id);

    const { data: question, error: questionError } = await teacher.client
      .from("questions")
      .insert({
        content_html: "<p>Solve: 2x + 3 = 7.</p>",
        content_source: "assignment-practice-evidence-smoke",
        content_source_format: "html",
        difficulty_rating: 300,
        organization_id: organizationId,
        question_code: `ASSIGN-PRACTICE-SMOKE-${suffix}`.toUpperCase().slice(0, 80),
        question_type: "frq",
        solution_html: "<p>x = 2.</p>",
        solution_source: "assignment-practice-evidence-smoke",
        solution_source_format: "html",
        status: "published",
        title: "Assignment practice evidence smoke question",
        created_by: teacher.user.id,
        updated_by: teacher.user.id,
      })
      .select("id")
      .single();
    assert(
      !questionError && question,
      `published question insert failed: ${summarizeSupabaseError(questionError)}`,
    );
    cleanup.questions.push(question.id);

    const { data: assignment, error: assignmentError } = await teacher.client
      .from("assignments")
      .insert({
        assigned_at: new Date().toISOString(),
        classroom_id: classroom.id,
        created_by: teacher.user.id,
        due_at: new Date(Date.now() + 86400000).toISOString(),
        instructions: "Open Practice from My Work.",
        organization_id: organizationId,
        status: "assigned",
        title: `Assignment practice evidence ${suffix}`,
      })
      .select("id, title")
      .single();
    assert(
      !assignmentError && assignment,
      `assignment insert failed: ${summarizeSupabaseError(assignmentError)}`,
    );
    cleanup.assignments.push(assignment.id);

    const { error: itemError } = await teacher.client.from("assignment_items").insert({
      assignment_id: assignment.id,
      item_type: "question",
      order_index: 1,
      points: 1,
      question_id: question.id,
    });
    assert(!itemError, `assignment item insert failed: ${summarizeSupabaseError(itemError)}`);

    const { data: practiceSession, error: sessionError } = await student.client
      .from("practice_sessions")
      .insert({
        cache_prefix_version: "practice-session-v2",
        completed_question_ids: [question.id],
        goal: `Assignment: ${assignment.title}`,
        organization_id: organizationId,
        session_memory: "",
        session_plan: {},
        session_state: {},
        session_thread_messages: [],
        tag_context: { confirmedTagIds: [], usefulTags: [], version: 1 },
        title: assignment.title,
        user_id: student.user.id,
      })
      .select("id")
      .single();
    assert(
      !sessionError && practiceSession,
      `student practice session insert failed: ${summarizeSupabaseError(sessionError)}`,
    );
    cleanup.practiceSessions.push(practiceSession.id);

    const { error: linkError } = await student.client.from("assignment_practice_sessions").insert({
      assignment_id: assignment.id,
      practice_session_id: practiceSession.id,
      student_id: student.user.id,
    });
    assert(!linkError, `student assignment session link failed: ${summarizeSupabaseError(linkError)}`);
    console.log("PASS student can link an assignment to an owned practice session");

    const { data: progress, error: progressError } = await student.client
      .from("student_assignment_progress")
      .upsert(
        {
          assignment_id: assignment.id,
          completed_at: new Date().toISOString(),
          evidence_summary: {
            attemptedQuestionCount: 1,
            completedQuestionIds: [question.id],
            linkedPracticeSessionId: practiceSession.id,
            source: "assignment_practice",
            totalQuestionCount: 1,
          },
          last_practice_session_id: practiceSession.id,
          started_at: new Date().toISOString(),
          status: "completed",
          student_id: student.user.id,
        },
        { onConflict: "assignment_id,student_id" },
      )
      .select("assignment_id, student_id, status, last_practice_session_id, evidence_summary")
      .single();
    assert(
      !progressError && progress?.status === "completed",
      `student assignment progress evidence failed: ${summarizeSupabaseError(progressError)}`,
    );
    assert(
      progress.last_practice_session_id === practiceSession.id &&
        progress.evidence_summary?.source === "assignment_practice",
      "student assignment progress did not preserve practice evidence",
    );
    console.log("PASS student can update assignment progress with practice evidence");

    const { data: teacherProgress, error: teacherProgressError } = await teacher.client
      .from("student_assignment_progress")
      .select("assignment_id, status, last_practice_session_id, evidence_summary")
      .eq("assignment_id", assignment.id)
      .eq("student_id", student.user.id)
      .single();
    assert(
      !teacherProgressError && teacherProgress?.last_practice_session_id === practiceSession.id,
      `teacher could not read assignment practice evidence: ${summarizeSupabaseError(teacherProgressError)}`,
    );
    console.log("PASS teacher can read linked assignment practice evidence");
  } finally {
    const cleanupErrors = [];
    for (const assignmentId of cleanup.assignments) {
      const { error } = await teacher.client
        .from("assignments")
        .delete()
        .eq("id", assignmentId);
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
      const { error } = await teacher.client
        .from("questions")
        .delete()
        .eq("id", questionId)
        .eq("organization_id", organizationId);
      if (error) cleanupErrors.push(`question ${questionId}: ${summarizeSupabaseError(error)}`);
    }
    for (const classroomId of cleanup.classrooms) {
      const { data: studentMember, error: memberLookupError } =
        await teacher.client
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
      throw new Error(`assignment practice evidence smoke cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }

  console.log("PASS assignment practice evidence smoke completed with scoped cleanup");
}

await main();
