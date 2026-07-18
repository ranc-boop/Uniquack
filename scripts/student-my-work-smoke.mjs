import { createClient } from "@supabase/supabase-js";

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
  const pieces = [error.message, error.code, error.details, error.hint].filter(Boolean);
  return pieces.join(" | ");
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
      `SKIP student My Work smoke: ${label} credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `student My Work smoke did not receive ${label} user`);
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
    `student My Work profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "student My Work smoke requires active teacher profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "student My Work smoke teacher account must be teacher/admin/super_admin",
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
  assert(!error, `student My Work org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "student My Work smoke found no teacher org");
  return memberships[0].organization_id;
}

async function createSmokeClassroom({ name, organizationId, studentUserId, teacher }) {
  const { data: classroom, error: classroomError } = await teacher.client
    .from("classrooms")
    .insert({
      created_by: teacher.user.id,
      name,
      organization_id: organizationId,
      owner_id: teacher.user.id,
      subject: "Smoke test",
      updated_by: teacher.user.id,
    })
    .select("id, name")
    .single();
  assert(
    !classroomError && classroom,
    `teacher could not create My Work smoke classroom: ${summarizeSupabaseError(classroomError)}`,
  );

  const { error: teacherMemberError } = await teacher.client
    .from("classroom_members")
    .insert({
      classroom_id: classroom.id,
      joined_at: new Date().toISOString(),
      role: "teacher",
      status: "active",
      user_id: teacher.user.id,
    });
  assert(
    !teacherMemberError,
    `teacher member insert failed: ${summarizeSupabaseError(teacherMemberError)}`,
  );

  if (studentUserId) {
    const { error: studentMemberError } = await teacher.client
      .from("classroom_members")
      .insert({
        classroom_id: classroom.id,
        joined_at: new Date().toISOString(),
        role: "student",
        status: "active",
        user_id: studentUserId,
      });
    assert(
      !studentMemberError,
      `student member insert failed: ${summarizeSupabaseError(studentMemberError)}`,
    );
  }

  return classroom;
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log(
      "BLOCKED student My Work live smoke: required disposable Supabase process-environment categories are missing.",
    );
    return;
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log(
      "BLOCKED student My Work live smoke: required disposable Teacher and Student process-environment credentials are missing.",
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
      name: `My Work smoke classroom ${suffix}`,
      organizationId,
      studentUserId: student.user.id,
      teacher,
    });
    cleanup.classrooms.push(classroom.id);

    const unrelatedClassroom = await createSmokeClassroom({
      name: `My Work unrelated classroom ${suffix}`,
      organizationId,
      studentUserId: null,
      teacher,
    });
    cleanup.classrooms.push(unrelatedClassroom.id);

    const { data: question, error: questionError } = await teacher.client
      .from("questions")
      .insert({
        content_html: "<p>Solve: 2x + 3 = 7.</p>",
        content_source: "student-my-work-smoke",
        content_source_format: "html",
        difficulty_rating: 300,
        organization_id: organizationId,
        question_code: `MY-WORK-SMOKE-${suffix}`.toUpperCase().slice(0, 80),
        question_type: "frq",
        solution_html: "<p>x = 2.</p>",
        solution_source: "student-my-work-smoke",
        solution_source_format: "html",
        status: "published",
        title: "Student My Work smoke question",
        created_by: teacher.user.id,
        updated_by: teacher.user.id,
      })
      .select("id")
      .single();
    assert(
      !questionError && question,
      `question insert failed: ${summarizeSupabaseError(questionError)}`,
    );
    cleanup.questions.push(question.id);

    const assignmentPayload = {
      assigned_at: new Date().toISOString(),
      classroom_id: classroom.id,
      created_by: teacher.user.id,
      due_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: "Complete the smoke question from My Work.",
      organization_id: organizationId,
      status: "assigned",
      title: `My Work smoke assignment ${suffix}`,
    };
    const { data: assignment, error: assignmentError } = await teacher.client
      .from("assignments")
      .insert(assignmentPayload)
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
    console.log("PASS teacher can create assigned classroom work with question item");

    const { data: studentAssignments, error: studentAssignmentError } = await student.client
      .from("assignments")
      .select("id, title, classroom_id, status")
      .eq("id", assignment.id);
    assert(
      !studentAssignmentError,
      `student assignment read failed: ${summarizeSupabaseError(studentAssignmentError)}`,
    );
    assert(studentAssignments?.[0]?.id === assignment.id, "student did not see assigned work");
    console.log("PASS student sees assigned work for active classroom membership");

    const { data: studentItems, error: studentItemError } = await student.client
      .from("assignment_items")
      .select("id, assignment_id, question_id, item_type")
      .eq("assignment_id", assignment.id);
    assert(
      !studentItemError,
      `student assignment item read failed: ${summarizeSupabaseError(studentItemError)}`,
    );
    assert(studentItems?.[0]?.question_id === question.id, "student did not see assignment question item");
    console.log("PASS student assignment detail can read item data");

    const { data: progress, error: progressError } = await student.client
      .from("student_assignment_progress")
      .insert({
        assignment_id: assignment.id,
        evidence_summary: { smoke: true },
        started_at: new Date().toISOString(),
        status: "in_progress",
        student_id: student.user.id,
      })
      .select("id, assignment_id, student_id, status")
      .single();
    assert(
      !progressError && progress?.status === "in_progress",
      `student progress insert failed: ${summarizeSupabaseError(progressError)}`,
    );
    console.log("PASS student can write own assignment progress");

    const { data: unrelatedAssignment, error: unrelatedAssignmentError } = await teacher.client
      .from("assignments")
      .insert({
        ...assignmentPayload,
        classroom_id: unrelatedClassroom.id,
        title: `My Work hidden assignment ${suffix}`,
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
    assert(!hiddenRows?.length, "student unexpectedly saw assignment for an unjoined classroom");
    console.log("PASS student cannot see work for unjoined classrooms");
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
      const { error: memberError } = await teacher.client
        .from("classroom_members")
        .update({ status: "removed" })
        .eq("classroom_id", classroomId)
        .neq("user_id", teacher.user.id);
      if (memberError) {
        cleanupErrors.push(`classroom members ${classroomId}: ${summarizeSupabaseError(memberError)}`);
      }
      const { error } = await teacher.client
        .from("classrooms")
        .update({ status: "archived", updated_by: teacher.user.id })
        .eq("id", classroomId);
      if (error) cleanupErrors.push(`classroom ${classroomId}: ${summarizeSupabaseError(error)}`);
    }

    if (cleanupErrors.length) {
      throw new Error(`student My Work smoke cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }

  console.log("PASS student My Work smoke completed with scoped cleanup");
}

await main();
