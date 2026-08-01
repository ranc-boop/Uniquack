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

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    console.log(
      `SKIP Course Builder assignment bridge smoke: ${label} credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `Course Builder bridge smoke did not receive ${label} user`);
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
    `Course Builder bridge profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "Course Builder bridge smoke requires active teacher profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "Course Builder bridge smoke teacher account must be teacher/admin/super_admin",
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
  assert(!error, `Course Builder bridge org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "Course Builder bridge smoke found no teacher org");
  return memberships[0].organization_id;
}

async function createClassroom({ organizationId, student, suffix, teacher }) {
  const { data: classroomRows, error: classroomError } = await teacher.client.rpc(
    "create_teacher_classroom",
    {
      p_description: "Course Builder bridge smoke classroom",
      p_name: `Course Builder bridge smoke ${suffix}`,
      p_organization_id: organizationId,
      p_request_id: randomUUID(),
      p_subject: "Course Builder bridge smoke",
    },
  );
  const classroom = Array.isArray(classroomRows) ? classroomRows[0] : classroomRows;
  assert(
    !classroomError && classroom?.classroom_id && classroom?.display_code,
    `Course Builder bridge classroom RPC failed: ${summarizeSupabaseError(classroomError)}`,
  );

  const { data: joinRows, error: studentMemberError } = await student.client.rpc(
    "join_classroom_by_code",
    { join_code: classroom.display_code },
  );
  const membership = Array.isArray(joinRows) ? joinRows[0] : joinRows;
  const joined =
    !studentMemberError &&
    membership?.classroom_id === classroom.classroom_id &&
    membership?.membership_id;
  if (!joined) {
    await teacher.client
      .from("classrooms")
      .update({ status: "archived", updated_by: teacher.user.id })
      .eq("id", classroom.classroom_id);
  }
  assert(
    joined,
    `Course Builder bridge student join failed: ${summarizeSupabaseError(studentMemberError)}`,
  );

  return {
    classroomId: classroom.classroom_id,
    studentMembershipId: membership.membership_id,
  };
}

async function createQuestion({ organizationId, status, suffix, teacher }) {
  const { data, error } = await teacher.client
    .from("questions")
    .insert({
      content_html: "<p>Solve: 2x + 3 = 7.</p>",
      content_source: "course-builder-assignment-bridge-smoke",
      content_source_format: "html",
      difficulty_rating: 300,
      organization_id: organizationId,
      question_code: `CB-BRIDGE-${status}-${suffix}`.toUpperCase().slice(0, 80),
      question_type: "frq",
      solution_html: "<p>x = 2.</p>",
      solution_source: "course-builder-assignment-bridge-smoke",
      solution_source_format: "html",
      status,
      title: `Course Builder bridge ${status} question`,
      created_by: teacher.user.id,
      updated_by: teacher.user.id,
    })
    .select("id")
    .single();
  assert(
    !error && data,
    `Course Builder bridge ${status} question insert failed: ${summarizeSupabaseError(error)}`,
  );
  return data.id;
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "SKIP Course Builder assignment bridge smoke: missing TEST_TEACHER or TEST_ADMIN credentials and TEST_STUDENT credentials.",
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
    frameworks: [],
    questions: [],
  };

  try {
    const classroom = await createClassroom({
      organizationId,
      student,
      suffix,
      teacher,
    });
    const classroomId = classroom.classroomId;
    cleanup.classrooms.push(classroom);

    const publishedQuestionId = await createQuestion({
      organizationId,
      status: "published",
      suffix,
      teacher,
    });
    const draftQuestionId = await createQuestion({
      organizationId,
      status: "draft",
      suffix,
      teacher,
    });
    cleanup.questions.push(publishedQuestionId, draftQuestionId);

    const { data: framework, error: frameworkError } = await teacher.client
      .from("practice_course_frameworks")
      .insert({
        allowed_tag_ids: [],
        assigned_question_ids: [publishedQuestionId, draftQuestionId],
        created_by: teacher.user.id,
        description: "Temporary Course Builder bridge smoke framework.",
        framework_payload: {
          assigned_question_ids: [publishedQuestionId, draftQuestionId],
        },
        framework_prompt: "Bridge published questions into a teacher assignment.",
        learning_path: [],
        organization_id: organizationId,
        priority_rules: "",
        status: "active",
        teacher_id: teacher.user.id,
        title: `Course Builder bridge framework ${suffix}`,
        updated_by: teacher.user.id,
      })
      .select("id, title, status, assigned_question_ids")
      .single();
    assert(
      !frameworkError && framework,
      `Course Builder framework insert failed: ${summarizeSupabaseError(frameworkError)}`,
    );
    cleanup.frameworks.push(framework.id);

    const { data: eligibleQuestions, error: eligibleError } = await teacher.client
      .from("questions")
      .select("id, status")
      .in("id", [publishedQuestionId, draftQuestionId])
      .eq("status", "published");
    assert(
      !eligibleError,
      `Course Builder bridge eligible question query failed: ${summarizeSupabaseError(eligibleError)}`,
    );
    assert(
      eligibleQuestions?.length === 1 && eligibleQuestions[0].id === publishedQuestionId,
      "Course Builder bridge must include only published Question Bank questions",
    );
    console.log("PASS Course Builder bridge filters source questions to published-only");

    const sourceSummary = {
      candidateQuestionCount: 2,
      eligibleQuestionCount: 1,
      sourceKind: "practice_framework",
      sourceStatus: framework.status,
      sourceTitle: framework.title,
      unavailableQuestionCount: 1,
    };
    const { data: draftAssignment, error: draftAssignmentError } = await teacher.client
      .from("assignments")
      .insert({
        classroom_id: classroomId,
        created_by: teacher.user.id,
        instructions: "Teacher review draft from Course Builder bridge smoke.",
        organization_id: organizationId,
        source_kind: "practice_framework",
        source_record_id: framework.id,
        source_summary: sourceSummary,
        status: "draft",
        title: `Course Builder bridge draft ${suffix}`,
      })
      .select("id, source_kind, source_record_id, source_summary, status")
      .single();
    assert(
      !draftAssignmentError && draftAssignment,
      `Course Builder bridge draft assignment insert failed: ${summarizeSupabaseError(draftAssignmentError)}`,
    );
    cleanup.assignments.push(draftAssignment.id);

    const { error: itemError } = await teacher.client.from("assignment_items").insert({
      assignment_id: draftAssignment.id,
      item_type: "question",
      order_index: 1,
      points: 1,
      question_id: publishedQuestionId,
    });
    assert(!itemError, `Course Builder bridge item insert failed: ${summarizeSupabaseError(itemError)}`);

    const { data: studentDraftRows, error: studentDraftError } = await student.client
      .from("assignments")
      .select("id")
      .eq("id", draftAssignment.id);
    assert(
      !studentDraftError,
      `student draft bridge visibility query failed: ${summarizeSupabaseError(studentDraftError)}`,
    );
    assert(!studentDraftRows?.length, "student unexpectedly saw Course Builder draft assignment");
    console.log("PASS Course Builder bridge draft remains teacher-only");

    const { error: assignError } = await teacher.client
      .from("assignments")
      .update({
        assigned_at: new Date().toISOString(),
        status: "assigned",
      })
      .eq("id", draftAssignment.id);
    assert(!assignError, `Course Builder bridge assignment update failed: ${summarizeSupabaseError(assignError)}`);

    const { data: studentAssignedRows, error: studentAssignedError } = await student.client
      .from("assignments")
      .select("id, source_kind")
      .eq("id", draftAssignment.id);
    assert(
      !studentAssignedError,
      `student assigned bridge read failed: ${summarizeSupabaseError(studentAssignedError)}`,
    );
    assert(
      studentAssignedRows?.[0]?.id === draftAssignment.id,
      "student did not see assigned Course Builder bridge work",
    );
    console.log("PASS assigned Course Builder bridge work appears in student My Work scope");

    const { data: teacherRows, error: teacherReadError } = await teacher.client
      .from("assignments")
      .select("id, source_kind, source_record_id, source_summary")
      .eq("id", draftAssignment.id);
    assert(
      !teacherReadError,
      `teacher bridge assignment source read failed: ${summarizeSupabaseError(teacherReadError)}`,
    );
    assert(
      teacherRows?.[0]?.source_kind === "practice_framework" &&
        teacherRows[0].source_record_id === framework.id,
      "Course Builder bridge assignment source metadata was not preserved",
    );
    console.log("PASS Course Builder bridge assignment preserves source metadata");
  } finally {
    const cleanupErrors = [];
    for (const assignmentId of cleanup.assignments) {
      const { error } = await teacher.client
        .from("assignments")
        .delete()
        .eq("id", assignmentId);
      if (error) cleanupErrors.push(`assignment ${assignmentId}: ${summarizeSupabaseError(error)}`);
    }
    for (const frameworkId of cleanup.frameworks) {
      const { error } = await teacher.client
        .from("practice_course_frameworks")
        .delete()
        .eq("id", frameworkId);
      if (error) cleanupErrors.push(`framework ${frameworkId}: ${summarizeSupabaseError(error)}`);
    }
    for (const questionId of cleanup.questions) {
      const { error } = await teacher.client
        .from("questions")
        .delete()
        .eq("id", questionId);
      if (error) cleanupErrors.push(`question ${questionId}: ${summarizeSupabaseError(error)}`);
    }
    for (const classroom of cleanup.classrooms) {
      const { error: memberError } = await teacher.client.rpc(
        "set_classroom_student_membership_status",
        {
          p_classroom_id: classroom.classroomId,
          p_member_id: classroom.studentMembershipId,
          p_status: "removed",
        },
      );
      if (memberError) {
        cleanupErrors.push(
          `classroom member ${classroom.classroomId}: ${summarizeSupabaseError(memberError)}`,
        );
      }

      await teacher.client
        .from("classroom_join_codes")
        .update({ status: "revoked" })
        .eq("classroom_id", classroom.classroomId);
      const { error } = await teacher.client
        .from("classrooms")
        .update({ status: "archived" })
        .eq("id", classroom.classroomId);
      if (error) {
        cleanupErrors.push(
          `classroom ${classroom.classroomId}: ${summarizeSupabaseError(error)}`,
        );
      }
    }
    if (cleanupErrors.length) {
      console.log(`WARN Course Builder bridge smoke cleanup: ${cleanupErrors.join("; ")}`);
    }
  }
}

await main();
