#!/usr/bin/env node

// Process-only disposable validation for 0047. It never loads an environment
// file, configures a Provider, or makes a model request.

import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const DISPOSABLE_CONFIRMATION = "DISPOSABLE_STUDENT_SELF_STUDY_E2E";
const CLEANUP_CONFIRMATION = "DELETE_STUDENT_SELF_STUDY_E2E_FIXTURES";
const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "STUDENT_SELF_STUDY_E2E_ENVIRONMENT",
  "STUDENT_SELF_STUDY_E2E_EXPECTED_PROJECT_REF",
  "STUDENT_SELF_STUDY_E2E_CONFIRM_CLEANUP",
];

const SESSION_EVIDENCE_TABLES = [
  "practice_rounds",
  "practice_round_questions",
  "practice_attempts",
  "practice_hint_events",
  "practice_reflection_records",
  "practice_weakness_links",
  "practice_agent_episodes",
];

class HarnessError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new HarnessError(category);
}

function safeFailureCategory(error) {
  const value = String(error?.category ?? error?.code ?? error?.status ?? "unexpected_failure");
  return /^[A-Za-z0-9_:-]{1,120}$/.test(value) ? value : "unexpected_failure";
}

function assertNoError(result, category) {
  if (result?.error) throw new HarnessError(`${category}:${safeFailureCategory(result.error)}`);
  return result?.data;
}

function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(value);
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function printEnvironmentPresence() {
  for (const name of REQUIRED_ENVIRONMENT) {
    console.log(`${name} = ${process.env[name]?.trim() ? "PRESENT" : "MISSING"}`);
  }
}

function requireApprovedProcessEnvironment() {
  printEnvironmentPresence();
  const missing = REQUIRED_ENVIRONMENT.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new HarnessError("missing_process_environment");
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new HarnessError("production_environment_refused");
  }
  if (process.env.STUDENT_SELF_STUDY_E2E_ENVIRONMENT !== DISPOSABLE_CONFIRMATION) {
    throw new HarnessError("disposable_environment_acknowledgement_required");
  }
  if (process.env.STUDENT_SELF_STUDY_E2E_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    throw new HarnessError("destructive_fixture_acknowledgement_required");
  }

  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (
    !projectRef ||
    projectRef !== process.env.STUDENT_SELF_STUDY_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase()
  ) {
    throw new HarnessError("expected_project_identity_mismatch");
  }

  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    projectRef,
    serviceRoleKey: process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

function clearProcessEnvironment() {
  for (const name of REQUIRED_ENVIRONMENT) delete process.env[name];
}

function opaqueRunId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function randomPassword() {
  return `SelfStudyE2E!${randomBytes(24).toString("base64url")}`;
}

function createSessionClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowsOf(data) {
  return Array.isArray(data) ? data : data ? [data] : [];
}

async function expectVisible(label, request, expectedCount = 1) {
  const result = await request;
  const rows = rowsOf(assertNoError(result, `${label}_request_failed`));
  assert(rows.length === expectedCount, `${label}_unexpected_row_count`);
  console.log(`PASS ${label}`);
}

async function expectHidden(label, request) {
  const result = await request;
  const rows = rowsOf(assertNoError(result, `${label}_request_failed`));
  assert(rows.length === 0, `${label}_unexpectedly_visible`);
  console.log(`PASS ${label}`);
}

async function insertExact(service, table, rows, category) {
  assertNoError(await service.from(table).insert(rows), category);
}

async function createFixtureOrganizations(service, fixtures) {
  const primary = randomUUID();
  const secondary = randomUUID();
  fixtures.organizationIds.push(primary, secondary);
  fixtures.primaryOrganizationId = primary;
  fixtures.secondaryOrganizationId = secondary;
  await insertExact(
    service,
    "organizations",
    [
      {
        id: primary,
        name: `Self-study isolation ${fixtures.runId}`,
        slug: `self-study-isolation-${fixtures.runId}`,
        status: "active",
      },
      {
        id: secondary,
        name: `Self-study isolation secondary ${fixtures.runId}`,
        slug: `self-study-isolation-secondary-${fixtures.runId}`,
        status: "active",
      },
    ],
    "fixture_organization_create_failed",
  );
}

async function signInFixture({ anonKey, email, password, url }) {
  const client = createSessionClient(url, anonKey);
  const result = await client.auth.signInWithPassword({ email, password });
  assert(!result.error && result.data.user?.id && result.data.session, "fixture_sign_in_failed");
  return { client, id: result.data.user.id, session: result.data.session };
}

async function createFixtureUser({ anonKey, fixtures, organizationId, role, service, url, label }) {
  const ordinal = fixtures.userIds.length + 1;
  const email = `self-study-isolation-${fixtures.runId}-${label}-${ordinal}@fixture.invalid`;
  const password = randomPassword();
  const authResult = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: "student_self_study_isolation_live_e2e" },
  });
  assert(!authResult.error && authResult.data.user?.id, "fixture_auth_user_create_failed");
  const userId = authResult.data.user.id;
  fixtures.userIds.push(userId);

  await insertExact(
    service,
    "profiles",
    {
      default_organization_id: organizationId,
      display_name: `Self-study isolation ${label}`,
      email,
      id: userId,
      role,
      status: "active",
      username: `self-study-isolation-${fixtures.runId}-${label}-${ordinal}`,
    },
    "fixture_profile_create_failed",
  );

  const membershipId = randomUUID();
  fixtures.organizationMemberIds.push(membershipId);
  await insertExact(
    service,
    "organization_members",
    {
      id: membershipId,
      organization_id: organizationId,
      role: role === "admin" ? "admin" : role === "teacher" ? "teacher" : "student",
      status: "active",
      user_id: userId,
    },
    "fixture_organization_member_create_failed",
  );

  const session = await signInFixture({ anonKey, email, password, url });
  assert(session.id === userId, "fixture_session_identity_mismatch");
  return session;
}

