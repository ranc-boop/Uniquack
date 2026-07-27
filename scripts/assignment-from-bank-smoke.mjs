import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function isMissingAssignmentFromBankSchema(error) {
  const summary = summarizeSupabaseError(error).toLowerCase();
  return (
    error?.code === "PGRST202" ||
    summary.includes("create_assignment_from_bank") ||
    summary.includes("bank_question_id") ||
    summary.includes("source_bank_id") ||
    summary.includes("question_bank") ||
    summary.includes("schema cache") ||
    summary.includes("does not exist")
  );
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
    console.log(`SKIP assignment-from-bank live smoke: ${label} sign-in failed (${error.message}).`);
    return null;
  }

  assert(data.user?.id, `assignment-from-bank smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function resolveTeacherOrganizationId(teacher) {
  const { data: profile, error: profileError } = await teacher.client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", teacher.user.id)
    .single();

  assert(!profileError, `teacher profile lookup failed: ${summarizeSupabaseError(profileError)}`);
  assert(["teacher", "admin", "super_admin"].includes(profile.role), "assignment-from-bank smoke requires teacher/admin credentials");
  assert(profile.status === "active", "assignment-from-bank smoke teacher must be active");

  if (profile.default_organization_id) {
    return profile.default_organization_id;
  }

  const { data: memberships, error } = await teacher.client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", teacher.user.id)
    .eq("status", "active")
    .in("role", ["teacher", "admin"])
    .limit(1);

  assert(!error, `teacher organization lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "assignment-from-bank smoke found no teacher organization");
  return memberships[0].organization_id;
}

async function createSmokeClassroom({ admin, organizationId, studentUserId, suffix, teacher }) {
  const { data: classroom, error: classroomError } = await admin
    .from("classrooms")
    .insert({
      created_by: teacher.user.id,
      name: `Assignment from bank smoke ${suffix}`,
      organization_id: organizationId,
      owner_id: teacher.user.id,
      subject: "Bank assignment smoke",
      updated_by: teacher.user.id,
    })
    .select("id")
    .single();

  assert(!classroomError && classroom?.id, `classroom create failed: ${summarizeSupabaseError(classroomError)}`);

  const { error: teacherMemberError } = await admin
    .from("classroom_members")
    .insert({
      classroom_id: classroom.id,
      joined_at: new Date().toISOString(),
      role: "teacher",
      status: "active",
      user_id: teacher.user.id,
    });
  assert(!teacherMemberError, `teacher classroom member insert failed: ${summarizeSupabaseError(teacherMemberError)}`);

  if (studentUserId) {
    const { error: studentMemberError } = await admin
      .from("classroom_members")
      .insert({
        classroom_id: classroom.id,
        joined_at: new Date().toISOString(),
        role: "student",
        status: "active",
        user_id: studentUserId,
      });
    assert(!studentMemberError, `student classroom member insert failed: ${summarizeSupabaseError(studentMemberError)}`);
  }

  return classroom.id;
}

async function insertBankQuestionFixture({ admin, bankId, organizationId, suffix, teacherUserId, title }) {
  const codeSuffix = Math.random().toString(36).slice(2, 8);
  const { data: question, error: questionError } = await admin
    .from("questions")
    .insert({
      answer_spec: { kind: "exact_text", value: "2" },
      content_html: "<p>Solve x + 3 = 5.</p>",
      content_source: "Solve x + 3 = 5.",
      content_source_format: "plain_text",
      created_by: teacherUserId,
      difficulty_rating: 320,
      options: [],
      organization_id: organizationId,
      owner_bank_id: bankId,
      question_code: `bank-assign-smoke-${suffix}-${codeSuffix}`,
      question_type: "fill_blank",
      solution_html: "<p>Subtract 3 from both sides.</p>",
      solution_source: "Subtract 3 from both sides.",
      solution_source_format: "plain_text",
      source: "assignment_from_bank_smoke",
      source_kind: "ai_import",
      status: "review",
      title,
      visibility: "private",
    })
    .select("id")
    .single();

  assert(!questionError && question?.id, `question fixture insert failed: ${summarizeSupabaseError(questionError)}`);

  const { data: bankQuestion, error: bankQuestionError } = await admin
    .from("bank_questions")
    .insert({
      added_by: teacherUserId,
      bank_id: bankId,
      metadata: { smokeOnly: true },
      question_id: question.id,
      source_kind: "review_draft",
      status: "active",
    })
    .select("id")
    .single();

  assert(!bankQuestionError && bankQuestion?.id, `bank question fixture insert failed: ${summarizeSupabaseError(bankQuestionError)}`);
  return { bankQuestionId: bankQuestion.id, questionId: question.id };
}

