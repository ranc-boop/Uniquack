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
      `SKIP teacher assignment smoke: ${label} credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `teacher assignment smoke did not receive ${label} user`);
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
    `teacher assignment profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "teacher assignment smoke requires active teacher profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "teacher assignment smoke teacher account must be teacher/admin/super_admin",
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
  assert(!error, `teacher assignment org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "teacher assignment smoke found no teacher org");
  return memberships[0].organization_id;
}

async function createSmokeClassroom({ name, organizationId, student, teacher }) {
  const { data: classroomRows, error: classroomError } =
    await teacher.client.rpc("create_teacher_classroom", {
      p_description: "Teacher assignment flow smoke classroom",
      p_name: name,
      p_organization_id: organizationId,
      p_request_id: randomUUID(),
      p_subject: "Teacher assignment smoke",
    });
  const createdClassroom = Array.isArray(classroomRows)
    ? classroomRows[0]
    : classroomRows;
  const classroom = createdClassroom?.classroom_id
    ? { id: createdClassroom.classroom_id, name }
    : null;
  assert(
    !classroomError && classroom,
    `teacher could not create assignment smoke classroom: ${summarizeSupabaseError(classroomError)}`,
  );

  if (student) {
    const { data: joinRows, error: studentMemberError } =
      await student.client.rpc("join_classroom_by_code", {
        join_code: createdClassroom.display_code,
      });
    assert(
      !studentMemberError && joinRows?.[0]?.classroom_id === classroom.id,
      `student join failed: ${summarizeSupabaseError(studentMemberError)}`,
    );
  }

  return classroom;
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "SKIP teacher assignment smoke: missing TEST_TEACHER or TEST_ADMIN credentials and TEST_STUDENT credentials.",
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
    questions: [],
  };

  try {
    const classroom = await createSmokeClassroom({
      name: `Teacher assignment smoke classroom ${suffix}`,
      organizationId,
      student,
      teacher,
    });
    cleanup.classrooms.push(classroom.id);

    const unrelatedClassroom = await createSmokeClassroom({
      name: `Teacher assignment unrelated classroom ${suffix}`,
      organizationId,
      student: null,
      teacher,
    });
    cleanup.classrooms.push(unrelatedClassroom.id);

    const { data: question, error: questionError } = await teacher.client
      .from("questions")
      .insert({
        content_html: "<p>Solve: 2x + 3 = 7.</p>",
        content_source: "teacher-assignment-flow-smoke",
        content_source_format: "html",
        difficulty_rating: 300,
        organization_id: organizationId,
        question_code: `TEACHER-ASSIGN-SMOKE-${suffix}`.toUpperCase().slice(0, 80),
        question_type: "frq",
        solution_html: "<p>x = 2.</p>",
        solution_source: "teacher-assignment-flow-smoke",
        solution_source_format: "html",
        status: "published",
        title: "Teacher assignment smoke question",
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

    const { data: draftAssignment, error: draftError } = await teacher.client
      .from("assignments")
      .insert({
        classroom_id: classroom.id,
        created_by: teacher.user.id,
        instructions: "Draft should stay teacher-side.",
        organization_id: organizationId,
        status: "draft",
        title: `Teacher assignment draft ${suffix}`,
      })
      .select("id")
      .single();
    assert(
      !draftError && draftAssignment,
      `draft assignment insert failed: ${summarizeSupabaseError(draftError)}`,
    );
    cleanup.assignments.push(draftAssignment.id);

    const { data: draftStudentRows, error: draftStudentError } = await student.client
      .from("assignments")
      .select("id")
      .eq("id", draftAssignment.id);
    assert(
      !draftStudentError,
      `student draft visibility query failed: ${summarizeSupabaseError(draftStudentError)}`,
    );
    assert(!draftStudentRows?.length, "student unexpectedly saw teacher draft assignment");
    console.log("PASS draft assignments remain teacher-side");

    const { data: assignment, error: assignmentError } = await teacher.client
      .from("assignments")
      .insert({
        assigned_at: new Date().toISOString(),
        classroom_id: classroom.id,
        created_by: teacher.user.id,
        due_at: new Date(Date.now() + 86400000).toISOString(),
        instructions: "Complete the assigned smoke question.",
        organization_id: organizationId,
        status: "assigned",
        title: `Teacher assignment flow ${suffix}`,
      })
      .select("id, title, status")
      .single();
    assert(
      !assignmentError && assignment,
      `assigned assignment insert failed: ${summarizeSupabaseError(assignmentError)}`,
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
    console.log("PASS teacher can create assigned classroom work from a published question");

    const { data: teacherAssignments, error: teacherListError } = await teacher.client
      .from("assignments")
      .select("id, classroom_id, title, status")
      .eq("classroom_id", classroom.id)
      .eq("id", assignment.id);
    assert(
      !teacherListError,
      `teacher assignment list failed: ${summarizeSupabaseError(teacherListError)}`,
    );
    assert(teacherAssignments?.[0]?.id === assignment.id, "teacher could not list created assignment");
    console.log("PASS teacher can list created assignment");

    const { data: teacherItems, error: teacherDetailError } = await teacher.client
      .from("assignment_items")
      .select("id, question_id, assignment_id")
      .eq("assignment_id", assignment.id);
    assert(
      !teacherDetailError,
      `teacher assignment detail failed: ${summarizeSupabaseError(teacherDetailError)}`,
    );
    assert(teacherItems?.[0]?.question_id === question.id, "teacher detail did not include question item");
    console.log("PASS teacher can inspect assignment detail items");

    const { data: studentAssignments, error: studentAssignmentError } = await student.client
      .from("assignments")
      .select("id, title, classroom_id, status")
      .eq("id", assignment.id);
    assert(
      !studentAssignmentError,
      `student assignment read failed: ${summarizeSupabaseError(studentAssignmentError)}`,
    );
    assert(studentAssignments?.[0]?.id === assignment.id, "student did not see assigned work");
    console.log("PASS student sees assigned teacher work in My Work scope");

    const { data: studentItems, error: studentItemError } = await student.client
      .from("assignment_items")
      .select("id, assignment_id, question_id, item_type")
      .eq("assignment_id", assignment.id);
    assert(
      !studentItemError,
      `student assignment item read failed: ${summarizeSupabaseError(studentItemError)}`,
    );
    assert(studentItems?.[0]?.question_id === question.id, "student did not see assignment question item");
    console.log("PASS student assignment detail can load question item");

    const { data: unrelatedAssignment, error: unrelatedAssignmentError } = await teacher.client
      .from("assignments")
      .insert({
        assigned_at: new Date().toISOString(),
        classroom_id: unrelatedClassroom.id,
        created_by: teacher.user.id,
        instructions: "Hidden assignment.",
        organization_id: organizationId,
        status: "assigned",
        title: `Teacher assignment hidden ${suffix}`,
      })
      .select("id")
      .single();
    assert(
      !unrelatedAssignmentError && unrelatedAssignment,
      `unrelated assignment insert failed: ${summarizeSupabaseError(unrelatedAssignmentError)}`,
    );
    cleanup.assignments.push(unrelatedAssignment.id);

    const { data: hiddenRows, error: hiddenError } = await student.client
      .from("assignments")
      .select("id")
      .eq("id", unrelatedAssignment.id);
    assert(!hiddenError, `unrelated assignment read errored: ${summarizeSupabaseError(hiddenError)}`);
    assert(!hiddenRows?.length, "student unexpectedly saw another classroom assignment");
    console.log("PASS student cannot see assignments for unjoined classrooms");
  } finally {
    const cleanupErrors = [];
    for (const assignmentId of cleanup.assignments) {
      const { error } = await teacher.client
        .from("assignments")
        .delete()
        .eq("id", assignmentId);
      if (error) cleanupErrors.push(`assignment ${assignmentId}: ${summarizeSupabaseError(error)}`);
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
      throw new Error(`teacher assignment smoke cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }

  console.log("PASS teacher assignment flow smoke completed with scoped cleanup");
}

await main();