async function createFixtureClassroom(fixtures, suffix) {
  const response = await fixtures.teacherA.client.rpc("create_teacher_classroom", {
    p_description: "Disposable self-study isolation validation.",
    p_name: `Self-study isolation ${suffix} ${fixtures.runId}`,
    p_organization_id: fixtures.primaryOrganizationId,
    p_request_id: randomUUID(),
    p_subject: "Security validation",
  });
  const rows = rowsOf(assertNoError(response, "fixture_classroom_create_failed"));
  const classroom = rows[0];
  assert(classroom?.classroom_id && classroom?.display_code, "fixture_classroom_create_contract_failed");
  fixtures.classroomIds.push(classroom.classroom_id);
  return classroom;
}

async function joinFixtureClassroom(student, classroom, category) {
  const response = await student.client.rpc("join_classroom_by_code", { join_code: classroom.display_code });
  const rows = rowsOf(assertNoError(response, category));
  assert(rows[0]?.classroom_id === classroom.classroom_id, `${category}_contract_failed`);
}

async function createFixtureBankAndAssignment(fixtures) {
  const bankResult = await fixtures.teacherA.client.rpc("create_question_bank", {
    bank_description: "Disposable private source bank for self-study isolation.",
    bank_name: `Self-study isolation ${fixtures.runId}`,
    bank_visibility: "private",
  });
  const bankId = assertNoError(bankResult, "fixture_bank_create_failed");
  assert(bankId, "fixture_bank_id_missing");
  fixtures.bankId = bankId;

  const questionId = randomUUID();
  const bankQuestionId = randomUUID();
  fixtures.questionIds.push(questionId);
  fixtures.bankQuestionIds.push(bankQuestionId);
  await insertExact(
    fixtures.service,
    "questions",
    {
      answer_spec: { kind: "exact_text", value: "2" },
      content_html: "<p>Disposable validation question.</p>",
      content_source: "Disposable fixture.",
      content_source_format: "plain_text",
      created_by: fixtures.teacherA.id,
      difficulty_rating: 320,
      id: questionId,
      options: [],
      organization_id: fixtures.primaryOrganizationId,
      owner_bank_id: bankId,
      published_at: null,
      question_code: `self-study-isolation-${fixtures.runId}`,
      question_type: "fill_blank",
      solution_html: "<p>Disposable solution.</p>",
      solution_source: "Disposable fixture.",
      solution_source_format: "plain_text",
      source: "student_self_study_isolation_live_e2e",
      source_kind: "manual",
      status: "review",
      title: "Disposable private question",
      updated_by: fixtures.teacherA.id,
      visibility: "private",
    },
    "fixture_question_create_failed",
  );
  await insertExact(
    fixtures.service,
    "bank_questions",
    {
      added_by: fixtures.teacherA.id,
      bank_id: bankId,
      id: bankQuestionId,
      metadata: { fixture_only: true },
      question_id: questionId,
      source_kind: "manual",
      status: "active",
    },
    "fixture_bank_question_create_failed",
  );

  const assignmentResult = await fixtures.teacherA.client.rpc("create_assignment_from_bank", {
    p_assign_now: true,
    p_assignment_due_at: null,
    p_assignment_instructions: "Disposable self-study isolation validation.",
    p_assignment_title: `Self-study isolation ${fixtures.runId}`,
    p_selected_bank_question_ids: [bankQuestionId],
    p_target_bank_id: bankId,
    p_target_classroom_id: fixtures.assignmentClassroomId,
  });
  const assignmentId = assertNoError(assignmentResult, "fixture_assignment_create_failed");
  assert(assignmentId, "fixture_assignment_id_missing");
  fixtures.assignmentId = assignmentId;
}