async function cleanup({ assignmentIds, bankId, classroomIds, questionIds }) {
  if (!serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (assignmentIds.length) {
    await admin.from("assignments").delete().in("id", assignmentIds);
  }
  if (classroomIds.length) {
    await admin.from("classrooms").delete().in("id", classroomIds);
  }
  if (questionIds.length) {
    await admin.from("questions").delete().in("id", questionIds);
  }
  if (bankId) {
    await admin.from("question_banks").delete().eq("id", bankId);
  }

  console.log("PASS assignment-from-bank smoke cleanup removed smoke-created rows");
}

async function main() {
  const migration = await read("supabase/clean-migrations/0028_assignment_from_bank_questions.sql");
  const bankDetailPage = await read("src/app/teacher/banks/[bankId]/page.tsx");
  const bankAssignmentPage = await read("src/app/teacher/banks/[bankId]/assignments/new/page.tsx");
  const bankActions = await read("src/app/teacher/banks/actions.ts");
  const assignmentLinkage = await read("src/lib/practice/assignment-linkage.ts");
  const studentWorkDetailPage = await read("src/app/student/work/[id]/page.tsx");

  assert(
    migration.includes("public.create_assignment_from_bank") &&
      migration.includes("bank_question_id") &&
      migration.includes("source_bank_id") &&
      migration.includes("questions_assignment_item_read") &&
      migration.includes("assignment.status = 'assigned'") &&
      !migration.includes("published_at ="),
    "assignment-from-bank migration must add bank lineage and assignment-scoped question read without publishing questions",
  );
  assert(
    bankDetailPage.includes("Create assignment") &&
      bankAssignmentPage.includes("Library assignment") &&
      bankAssignmentPage.includes("selected approved") &&
      bankAssignmentPage.includes("full Library") &&
      bankActions.includes("create_assignment_from_bank") &&
      assignmentLinkage.includes("missingQuestionIds") &&
      assignmentLinkage.includes("ASSIGNMENT_CONTENT_UNAVAILABLE") &&
      !assignmentLinkage.includes('.eq("status", "published")') &&
      studentWorkDetailPage.includes("full teacher") &&
      studentWorkDetailPage.includes("Library stays private"),
    "assignment-from-bank UI and practice path must be bank-first and assignment-only",
  );
  console.log("PASS assignment-from-bank static checks protect bank-first assignment workflow");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log(
      "BLOCKED assignment-from-bank live smoke: required disposable Supabase process-environment categories are missing.",
    );
    return;
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log("BLOCKED assignment-from-bank live smoke: required disposable Teacher and Student process-environment credentials are missing.");
    return;
  }
  if (!serviceRoleKey) {
    console.log("BLOCKED assignment-from-bank live smoke: disposable service-role cleanup capability is missing from the process environment.");
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const student = await signIn(studentUsername, studentPassword, "student");
  if (!teacher || !student) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const organizationId = await resolveTeacherOrganizationId(teacher);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanupState = {
    assignmentIds: [],
    bankId: null,
    classroomIds: [],
    questionIds: [],
  };

  try {
    const { data: bankId, error: bankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created private bank for assignment validation.",
        bank_name: `Assignment from bank smoke ${suffix}`,
        bank_visibility: "private",
      },
    );
    assert(!bankError && bankId, `teacher bank create failed: ${summarizeSupabaseError(bankError)}`);
    cleanupState.bankId = bankId;

    const classroomId = await createSmokeClassroom({
      admin,
      organizationId,
      studentUserId: student.user.id,
      suffix,
      teacher,
    });
    cleanupState.classroomIds.push(classroomId);

    const assignedFixture = await insertBankQuestionFixture({
      admin,
      bankId,
      organizationId,
      suffix,
      teacherUserId: teacher.user.id,
      title: "Assigned private bank question",
    });
    const unassignedFixture = await insertBankQuestionFixture({
      admin,
      bankId,
      organizationId,
      suffix,
      teacherUserId: teacher.user.id,
      title: "Unassigned private bank question",
    });
    cleanupState.questionIds.push(assignedFixture.questionId, unassignedFixture.questionId);

    const { data: draftAssignmentId, error: draftError } = await teacher.client.rpc(
      "create_assignment_from_bank",
      {
        p_assign_now: false,
        p_assignment_due_at: null,
        p_assignment_instructions: "Draft assignment from bank smoke.",
        p_assignment_title: `Draft bank assignment ${suffix}`,
        p_selected_bank_question_ids: [assignedFixture.bankQuestionId],
        p_target_bank_id: bankId,
        p_target_classroom_id: classroomId,
      },
    );

    if (isMissingAssignmentFromBankSchema(draftError)) {
      console.log("SKIP assignment-from-bank live smoke: clean migration 0028 is not applied to the target Supabase project yet.");
      return;
    }

    assert(!draftError && draftAssignmentId, `draft assignment create failed: ${summarizeSupabaseError(draftError)}`);
    cleanupState.assignmentIds.push(draftAssignmentId);

    const { data: studentDraftRead, error: studentDraftError } = await student.client
      .from("assignments")
      .select("id")
      .eq("id", draftAssignmentId);
    assert(!studentDraftError, `student draft assignment read failed: ${summarizeSupabaseError(studentDraftError)}`);
    assert(!studentDraftRead?.length, "student unexpectedly read draft bank assignment");
    console.log("PASS draft bank assignment stays teacher-only");

    const { data: assignedAssignmentId, error: assignedError } = await teacher.client.rpc(
      "create_assignment_from_bank",
      {
        p_assign_now: true,
        p_assignment_due_at: null,
        p_assignment_instructions: "Assigned private bank question smoke.",
        p_assignment_title: `Assigned bank assignment ${suffix}`,
        p_selected_bank_question_ids: [assignedFixture.bankQuestionId],
        p_target_bank_id: bankId,
        p_target_classroom_id: classroomId,
      },
    );
    assert(!assignedError && assignedAssignmentId, `assigned assignment create failed: ${summarizeSupabaseError(assignedError)}`);
    cleanupState.assignmentIds.push(assignedAssignmentId);

    const { data: createdItems, error: itemError } = await teacher.client
      .from("assignment_items")
      .select("id, question_id, bank_question_id, source_bank_id")
      .eq("assignment_id", assignedAssignmentId);
    assert(!itemError, `teacher assignment item read failed: ${summarizeSupabaseError(itemError)}`);
    assert(createdItems?.length === 1, "assigned bank assignment should have one selected item");
    assert(createdItems[0].bank_question_id === assignedFixture.bankQuestionId, "assignment item must preserve bank_question_id");
    assert(createdItems[0].source_bank_id === bankId, "assignment item must preserve source_bank_id");
    console.log("PASS assignment item preserves bank lineage");

    const { data: studentAssignmentRead, error: studentAssignmentError } = await student.client
      .from("assignments")
      .select("id, source_kind, source_record_id")
      .eq("id", assignedAssignmentId);
    assert(!studentAssignmentError, `student assigned assignment read failed: ${summarizeSupabaseError(studentAssignmentError)}`);
    assert(studentAssignmentRead?.length === 1, "student could not read assigned bank assignment");
    assert(studentAssignmentRead[0].source_kind === "question_bank", "assignment must carry question_bank source kind");

    const { data: studentItems, error: studentItemsError } = await student.client
      .from("assignment_items")
      .select("id, question_id, bank_question_id, source_bank_id")
      .eq("assignment_id", assignedAssignmentId);
    assert(!studentItemsError, `student assignment item read failed: ${summarizeSupabaseError(studentItemsError)}`);
    assert(studentItems?.length === 1, "student should read selected assignment item");

    const { data: assignedQuestionRead, error: assignedQuestionError } = await student.client
      .from("questions")
      .select("id, status, owner_bank_id, published_at")
      .eq("id", assignedFixture.questionId);
    assert(!assignedQuestionError, `student assigned question read failed: ${summarizeSupabaseError(assignedQuestionError)}`);
    assert(assignedQuestionRead?.length === 1, "student should read selected assigned private bank question");
    assert(assignedQuestionRead[0].status !== "published", "assigned private bank question should remain non-published");
    assert(assignedQuestionRead[0].published_at === null, "assigned private bank question must not receive published_at");
    console.log("PASS student can read selected assigned private bank question without global publish");

    const { data: unassignedQuestionRead, error: unassignedQuestionError } = await student.client
      .from("questions")
      .select("id")
      .eq("id", unassignedFixture.questionId);
    assert(!unassignedQuestionError, `student unassigned private question read failed: ${summarizeSupabaseError(unassignedQuestionError)}`);
    assert(!unassignedQuestionRead?.length, "student unexpectedly read unassigned private bank question");

    const { data: studentBankRead, error: studentBankError } = await student.client
      .from("question_banks")
      .select("id")
      .eq("id", bankId);
    assert(!studentBankError, `student bank read failed: ${summarizeSupabaseError(studentBankError)}`);
    assert(!studentBankRead?.length, "student unexpectedly gained bank browsing access");
    console.log("PASS student receives assigned item access without full bank access");
  } finally {
    await cleanup(cleanupState);
  }
}

await main();
