import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

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

function isMissingPublishSchema(error) {
  const summary = summarizeSupabaseError(error).toLowerCase();
  return (
    error?.code === "PGRST202" ||
    summary.includes("create_assignment_from_bank") ||
    summary.includes("bank_question_id") ||
    summary.includes("source_bank_id") ||
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
    console.log(`SKIP publish-center live smoke: ${label} sign-in failed (${error.message}).`);
    return null;
  }

  assert(data.user?.id, `publish-center smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function resolveTeacherOrganizationId(teacher) {
  const { data: profile, error: profileError } = await teacher.client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", teacher.user.id)
    .single();

  assert(!profileError, `teacher profile lookup failed: ${summarizeSupabaseError(profileError)}`);
  assert(["teacher", "admin", "super_admin"].includes(profile.role), "publish-center smoke requires teacher/admin credentials");
  assert(profile.status === "active", "publish-center smoke teacher must be active");

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
  assert(memberships?.[0]?.organization_id, "publish-center smoke found no teacher organization");
  return memberships[0].organization_id;
}

async function createSmokeClassroom({
  admin,
  organizationId,
  studentUserId,
  suffix,
  teacher,
}) {
  const { data: classroom, error: classroomError } = await admin
    .from("classrooms")
    .insert({
      created_by: teacher.user.id,
      name: `Publish Center smoke ${suffix}`,
      organization_id: organizationId,
      owner_id: teacher.user.id,
      subject: "Publish Center smoke",
      updated_by: teacher.user.id,
    })
    .select("id")
    .single();

  assert(!classroomError && classroom?.id, `classroom create failed: ${summarizeSupabaseError(classroomError)}`);

  const { error: teacherMemberError } = await admin.from("classroom_members").insert({
    classroom_id: classroom.id,
    joined_at: new Date().toISOString(),
    role: "teacher",
    status: "active",
    user_id: teacher.user.id,
  });
  assert(!teacherMemberError, `teacher classroom member insert failed: ${summarizeSupabaseError(teacherMemberError)}`);

  if (studentUserId) {
    const { error: studentMemberError } = await admin.from("classroom_members").insert({
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

async function insertBankQuestionFixture({
  admin,
  bankId,
  organizationId,
  suffix,
  teacherUserId,
  title,
}) {
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
      question_code: `publish-center-smoke-${suffix}-${codeSuffix}`,
      question_type: "fill_blank",
      solution_html: "<p>Subtract 3 from both sides.</p>",
      solution_source: "Subtract 3 from both sides.",
      solution_source_format: "plain_text",
      source: "publish_center_smoke",
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

  console.log("PASS publish-center smoke cleanup removed smoke-created rows");
}

async function staticChecks() {
  const publishPage = await read("src/app/teacher/publish/page.tsx");
  const publishActions = await read("src/app/teacher/publish/actions.ts");
  const bankDetailPage = await read("src/app/teacher/banks/[bankId]/page.tsx");
  const bankQuestionsPage = await read("src/app/teacher/banks/[bankId]/questions/page.tsx");
  const classroomAssignmentsPage = await read("src/app/teacher/classrooms/[id]/assignments/page.tsx");
  const classroomUi = await read("src/app/teacher/classrooms/classroom-ui.tsx");
  const smokeAll = await read("scripts/smoke-all.mjs");

  assert(
    publishPage.includes("Publish distributes selected bank content to classes. Students see assigned items only, not the full source bank.") &&
      publishPage.includes("Question Bank") &&
      publishPage.includes("Working now") &&
      publishPage.includes("Blueprints will become publishable after package generation and Review Draft approval.") &&
      publishPage.includes("Package") &&
      publishPage.includes("Choose a source bank") &&
      publishPage.includes("Select approved bank questions") &&
      publishPage.includes("Choose classroom targets") &&
      publishPage.includes("Individual-student targeting is planned") &&
      publishPage.includes("Assignment-only. No full source bank access.") &&
      publishPage.includes("No Review Draft bypass") &&
      publishPage.includes("No provider or AI calls"),
    "Publish Center page must expose bank source, class target, review boundary, and coming-next source copy",
  );
  assert(
    publishPage.includes("action={publishQuestionBankAssignments}") &&
      publishActions.includes("requireTeacher") &&
      publishActions.includes("create_assignment_from_bank") &&
      publishActions.includes("selectedClassroomIds") &&
      publishActions.includes("p_selected_bank_question_ids") &&
      publishActions.includes("p_assign_now") &&
      publishActions.includes("Students see assignment items only") &&
      !publishActions.includes("AI_PROVIDER") &&
      !publishActions.includes("provider") &&
      !publishActions.includes("published_at"),
    "Publish Center action must reuse bank assignment RPC and avoid providers/global publish",
  );
  assert(
    bankDetailPage.includes("/teacher/publish?sourceBankId=") &&
      bankQuestionsPage.includes("/teacher/publish?sourceBankId=") &&
      classroomUi.includes("/teacher/publish?classroomId=") &&
      classroomAssignmentsPage.includes("/teacher/publish?classroomId="),
    "bank and classroom routes must link into the top-level Publish Center",
  );
  assert(
    smokeAll.includes("publish-center-foundation-smoke.mjs"),
    "smoke-all must include Publish Center foundation smoke",
  );
  console.log("PASS publish-center static checks protect bank-first distribution workflow");
}

async function liveChecks() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log("SKIP publish-center live smoke: missing TEST_TEACHER/TEST_ADMIN or TEST_STUDENT credentials.");
    return;
  }
  if (!serviceRoleKey) {
    console.log("SKIP publish-center live smoke: service role key unavailable for disposable fixture setup/cleanup.");
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
    const { data: bankId, error: bankError } = await teacher.client.rpc("create_question_bank", {
      bank_description: "Smoke-created private bank for Publish Center validation.",
      bank_name: `Publish Center smoke ${suffix}`,
      bank_visibility: "private",
    });
    assert(!bankError && bankId, `teacher bank create failed: ${summarizeSupabaseError(bankError)}`);
    cleanupState.bankId = bankId;

    const classroomWithStudentId = await createSmokeClassroom({
      admin,
      organizationId,
      studentUserId: student.user.id,
      suffix: `${suffix}-student`,
      teacher,
    });
    const classroomTeacherOnlyId = await createSmokeClassroom({
      admin,
      organizationId,
      studentUserId: null,
      suffix: `${suffix}-teacher-only`,
      teacher,
    });
    cleanupState.classroomIds.push(classroomWithStudentId, classroomTeacherOnlyId);

    const assignedFixture = await insertBankQuestionFixture({
      admin,
      bankId,
      organizationId,
      suffix,
      teacherUserId: teacher.user.id,
      title: "Publish Center assigned private bank question",
    });
    const unassignedFixture = await insertBankQuestionFixture({
      admin,
      bankId,
      organizationId,
      suffix,
      teacherUserId: teacher.user.id,
      title: "Publish Center unassigned private bank question",
    });
    cleanupState.questionIds.push(assignedFixture.questionId, unassignedFixture.questionId);

    const { data: draftAssignmentId, error: draftError } = await teacher.client.rpc(
      "create_assignment_from_bank",
      {
        p_assign_now: false,
        p_assignment_due_at: null,
        p_assignment_instructions: "Draft Publish Center smoke.",
        p_assignment_title: `Draft Publish Center ${suffix}`,
        p_selected_bank_question_ids: [assignedFixture.bankQuestionId],
        p_target_bank_id: bankId,
        p_target_classroom_id: classroomWithStudentId,
      },
    );

    if (isMissingPublishSchema(draftError)) {
      console.log("SKIP publish-center live smoke: assignment/bank clean migrations are not applied to the target Supabase project yet.");
      return;
    }

    assert(!draftError && draftAssignmentId, `draft publish create failed: ${summarizeSupabaseError(draftError)}`);
    cleanupState.assignmentIds.push(draftAssignmentId);

    const { data: studentDraftRead, error: studentDraftError } = await student.client
      .from("assignments")
      .select("id")
      .eq("id", draftAssignmentId);
    assert(!studentDraftError, `student draft read failed: ${summarizeSupabaseError(studentDraftError)}`);
    assert(!studentDraftRead?.length, "student unexpectedly read draft Publish Center assignment");
    console.log("PASS Publish Center draft stays teacher-only");

    const assignedAssignmentIds = [];
    for (const classroomId of [classroomWithStudentId, classroomTeacherOnlyId]) {
      const { data: assignmentId, error } = await teacher.client.rpc(
        "create_assignment_from_bank",
        {
          p_assign_now: true,
          p_assignment_due_at: null,
          p_assignment_instructions: "Assigned Publish Center smoke.",
          p_assignment_title: `Assigned Publish Center ${suffix}`,
          p_selected_bank_question_ids: [assignedFixture.bankQuestionId],
          p_target_bank_id: bankId,
          p_target_classroom_id: classroomId,
        },
      );
      assert(!error && assignmentId, `assigned publish create failed: ${summarizeSupabaseError(error)}`);
      assignedAssignmentIds.push(assignmentId);
      cleanupState.assignmentIds.push(assignmentId);
    }
    console.log("PASS Publish Center can create assigned work for multiple managed classes");

    const { data: assignmentRows, error: assignmentRowsError } = await teacher.client
      .from("assignments")
      .select("id, classroom_id, source_kind, source_record_id, status")
      .in("id", assignedAssignmentIds);
    assert(!assignmentRowsError, `teacher assignment read failed: ${summarizeSupabaseError(assignmentRowsError)}`);
    assert(assignmentRows?.length === 2, "teacher should read both assigned Publish Center assignments");
    assert(
      assignmentRows.every((assignment) => assignment.source_kind === "question_bank" && assignment.source_record_id === bankId),
      "Publish Center assignments must preserve question_bank source lineage",
    );

    const { data: createdItems, error: itemError } = await teacher.client
      .from("assignment_items")
      .select("id, assignment_id, question_id, bank_question_id, source_bank_id")
      .in("assignment_id", assignedAssignmentIds);
    assert(!itemError, `teacher assignment item read failed: ${summarizeSupabaseError(itemError)}`);
    assert(createdItems?.length === 2, "each assigned Publish Center assignment should have one item");
    assert(
      createdItems.every(
        (item) =>
          item.bank_question_id === assignedFixture.bankQuestionId &&
          item.source_bank_id === bankId &&
          item.question_id === assignedFixture.questionId,
      ),
      "Publish Center assignment items must preserve selected bank question lineage",
    );
    console.log("PASS Publish Center assignment items preserve bank lineage");

    const studentVisibleAssignmentId = assignedAssignmentIds.find((assignmentId) =>
      assignmentRows.find(
        (assignment) =>
          assignment.id === assignmentId &&
          assignment.classroom_id === classroomWithStudentId,
      ),
    );
    const teacherOnlyAssignmentId = assignedAssignmentIds.find((assignmentId) =>
      assignmentRows.find(
        (assignment) =>
          assignment.id === assignmentId &&
          assignment.classroom_id === classroomTeacherOnlyId,
      ),
    );

    const { data: studentAssignmentRead, error: studentAssignmentError } = await student.client
      .from("assignments")
      .select("id, source_kind, source_record_id")
      .eq("id", studentVisibleAssignmentId);
    assert(!studentAssignmentError, `student assigned read failed: ${summarizeSupabaseError(studentAssignmentError)}`);
    assert(studentAssignmentRead?.length === 1, "student should read assigned work for joined classroom");

    const { data: studentOtherClassRead, error: studentOtherClassError } = await student.client
      .from("assignments")
      .select("id")
      .eq("id", teacherOnlyAssignmentId);
    assert(!studentOtherClassError, `student unrelated class read failed: ${summarizeSupabaseError(studentOtherClassError)}`);
    assert(!studentOtherClassRead?.length, "student unexpectedly read assignment for a class they did not join");

    const { data: studentItems, error: studentItemsError } = await student.client
      .from("assignment_items")
      .select("id, question_id, bank_question_id, source_bank_id")
      .eq("assignment_id", studentVisibleAssignmentId);
    assert(!studentItemsError, `student assignment item read failed: ${summarizeSupabaseError(studentItemsError)}`);
    assert(studentItems?.length === 1, "student should read the selected assignment item only");
    console.log("PASS student sees assigned work only for class membership");

    const { data: assignedQuestionRead, error: assignedQuestionError } = await student.client
      .from("questions")
      .select("id, status, owner_bank_id, published_at")
      .eq("id", assignedFixture.questionId);
    assert(!assignedQuestionError, `student assigned question read failed: ${summarizeSupabaseError(assignedQuestionError)}`);
    assert(assignedQuestionRead?.length === 1, "student should read selected assigned private bank question");
    assert(assignedQuestionRead[0].status !== "published", "assigned private bank question should remain non-published");
    assert(assignedQuestionRead[0].published_at === null, "assigned private bank question must not receive published_at");

    const { data: unassignedQuestionRead, error: unassignedQuestionError } = await student.client
      .from("questions")
      .select("id")
      .eq("id", unassignedFixture.questionId);
    assert(!unassignedQuestionError, `student unassigned question read failed: ${summarizeSupabaseError(unassignedQuestionError)}`);
    assert(!unassignedQuestionRead?.length, "student unexpectedly read unassigned private bank question");

    const { data: studentBankRead, error: studentBankError } = await student.client
      .from("question_banks")
      .select("id")
      .eq("id", bankId);
    assert(!studentBankError, `student bank read failed: ${summarizeSupabaseError(studentBankError)}`);
    assert(!studentBankRead?.length, "student unexpectedly gained source bank browsing access");
    console.log("PASS source bank remains private while assigned item is visible");
  } finally {
    await cleanup(cleanupState);
  }
}

await staticChecks();
await liveChecks();