async function createPracticeFixtures(fixtures) {
  const taxonomyResult = await fixtures.service
    .from("taxonomy_nodes")
    .select("tag_id")
    .eq("node_kind", "tag")
    .eq("status", "active")
    .eq("is_assignable", true)
    .limit(1)
    .maybeSingle();
  const taxonomyNode = assertNoError(taxonomyResult, "fixture_taxonomy_preflight_failed");
  assert(taxonomyNode?.tag_id, "fixture_assignable_taxonomy_missing");

  const courseFrameworkId = randomUUID();
  fixtures.courseFrameworkIds.push(courseFrameworkId);
  await insertExact(
    fixtures.service,
    "practice_course_frameworks",
    {
      created_by: fixtures.teacherA.id,
      description: "Disposable framework ownership boundary fixture.",
      id: courseFrameworkId,
      organization_id: fixtures.primaryOrganizationId,
      status: "active",
      teacher_id: fixtures.teacherA.id,
      title: `Self-study framework ${fixtures.runId}`,
    },
    "fixture_course_framework_create_failed",
  );

  const selfSessionId = randomUUID();
  const assignmentSessionId = randomUUID();
  const studentBSessionId = randomUUID();
  fixtures.selfSessionId = selfSessionId;
  fixtures.assignmentSessionId = assignmentSessionId;
  fixtures.studentBSessionId = studentBSessionId;
  fixtures.practiceSessionIds.push(selfSessionId, assignmentSessionId, studentBSessionId);

  await insertExact(
    fixtures.service,
    "practice_sessions",
    [
      {
        goal: "Private self-study fixture",
        id: selfSessionId,
        organization_id: fixtures.primaryOrganizationId,
        course_framework_id: courseFrameworkId,
        title: "Private self-study fixture",
        user_id: fixtures.studentA.id,
      },
      {
        goal: "Assignment-linked fixture",
        id: assignmentSessionId,
        organization_id: fixtures.primaryOrganizationId,
        title: "Assignment-linked fixture",
        user_id: fixtures.studentA.id,
      },
      {
        goal: "Student B private fixture",
        id: studentBSessionId,
        organization_id: fixtures.primaryOrganizationId,
        title: "Student B private fixture",
        user_id: fixtures.studentB.id,
      },
    ],
    "fixture_practice_sessions_create_failed",
  );

  const selfRoundId = randomUUID();
  const assignmentRoundId = randomUUID();
  const studentBRoundId = randomUUID();
  fixtures.practiceRoundIds.push(selfRoundId, assignmentRoundId, studentBRoundId);
  await insertExact(
    fixtures.service,
    "practice_rounds",
    [
      {
        id: selfRoundId,
        organization_id: fixtures.primaryOrganizationId,
        round_index: 1,
        session_id: selfSessionId,
        user_id: fixtures.studentA.id,
      },
      {
        id: assignmentRoundId,
        organization_id: fixtures.primaryOrganizationId,
        round_index: 1,
        session_id: assignmentSessionId,
        user_id: fixtures.studentA.id,
      },
      {
        id: studentBRoundId,
        organization_id: fixtures.primaryOrganizationId,
        round_index: 1,
        session_id: studentBSessionId,
        user_id: fixtures.studentB.id,
      },
    ],
    "fixture_practice_rounds_create_failed",
  );

  const selfRoundQuestionId = randomUUID();
  const assignmentRoundQuestionId = randomUUID();
  const studentBRoundQuestionId = randomUUID();
  fixtures.practiceRoundQuestionIds.push(selfRoundQuestionId, assignmentRoundQuestionId, studentBRoundQuestionId);
  await insertExact(
    fixtures.service,
    "practice_round_questions",
    [
      {
        id: selfRoundQuestionId,
        organization_id: fixtures.primaryOrganizationId,
        position: 1,
        question_id: fixtures.questionIds[0],
        round_id: selfRoundId,
        session_id: selfSessionId,
        source_question_id: fixtures.questionIds[0],
        user_id: fixtures.studentA.id,
      },
      {
        id: assignmentRoundQuestionId,
        organization_id: fixtures.primaryOrganizationId,
        position: 1,
        question_id: fixtures.questionIds[0],
        round_id: assignmentRoundId,
        session_id: assignmentSessionId,
        source_question_id: fixtures.questionIds[0],
        user_id: fixtures.studentA.id,
      },
      {
        id: studentBRoundQuestionId,
        organization_id: fixtures.primaryOrganizationId,
        position: 1,
        question_id: fixtures.questionIds[0],
        round_id: studentBRoundId,
        session_id: studentBSessionId,
        source_question_id: fixtures.questionIds[0],
        user_id: fixtures.studentB.id,
      },
    ],
    "fixture_practice_round_questions_create_failed",
  );

  const selfAttemptId = randomUUID();
  const assignmentAttemptId = randomUUID();
  const studentBAttemptId = randomUUID();
  fixtures.practiceAttemptIds.push(selfAttemptId, assignmentAttemptId, studentBAttemptId);
  fixtures.selfAttemptId = selfAttemptId;
  fixtures.assignmentAttemptId = assignmentAttemptId;
  await insertExact(
    fixtures.service,
    "practice_attempts",
    [
      {
        id: selfAttemptId,
        organization_id: fixtures.primaryOrganizationId,
        practice_round_question_id: selfRoundQuestionId,
        question_id: fixtures.questionIds[0],
        round_id: selfRoundId,
        session_id: selfSessionId,
        source_question_id: fixtures.questionIds[0],
        user_id: fixtures.studentA.id,
      },
      {
        id: assignmentAttemptId,
        organization_id: fixtures.primaryOrganizationId,
        practice_round_question_id: assignmentRoundQuestionId,
        question_id: fixtures.questionIds[0],
        round_id: assignmentRoundId,
        session_id: assignmentSessionId,
        source_question_id: fixtures.questionIds[0],
        user_id: fixtures.studentA.id,
      },
      {
        id: studentBAttemptId,
        organization_id: fixtures.primaryOrganizationId,
        practice_round_question_id: studentBRoundQuestionId,
        question_id: fixtures.questionIds[0],
        round_id: studentBRoundId,
        session_id: studentBSessionId,
        source_question_id: fixtures.questionIds[0],
        user_id: fixtures.studentB.id,
      },
    ],
    "fixture_practice_attempts_create_failed",
  );

  const selfHintId = randomUUID();
  const assignmentHintId = randomUUID();
  fixtures.practiceHintIds.push(selfHintId, assignmentHintId);
  await insertExact(
    fixtures.service,
    "practice_hint_events",
    [
      {
        attempt_id: selfAttemptId,
        id: selfHintId,
        organization_id: fixtures.primaryOrganizationId,
        round_id: selfRoundId,
        session_id: selfSessionId,
        user_id: fixtures.studentA.id,
      },
      {
        attempt_id: assignmentAttemptId,
        id: assignmentHintId,
        organization_id: fixtures.primaryOrganizationId,
        round_id: assignmentRoundId,
        session_id: assignmentSessionId,
        user_id: fixtures.studentA.id,
      },
    ],
    "fixture_practice_hints_create_failed",
  );

  const selfReflectionId = randomUUID();
  const assignmentReflectionId = randomUUID();
  fixtures.practiceReflectionIds.push(selfReflectionId, assignmentReflectionId);
  await insertExact(
    fixtures.service,
    "practice_reflection_records",
    [
      {
        created_by: fixtures.studentA.id,
        id: selfReflectionId,
        organization_id: fixtures.primaryOrganizationId,
        round_id: selfRoundId,
        session_id: selfSessionId,
        user_id: fixtures.studentA.id,
      },
      {
        created_by: fixtures.studentA.id,
        id: assignmentReflectionId,
        organization_id: fixtures.primaryOrganizationId,
        round_id: assignmentRoundId,
        session_id: assignmentSessionId,
        user_id: fixtures.studentA.id,
      },
    ],
    "fixture_practice_reflections_create_failed",
  );

  const selfWeaknessId = randomUUID();
  const assignmentWeaknessId = randomUUID();
  fixtures.practiceWeaknessIds.push(selfWeaknessId, assignmentWeaknessId);
  await insertExact(
    fixtures.service,
    "practice_weakness_links",
    [
      {
        attempt_id: selfAttemptId,
        confidence: 0.5,
        evidence_kind: "missed_question",
        id: selfWeaknessId,
        organization_id: fixtures.primaryOrganizationId,
        session_id: selfSessionId,
        taxonomy_node_id: taxonomyNode.tag_id,
        user_id: fixtures.studentA.id,
      },
      {
        attempt_id: assignmentAttemptId,
        confidence: 0.5,
        evidence_kind: "missed_question",
        id: assignmentWeaknessId,
        organization_id: fixtures.primaryOrganizationId,
        session_id: assignmentSessionId,
        taxonomy_node_id: taxonomyNode.tag_id,
        user_id: fixtures.studentA.id,
      },
    ],
    "fixture_practice_weakness_create_failed",
  );

  const selfEpisodeId = randomUUID();
  const assignmentEpisodeId = randomUUID();
  fixtures.practiceEpisodeIds.push(selfEpisodeId, assignmentEpisodeId);
  await insertExact(
    fixtures.service,
    "practice_agent_episodes",
    [
      {
        id: selfEpisodeId,
        organization_id: fixtures.primaryOrganizationId,
        round_id: selfRoundId,
        session_id: selfSessionId,
        user_id: fixtures.studentA.id,
      },
      {
        id: assignmentEpisodeId,
        organization_id: fixtures.primaryOrganizationId,
        round_id: assignmentRoundId,
        session_id: assignmentSessionId,
        user_id: fixtures.studentA.id,
      },
    ],
    "fixture_practice_episodes_create_failed",
  );

  const wrongQuestionId = randomUUID();
  const preferenceMergeJobId = randomUUID();
  fixtures.practiceWrongQuestionIds.push(wrongQuestionId);
  fixtures.preferenceMergeJobIds.push(preferenceMergeJobId);
  await insertExact(
    fixtures.service,
    "practice_wrong_questions",
    {
      id: wrongQuestionId,
      last_attempt_id: assignmentAttemptId,
      last_round_id: assignmentRoundId,
      last_session_id: assignmentSessionId,
      organization_id: fixtures.primaryOrganizationId,
      question_id: fixtures.questionIds[0],
      source_question_id: fixtures.questionIds[0],
      user_id: fixtures.studentA.id,
    },
    "fixture_wrong_question_create_failed",
  );
  await insertExact(
    fixtures.service,
    "user_practice_preferences",
    {
      organization_id: fixtures.primaryOrganizationId,
      user_id: fixtures.studentA.id,
    },
    "fixture_practice_preferences_create_failed",
  );
  await insertExact(
    fixtures.service,
    "practice_preference_merge_jobs",
    {
      id: preferenceMergeJobId,
      organization_id: fixtures.primaryOrganizationId,
      source_session_id: assignmentSessionId,
      source_summary: { fixture_only: true },
      user_id: fixtures.studentA.id,
    },
    "fixture_preference_merge_create_failed",
  );

  const assignmentLink = {
    assignment_id: fixtures.assignmentId,
    practice_session_id: assignmentSessionId,
    student_id: fixtures.studentA.id,
  };
  fixtures.assignmentPracticeLinks.push(assignmentLink);
  await insertExact(
    fixtures.service,
    "assignment_practice_sessions",
    assignmentLink,
    "fixture_assignment_session_link_create_failed",
  );

  const progressId = randomUUID();
  fixtures.progressIds.push(progressId);
  await insertExact(
    fixtures.service,
    "student_assignment_progress",
    {
      assignment_id: fixtures.assignmentId,
      id: progressId,
      last_practice_session_id: assignmentSessionId,
      status: "in_progress",
      student_id: fixtures.studentA.id,
    },
    "fixture_assignment_progress_create_failed",
  );

  const feedbackId = randomUUID();
  fixtures.feedbackIds.push(feedbackId);
  await insertExact(
    fixtures.service,
    "teacher_feedback_notes",
    {
      assignment_id: fixtures.assignmentId,
      author_id: fixtures.teacherA.id,
      body: "Disposable sent feedback.",
      classroom_id: fixtures.assignmentClassroomId,
      id: feedbackId,
      organization_id: fixtures.primaryOrganizationId,
      practice_attempt_id: assignmentAttemptId,
      question_id: fixtures.questionIds[0],
      sent_at: new Date().toISOString(),
      status: "sent",
      student_id: fixtures.studentA.id,
      visibility: "sent_to_student",
    },
    "fixture_feedback_create_failed",
  );
}

function selfStudyRequests(actor, fixtures) {
  return [
    ["practice_sessions", actor.client.from("practice_sessions").select("id").eq("id", fixtures.selfSessionId)],
    ["practice_rounds", actor.client.from("practice_rounds").select("id").eq("session_id", fixtures.selfSessionId)],
    [
      "practice_round_questions",
      actor.client.from("practice_round_questions").select("id").eq("session_id", fixtures.selfSessionId),
    ],
    ["practice_attempts", actor.client.from("practice_attempts").select("id").eq("session_id", fixtures.selfSessionId)],
    ["practice_hint_events", actor.client.from("practice_hint_events").select("id").eq("session_id", fixtures.selfSessionId)],
    [
      "practice_reflection_records",
      actor.client.from("practice_reflection_records").select("id").eq("session_id", fixtures.selfSessionId),
    ],
    [
      "practice_wrong_questions",
      actor.client.from("practice_wrong_questions").select("id").eq("id", fixtures.practiceWrongQuestionIds[0]),
    ],
    [
      "practice_weakness_links",
      actor.client.from("practice_weakness_links").select("id").eq("session_id", fixtures.selfSessionId),
    ],
    [
      "user_practice_preferences",
      actor.client.from("user_practice_preferences").select("user_id").eq("user_id", fixtures.studentA.id),
    ],
    [
      "practice_preference_merge_jobs",
      actor.client.from("practice_preference_merge_jobs").select("id").eq("id", fixtures.preferenceMergeJobIds[0]),
    ],
    [
      "practice_agent_episodes",
      actor.client.from("practice_agent_episodes").select("id").eq("session_id", fixtures.selfSessionId),
    ],
  ];
}

async function assertPrivateSelfStudyDenied(actor, fixtures) {
  for (const [table, request] of selfStudyRequests(actor, fixtures)) {
    await expectHidden(`${actor.label}_denied_private_${table}`, request);
  }
}

async function assertStudentSelfStudyControl(fixtures) {
  const createdSessionId = randomUUID();
  fixtures.practiceSessionIds.push(createdSessionId);
  await expectVisible(
    "student_a_can_create_private_self_study",
    fixtures.studentA.client
      .from("practice_sessions")
      .insert({
        goal: "Student-owned live validation.",
        id: createdSessionId,
        organization_id: fixtures.primaryOrganizationId,
        title: "Student-owned live validation",
        user_id: fixtures.studentA.id,
      })
      .select("id"),
  );
  for (const [table, request] of selfStudyRequests(fixtures.studentA, fixtures)) {
    await expectVisible(`student_a_reads_own_${table}`, request);
  }
  await expectVisible(
    "student_a_can_resume_private_self_study",
    fixtures.studentA.client
      .from("practice_sessions")
      .select("id")
      .eq("id", fixtures.selfSessionId),
  );
  await expectVisible(
    "student_a_can_update_private_self_study",
    fixtures.studentA.client
      .from("practice_sessions")
      .update({ title: "Student-owned live validation resumed" })
      .eq("id", fixtures.selfSessionId)
      .select("id"),
  );
}

async function assertCourseFrameworkEvidenceBoundary(fixtures) {
  await expectVisible(
    "student_a_reads_own_framework_linked_private_self_study",
    fixtures.studentA.client.from("practice_sessions").select("id").eq("id", fixtures.selfSessionId),
  );
  await expectHidden(
    "framework_teacher_cannot_read_student_a_private_self_study",
    fixtures.teacherA.client.from("practice_sessions").select("id").eq("id", fixtures.selfSessionId),
  );
  await expectHidden(
    "framework_teacher_cannot_read_student_a_private_episode",
    fixtures.teacherA.client.from("practice_agent_episodes").select("id").eq("session_id", fixtures.selfSessionId),
  );
  await expectHidden(
    "organization_admin_cannot_read_framework_linked_private_self_study",
    fixtures.organizationAdmin.client.from("practice_sessions").select("id").eq("id", fixtures.selfSessionId),
  );
  await expectHidden(
    "organization_admin_cannot_read_framework_linked_private_episode",
    fixtures.organizationAdmin.client.from("practice_agent_episodes").select("id").eq("session_id", fixtures.selfSessionId),
  );
}

async function assertPrivateHelperBrowserBoundary(fixtures) {
  const result = await fixtures.studentA.client
    .schema("private")
    .rpc("can_read_practice_session_evidence", { target_session_id: fixtures.selfSessionId });
  assert(result.error, "private_helper_browser_rpc_unexpectedly_available");
  console.log("PASS browser requester cannot invoke the private evidence helper directly");
}

async function assertAssignmentEvidenceBoundary(fixtures) {
  await expectVisible(
    "student_a_reads_assignment_linked_session",
    fixtures.studentA.client.from("practice_sessions").select("id").eq("id", fixtures.assignmentSessionId),
  );
  await expectVisible(
    "teacher_a_reads_assignment_link",
    fixtures.teacherA.client
      .from("assignment_practice_sessions")
      .select("assignment_id")
      .eq("assignment_id", fixtures.assignmentId),
  );
  await expectVisible(
    "teacher_a_reads_assignment_session",
    fixtures.teacherA.client.from("practice_sessions").select("id").eq("id", fixtures.assignmentSessionId),
  );
  for (const table of SESSION_EVIDENCE_TABLES) {
    await expectVisible(
      `teacher_a_reads_assignment_${table}`,
      fixtures.teacherA.client.from(table).select("id").eq("session_id", fixtures.assignmentSessionId),
    );
  }
  for (const actor of [fixtures.studentB, fixtures.teacherB, fixtures.removedCoTeacher]) {
    await expectHidden(
      `${actor.label}_cannot_read_student_a_assignment_session`,
      actor.client.from("practice_sessions").select("id").eq("id", fixtures.assignmentSessionId),
    );
    for (const table of SESSION_EVIDENCE_TABLES) {
      await expectHidden(
        `${actor.label}_cannot_read_student_a_assignment_${table}`,
        actor.client.from(table).select("id").eq("session_id", fixtures.assignmentSessionId),
      );
    }
  }
  await expectHidden(
    "teacher_a_cannot_read_aggregate_wrong_question_history",
    fixtures.teacherA.client
      .from("practice_wrong_questions")
      .select("id")
      .eq("id", fixtures.practiceWrongQuestionIds[0]),
  );
  await expectHidden(
    "teacher_a_cannot_read_student_preferences",
    fixtures.teacherA.client
      .from("user_practice_preferences")
      .select("user_id")
      .eq("user_id", fixtures.studentA.id),
  );
  await expectHidden(
    "teacher_a_cannot_read_preference_merge_state",
    fixtures.teacherA.client
      .from("practice_preference_merge_jobs")
      .select("id")
      .eq("id", fixtures.preferenceMergeJobIds[0]),
  );
  await expectHidden(
    "teacher_a_cannot_mutate_student_attempt",
    fixtures.teacherA.client
      .from("practice_attempts")
      .update({ question_title: "forbidden teacher mutation" })
      .eq("id", fixtures.assignmentAttemptId)
      .select("id"),
  );
  await expectVisible(
    "student_a_reads_assignment_progress",
    fixtures.studentA.client
      .from("student_assignment_progress")
      .select("id")
      .eq("assignment_id", fixtures.assignmentId),
  );
  await expectVisible(
    "teacher_a_reads_assignment_progress",
    fixtures.teacherA.client
      .from("student_assignment_progress")
      .select("id")
      .eq("assignment_id", fixtures.assignmentId),
  );
  await expectVisible(
    "student_a_reads_sent_teacher_feedback",
    fixtures.studentA.client
      .from("teacher_feedback_notes")
      .select("id")
      .eq("id", fixtures.feedbackIds[0]),
  );
  await expectVisible(
    "teacher_a_reads_sent_teacher_feedback",
    fixtures.teacherA.client
      .from("teacher_feedback_notes")
      .select("id")
      .eq("id", fixtures.feedbackIds[0]),
  );
}

async function assertCrossStudentAndBankBoundary(fixtures) {
  await expectHidden(
    "student_b_cannot_read_student_a_private_attempt",
    fixtures.studentB.client.from("practice_attempts").select("id").eq("id", fixtures.selfAttemptId),
  );
  await expectHidden(
    "student_a_cannot_read_student_b_private_session",
    fixtures.studentA.client.from("practice_sessions").select("id").eq("id", fixtures.studentBSessionId),
  );
  await expectHidden(
    "student_a_cannot_read_student_b_private_attempt",
    fixtures.studentA.client
      .from("practice_attempts")
      .eq("session_id", fixtures.studentBSessionId)
      .select("id"),
  );
  await expectHidden(
    "student_a_has_no_source_bank_membership",
    fixtures.studentA.client.from("bank_members").select("id").eq("bank_id", fixtures.bankId),
  );
  await expectHidden(
    "student_a_cannot_browse_source_bank",
    fixtures.studentA.client.from("question_banks").select("id").eq("id", fixtures.bankId),
  );
  await expectHidden(
    "student_a_cannot_browse_source_bank_questions",
    fixtures.studentA.client.from("bank_questions").select("id").eq("bank_id", fixtures.bankId),
  );
}

async function deleteExact(service, table, column, values, category) {
  if (!values?.length) return;
  assertNoError(await service.from(table).delete().in(column, values), category);
}

async function verifyAbsent(service, table, column, values, category) {
  if (!values?.length) return;
  const result = await service.from(table).select(column, { count: "exact", head: true }).in(column, values);
  assertNoError(result, category);
  assert((result.count ?? 0) === 0, category);
}

async function cleanupFixtures(fixtures) {
  const failures = [];
  async function clean(category, operation) {
    try {
      await operation();
    } catch {
      failures.push(category);
    }
  }

  const { service } = fixtures;
  await clean("teacher_feedback_notes", () => deleteExact(service, "teacher_feedback_notes", "id", fixtures.feedbackIds, "cleanup_feedback_failed"));
  await clean("student_assignment_progress", () => deleteExact(service, "student_assignment_progress", "id", fixtures.progressIds, "cleanup_progress_failed"));
  await clean("assignment_practice_sessions", async () => {
    for (const link of fixtures.assignmentPracticeLinks) {
      assertNoError(
        await service
          .from("assignment_practice_sessions")
          .delete()
          .eq("assignment_id", link.assignment_id)
          .eq("student_id", link.student_id)
          .eq("practice_session_id", link.practice_session_id),
        "cleanup_assignment_session_link_failed",
      );
    }
  });
  await clean("practice_hint_events", () => deleteExact(service, "practice_hint_events", "id", fixtures.practiceHintIds, "cleanup_hints_failed"));
  await clean("practice_reflection_records", () => deleteExact(service, "practice_reflection_records", "id", fixtures.practiceReflectionIds, "cleanup_reflections_failed"));
  await clean("practice_weakness_links", () => deleteExact(service, "practice_weakness_links", "id", fixtures.practiceWeaknessIds, "cleanup_weakness_failed"));
  await clean("practice_wrong_questions", () => deleteExact(service, "practice_wrong_questions", "id", fixtures.practiceWrongQuestionIds, "cleanup_wrong_questions_failed"));
  await clean("practice_attempts", () => deleteExact(service, "practice_attempts", "id", fixtures.practiceAttemptIds, "cleanup_attempts_failed"));
  await clean("practice_round_questions", () => deleteExact(service, "practice_round_questions", "id", fixtures.practiceRoundQuestionIds, "cleanup_round_questions_failed"));
  await clean("practice_agent_episodes", () => deleteExact(service, "practice_agent_episodes", "id", fixtures.practiceEpisodeIds, "cleanup_episodes_failed"));
  await clean("practice_rounds", () => deleteExact(service, "practice_rounds", "id", fixtures.practiceRoundIds, "cleanup_rounds_failed"));
  await clean("practice_preference_merge_jobs", () => deleteExact(service, "practice_preference_merge_jobs", "id", fixtures.preferenceMergeJobIds, "cleanup_preference_merge_failed"));
  await clean("practice_sessions", () => deleteExact(service, "practice_sessions", "id", fixtures.practiceSessionIds, "cleanup_sessions_failed"));
  await clean("practice_course_frameworks", () => deleteExact(service, "practice_course_frameworks", "id", fixtures.courseFrameworkIds, "cleanup_course_frameworks_failed"));
  await clean("user_practice_preferences", () => deleteExact(service, "user_practice_preferences", "user_id", [fixtures.studentA?.id].filter(Boolean), "cleanup_preferences_failed"));
  await clean("assignment_items", () => deleteExact(service, "assignment_items", "assignment_id", [fixtures.assignmentId].filter(Boolean), "cleanup_assignment_items_failed"));
  await clean("assignments", () => deleteExact(service, "assignments", "id", [fixtures.assignmentId].filter(Boolean), "cleanup_assignment_failed"));
  await clean("bank_questions", () => deleteExact(service, "bank_questions", "id", fixtures.bankQuestionIds, "cleanup_bank_questions_failed"));
  await clean("questions", () => deleteExact(service, "questions", "id", fixtures.questionIds, "cleanup_questions_failed"));
  await clean("bank_members", () => deleteExact(service, "bank_members", "bank_id", [fixtures.bankId].filter(Boolean), "cleanup_bank_members_failed"));
  await clean("question_banks", () => deleteExact(service, "question_banks", "id", [fixtures.bankId].filter(Boolean), "cleanup_bank_failed"));
  await clean("classroom_join_codes", () => deleteExact(service, "classroom_join_codes", "classroom_id", fixtures.classroomIds, "cleanup_join_codes_failed"));
  await clean("classroom_members", () => deleteExact(service, "classroom_members", "classroom_id", fixtures.classroomIds, "cleanup_classroom_members_failed"));
  await clean("classrooms", () => deleteExact(service, "classrooms", "id", fixtures.classroomIds, "cleanup_classrooms_failed"));
  await clean("organization_members", () => deleteExact(service, "organization_members", "id", fixtures.organizationMemberIds, "cleanup_organization_members_failed"));
  await clean("profiles", () => deleteExact(service, "profiles", "id", fixtures.userIds, "cleanup_profiles_failed"));
  await clean("auth_users", async () => {
    for (const userId of fixtures.userIds) {
      const result = await service.auth.admin.deleteUser(userId);
      assert(!result.error, "cleanup_auth_user_failed");
    }
  });
  await clean("organizations", () => deleteExact(service, "organizations", "id", fixtures.organizationIds, "cleanup_organizations_failed"));
  await clean("cleanup_verification", async () => {
    await verifyAbsent(service, "practice_sessions", "id", fixtures.practiceSessionIds, "cleanup_sessions_verification_failed");
    await verifyAbsent(service, "practice_course_frameworks", "id", fixtures.courseFrameworkIds, "cleanup_course_frameworks_verification_failed");
    await verifyAbsent(service, "assignments", "id", [fixtures.assignmentId].filter(Boolean), "cleanup_assignment_verification_failed");
    await verifyAbsent(service, "question_banks", "id", [fixtures.bankId].filter(Boolean), "cleanup_bank_verification_failed");
    await verifyAbsent(service, "classrooms", "id", fixtures.classroomIds, "cleanup_classroom_verification_failed");
    await verifyAbsent(service, "profiles", "id", fixtures.userIds, "cleanup_profiles_verification_failed");
    await verifyAbsent(service, "organizations", "id", fixtures.organizationIds, "cleanup_organization_verification_failed");
  });
  if (failures.length) throw new HarnessError(`cleanup_incomplete:${failures.join(",")}`);
  console.log("PASS service role completed exact-ID fixture cleanup");
}

async function main() {
  const config = requireApprovedProcessEnvironment();
  const service = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fixtures = {
    assignmentId: null,
    assignmentClassroomId: null,
    assignmentPracticeLinks: [],
    bankId: null,
    bankQuestionIds: [],
    classroomIds: [],
    courseFrameworkIds: [],
    feedbackIds: [],
    organizationIds: [],
    organizationMemberIds: [],
    practiceAttemptIds: [],
    practiceEpisodeIds: [],
    practiceHintIds: [],
    practiceReflectionIds: [],
    practiceRoundIds: [],
    practiceRoundQuestionIds: [],
    practiceSessionIds: [],
    practiceWeaknessIds: [],
    practiceWrongQuestionIds: [],
    preferenceMergeJobIds: [],
    progressIds: [],
    projectRef: config.projectRef,
    questionIds: [],
    runId: opaqueRunId(),
    service,
    userIds: [],
  };
  let failure = null;

  try {
    await createFixtureOrganizations(service, fixtures);
    fixtures.teacherA = await createFixtureUser({ ...config, fixtures, label: "teacher-a", organizationId: fixtures.primaryOrganizationId, role: "teacher", service });
    fixtures.teacherB = await createFixtureUser({ ...config, fixtures, label: "teacher-b", organizationId: fixtures.primaryOrganizationId, role: "teacher", service });
    fixtures.removedCoTeacher = await createFixtureUser({ ...config, fixtures, label: "removed-co-teacher", organizationId: fixtures.primaryOrganizationId, role: "teacher", service });
    fixtures.organizationAdmin = await createFixtureUser({ ...config, fixtures, label: "organization-admin", organizationId: fixtures.primaryOrganizationId, role: "admin", service });
    fixtures.studentA = await createFixtureUser({ ...config, fixtures, label: "student-a", organizationId: fixtures.primaryOrganizationId, role: "student", service });
    fixtures.studentB = await createFixtureUser({ ...config, fixtures, label: "student-b", organizationId: fixtures.primaryOrganizationId, role: "student", service });
    fixtures.studentC = await createFixtureUser({ ...config, fixtures, label: "student-c", organizationId: fixtures.primaryOrganizationId, role: "student", service });
    fixtures.studentD = await createFixtureUser({ ...config, fixtures, label: "student-d", organizationId: fixtures.secondaryOrganizationId, role: "student", service });
    fixtures.anonymous = { client: createSessionClient(config.url, config.anonKey), label: "anonymous" };

    const assignmentClassroom = await createFixtureClassroom(fixtures, "assignment");
    fixtures.assignmentClassroomId = assignmentClassroom.classroom_id;
    await joinFixtureClassroom(fixtures.studentA, assignmentClassroom, "fixture_student_a_assignment_join_failed");
    await joinFixtureClassroom(fixtures.studentB, assignmentClassroom, "fixture_student_b_assignment_join_failed");
    await insertExact(
      service,
      "classroom_members",
      {
        classroom_id: assignmentClassroom.classroom_id,
        role: "co_teacher",
        status: "removed",
        user_id: fixtures.removedCoTeacher.id,
      },
      "fixture_removed_co_teacher_create_failed",
    );
    const otherClassroom = await createFixtureClassroom(fixtures, "unlinked");
    await joinFixtureClassroom(fixtures.studentA, otherClassroom, "fixture_student_a_unlinked_join_failed");

    await createFixtureBankAndAssignment(fixtures);
    await createPracticeFixtures(fixtures);

    await assertStudentSelfStudyControl(fixtures);
    for (const actor of [
      fixtures.studentB,
      fixtures.studentC,
      fixtures.studentD,
      fixtures.teacherA,
      fixtures.teacherB,
      fixtures.removedCoTeacher,
      fixtures.organizationAdmin,
      fixtures.anonymous,
    ]) {
      await assertPrivateSelfStudyDenied(actor, fixtures);
    }
    await assertCourseFrameworkEvidenceBoundary(fixtures);
    await assertPrivateHelperBrowserBoundary(fixtures);
    await assertAssignmentEvidenceBoundary(fixtures);
    await assertCrossStudentAndBankBoundary(fixtures);
  } catch (error) {
    failure = error;
  } finally {
    try {
      await cleanupFixtures(fixtures);
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
    clearProcessEnvironment();
  }

  if (failure) throw failure;
  console.log("PASS disposable Student self-study isolation E2E completed");
}

try {
  await main();
} catch (error) {
  console.error(`FAIL student-self-study-isolation-live-e2e:${safeFailureCategory(error)}`);
  process.exitCode = 1;
}
