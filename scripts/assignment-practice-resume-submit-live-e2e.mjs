#!/usr/bin/env node

// Narrow disposable validation for Assignment Practice resume and submit. It
// never loads environment files and can call only its local fake HTTP Provider.

import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const edgePaths = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const edgePath = edgePaths.find((candidate) => existsSync(candidate)) ?? null;

const DISPOSABLE_CONFIRMATION = "DISPOSABLE_ASSIGNMENT_RESUME_SUBMIT_E2E";
const CLEANUP_CONFIRMATION = "DELETE_ASSIGNMENT_RESUME_SUBMIT_E2E_FIXTURES";
const LOCAL_FAKE_PROVIDER_MODE = "LOCAL_FAKE_HTTP_PROVIDER";
const FIXTURE_KIND = "assignment_practice_resume_submit_live_e2e";
const FIXTURE_PREFIX = "assignment-resume-submit-";
const FIXTURE_SOURCE = "assignment_resume_submit_live_e2e";
const REQUIRED_ENVIRONMENT = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_ENVIRONMENT",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_EXPECTED_PROJECT_REF",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_CONFIRM_CLEANUP",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_PROVIDER_MODE",
]);
const ASSIGNMENT_START_CODES = new Set([
  "INVALID_REQUEST",
  "AUTHENTICATION_REQUIRED",
  "STUDENT_NOT_ELIGIBLE",
  "ASSIGNMENT_NOT_AVAILABLE",
  "ASSIGNMENT_CONTENT_UNAVAILABLE",
  "TAXONOMY_READ_FAILED",
  "PREFERENCE_READ_FAILED",
  "PREFERENCE_CREATE_FAILED",
  "PREFERENCE_MERGE_READ_FAILED",
  "PREFERENCE_MERGE_WRITE_FAILED",
  "SESSION_CREATE_FAILED",
  "ROUND_PERSISTENCE_FAILED",
  "ASSIGNMENT_LINKAGE_FAILED",
  "SESSION_RELOAD_FAILED",
  "PRACTICE_START_FAILED",
]);
const PREFLIGHT_CATEGORIES = Object.freeze([
  "AUTH_USERS",
  "ORGANIZATIONS",
  "PROFILES",
  "ORGANIZATION_MEMBERSHIPS",
  "CLASSROOMS",
  "CLASSROOM_MEMBERSHIPS",
  "BANKS",
  "BANK_MEMBERSHIPS",
  "QUESTIONS",
  "BANK_QUESTIONS",
  "ASSIGNMENTS",
  "ASSIGNMENT_ITEMS",
  "PRACTICE_PREFERENCES",
  "PREFERENCE_MERGE_JOBS",
  "PRACTICE_SESSIONS",
  "PRACTICE_ROUNDS",
  "PRACTICE_ROUND_QUESTIONS",
  "PRACTICE_ATTEMPTS",
  "PRACTICE_EPISODES",
  "PRACTICE_HINT_EVENTS",
  "PRACTICE_REFLECTION_ROWS",
  "PRACTICE_WEAKNESS_ROWS",
  "PRACTICE_WRONG_QUESTION_ROWS",
  "ASSIGNMENT_PRACTICE_LINKS",
  "ASSIGNMENT_PROGRESS",
  "AI_PROVIDER_ROWS",
]);
const ALLOWED_FAILURE_CATEGORIES = new Set([
  "MISSING_PROCESS_ENVIRONMENT",
  "PRODUCTION_ENVIRONMENT_REFUSED",
  "DISPOSABLE_ENVIRONMENT_ACKNOWLEDGEMENT_REQUIRED",
  "CLEANUP_ACKNOWLEDGEMENT_REQUIRED",
  "LOCAL_FAKE_PROVIDER_MODE_REQUIRED",
  "EXPECTED_PROJECT_IDENTITY_MISMATCH",
  "LOCAL_EDGE_BROWSER_MISSING",
  "STALE_FIXTURE_PREFLIGHT_FAILED",
  "STALE_FIXTURES_BLOCKED",
  "FIXTURE_SETUP_FAILED",
  "FIXTURE_CONTRACT_FAILED",
  "LOCAL_SERVER_START_FAILED",
  "AUTHENTICATED_STUDENT_SESSION_FAILED",
  "ASSIGNMENT_RESUME_FAILED",
  "ANSWER_SUBMISSION_FAILED",
  "REVIEW_OR_GRADE_FAILED",
  "ASSIGNMENT_START_REQUEST_FAILED",
  "ASSIGNMENT_START_NON_2XX",
  "COMPLETED_RELOAD_ROUTE_FAILED",
  "COMPLETED_RELOAD_START_FAILED",
  "COMPLETED_SESSION_MISMATCH",
  "COMPLETED_RESULT_BADGE_TIMEOUT",
  "COMPLETED_ANSWER_CONTROL_NOT_FOUND",
  "COMPLETED_ANSWER_NOT_IMMUTABLE",
  "COMPLETED_ANSWER_VALUE_NOT_RESTORED",
  "COMPLETED_POSTCONDITION_FAILED",
  "MY_WORK_NAVIGATION_FAILED",
  "MY_WORK_COMPLETED_SECTION_NOT_FOUND",
  "MY_WORK_COMPLETED_ASSIGNMENT_NOT_FOUND",
  "POSTCONDITION_FAILED",
  "CLEANUP_FAILED",
  "TEMPORARY_SERVER_STOP_FAILED",
  "UNEXPECTED_FAILURE",
]);
const SERVER_STOP_CATEGORIES = new Set([
  "SERVER_STOP_GRACEFUL",
  "SERVER_STOP_TREE_TERMINATED",
  "SERVER_STOP_TIMEOUT",
  "SERVER_STOP_EXIT_NOT_OBSERVED",
  "SERVER_PORT_STILL_OPEN",
  "SERVER_STOP_FAILED",
]);
const SERVER_GRACEFUL_STOP_TIMEOUT_MS = 5_000;
const SERVER_FORCED_STOP_TIMEOUT_MS = 10_000;
const SERVER_PORT_CLOSE_TIMEOUT_MS = 5_000;

class HarnessError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function fail(category) {
  throw new HarnessError(category);
}

function assert(condition, category) {
  if (!condition) fail(category);
}

async function runBounded(category, operation) {
  try {
    return await operation();
  } catch {
    fail(category);
  }
}

function boundedFailureCategory(error) {
  const candidate = typeof error?.category === "string" ? error.category : "UNEXPECTED_FAILURE";
  return ALLOWED_FAILURE_CATEGORIES.has(candidate) ? candidate : "UNEXPECTED_FAILURE";
}

function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function requireApprovedEnvironment({ requireBrowser }) {
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    fail("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (REQUIRED_ENVIRONMENT.some((name) => !process.env[name]?.trim())) {
    fail("MISSING_PROCESS_ENVIRONMENT");
  }
  if (process.env.ASSIGNMENT_RESUME_SUBMIT_E2E_ENVIRONMENT !== DISPOSABLE_CONFIRMATION) {
    fail("DISPOSABLE_ENVIRONMENT_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (process.env.ASSIGNMENT_RESUME_SUBMIT_E2E_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    fail("CLEANUP_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (process.env.ASSIGNMENT_RESUME_SUBMIT_E2E_PROVIDER_MODE !== LOCAL_FAKE_PROVIDER_MODE) {
    fail("LOCAL_FAKE_PROVIDER_MODE_REQUIRED");
  }
  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (
    !projectRef ||
    projectRef !== process.env.ASSIGNMENT_RESUME_SUBMIT_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase()
  ) {
    fail("EXPECTED_PROJECT_IDENTITY_MISMATCH");
  }
  if (requireBrowser && !edgePath) fail("LOCAL_EDGE_BROWSER_MISSING");

  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    encryptionKey: process.env.AI_PROVIDER_ENCRYPTION_KEY,
    projectRef,
    serviceRoleKey: process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

function clearProcessEnvironment() {
  for (const name of REQUIRED_ENVIRONMENT) delete process.env[name];
  return REQUIRED_ENVIRONMENT.every((name) => process.env[name] === undefined);
}

function serviceClient(config) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function assertNoError(result, category) {
  if (result?.error) fail(category);
  return result?.data;
}

function ids(rows) {
  return (rows ?? []).map((row) => row.id).filter(Boolean);
}

async function selectByIds(service, table, column, values, columns = "id") {
  if (!values.length) return [];
  const result = await service.from(table).select(columns).in(column, values);
  if (result.error) fail("STALE_FIXTURE_PREFLIGHT_FAILED");
  return result.data ?? [];
}

async function selectFixtureAuthUsers(service) {
  const matches = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) fail("STALE_FIXTURE_PREFLIGHT_FAILED");
    const users = result.data?.users ?? [];
    matches.push(...users.filter((user) => user.user_metadata?.fixture_kind === FIXTURE_KIND));
    if (users.length < 1000) break;
  }
  return matches;
}

// PREFLIGHT_READ_ONLY_START
async function readStaleFixtureCounts(service) {
  const authUsers = await selectFixtureAuthUsers(service);
  const organizations = assertNoError(
    await service.from("organizations").select("id").like("slug", `${FIXTURE_PREFIX}%`),
    "STALE_FIXTURE_PREFLIGHT_FAILED",
  ) ?? [];
  const profiles = assertNoError(
    await service.from("profiles").select("id").like("username", `${FIXTURE_PREFIX}%`),
    "STALE_FIXTURE_PREFLIGHT_FAILED",
  ) ?? [];
  const questions = assertNoError(
    await service.from("questions").select("id").eq("source", FIXTURE_SOURCE),
    "STALE_FIXTURE_PREFLIGHT_FAILED",
  ) ?? [];

  const userIds = Array.from(new Set([...ids(authUsers), ...ids(profiles)]));
  const organizationIds = ids(organizations);
  const questionIds = ids(questions);
  const organizationMemberships = organizationIds.length
    ? await selectByIds(service, "organization_members", "organization_id", organizationIds)
    : await selectByIds(service, "organization_members", "user_id", userIds);
  const classrooms = await selectByIds(service, "classrooms", "organization_id", organizationIds);
  const classroomIds = ids(classrooms);
  const classroomMemberships = await selectByIds(service, "classroom_members", "classroom_id", classroomIds);
  const banks = await selectByIds(service, "question_banks", "organization_id", organizationIds);
  const bankIds = ids(banks);
  const bankMemberships = await selectByIds(service, "bank_members", "bank_id", bankIds);
  const bankQuestions = await selectByIds(service, "bank_questions", "bank_id", bankIds);
  const assignments = await selectByIds(service, "assignments", "organization_id", organizationIds);
  const assignmentIds = ids(assignments);
  const assignmentItems = await selectByIds(service, "assignment_items", "assignment_id", assignmentIds);
  const preferences = await selectByIds(service, "user_practice_preferences", "user_id", userIds, "user_id");
  const sessions = await selectByIds(service, "practice_sessions", "user_id", userIds);
  const sessionIds = ids(sessions);
  const mergeJobs = await selectByIds(service, "practice_preference_merge_jobs", "user_id", userIds);
  const rounds = await selectByIds(service, "practice_rounds", "session_id", sessionIds);
  const roundQuestions = await selectByIds(service, "practice_round_questions", "session_id", sessionIds);
  const attempts = await selectByIds(service, "practice_attempts", "session_id", sessionIds);
  const episodes = await selectByIds(service, "practice_agent_episodes", "session_id", sessionIds);
  const hintEvents = await selectByIds(service, "practice_hint_events", "session_id", sessionIds);
  const reflectionRows = await selectByIds(service, "practice_reflection_records", "session_id", sessionIds);
  const weaknessRows = await selectByIds(service, "practice_weakness_links", "session_id", sessionIds);
  const wrongQuestionRows = await selectByIds(service, "practice_wrong_questions", "user_id", userIds);
  const providerRows = await selectByIds(service, "ai_provider_profiles", "organization_id", organizationIds);
  const assignmentLinks = await selectByIds(
    service,
    "assignment_practice_sessions",
    "assignment_id",
    assignmentIds,
    "assignment_id",
  );
  const assignmentProgress = await selectByIds(
    service,
    "student_assignment_progress",
    "assignment_id",
    assignmentIds,
  );

  const counts = {
    ASSIGNMENTS: assignments.length,
    ASSIGNMENT_ITEMS: assignmentItems.length,
    ASSIGNMENT_PRACTICE_LINKS: assignmentLinks.length,
    ASSIGNMENT_PROGRESS: assignmentProgress.length,
    AI_PROVIDER_ROWS: providerRows.length,
    AUTH_USERS: authUsers.length,
    BANKS: banks.length,
    BANK_MEMBERSHIPS: bankMemberships.length,
    BANK_QUESTIONS: bankQuestions.length,
    CLASSROOMS: classrooms.length,
    CLASSROOM_MEMBERSHIPS: classroomMemberships.length,
    ORGANIZATIONS: organizations.length,
    ORGANIZATION_MEMBERSHIPS: organizationMemberships.length,
    PRACTICE_EPISODES: episodes.length,
    PRACTICE_ATTEMPTS: attempts.length,
    PRACTICE_HINT_EVENTS: hintEvents.length,
    PRACTICE_REFLECTION_ROWS: reflectionRows.length,
    PRACTICE_WEAKNESS_ROWS: weaknessRows.length,
    PRACTICE_WRONG_QUESTION_ROWS: wrongQuestionRows.length,
    PRACTICE_PREFERENCES: preferences.length,
    PRACTICE_ROUNDS: rounds.length,
    PRACTICE_ROUND_QUESTIONS: roundQuestions.length,
    PRACTICE_SESSIONS: sessions.length,
    PREFERENCE_MERGE_JOBS: mergeJobs.length,
    PROFILES: profiles.length,
    QUESTIONS: questions.length,
  };
  const residueTotal = PREFLIGHT_CATEGORIES.reduce((total, category) => total + counts[category], 0);
  return {
    affectedCategories: PREFLIGHT_CATEGORIES.filter((category) => counts[category] > 0),
    counts,
    residueTotal,
  };
}
// PREFLIGHT_READ_ONLY_END

function printPreflight(report) {
  for (const category of PREFLIGHT_CATEGORIES) {
    console.log(`${category}=${report.counts[category]}`);
  }
  if (report.residueTotal === 0) {
    console.log("STALE_ASSIGNMENT_RESUME_SUBMIT_PREFLIGHT_PASS");
    console.log("residue_total=0");
    return;
  }
  console.log("STALE_ASSIGNMENT_RESUME_SUBMIT_PREFLIGHT_BLOCKED");
  console.log(`residue_total=${report.residueTotal}`);
  console.log(`affected_categories=${report.affectedCategories.join(",")}`);
}

function createFixtureState(service) {
  return {
    assignmentIds: [],
    bankIds: [],
    bankQuestionIds: [],
    classroomIds: [],
    classroomMemberIds: [],
    organizationIds: [],
    organizationMemberIds: [],
    phase: "INITIALIZATION",
    preferenceState: "NOT_REACHED",
    profileIds: [],
    providerProfileIds: [],
    questionIds: [],
    roundIds: [],
    service,
    sessionIds: [],
    student: null,
    teacher: null,
    userIds: [],
  };
}

function createJourneyDiagnostics() {
  return {
    assignmentStartCode: "UNRECOGNIZED_API_CODE",
    assignmentStartHttpStatus: 0,
    completedAnswerControl: "NOT_CHECKED",
    completedAnswerImmutable: "NOT_CHECKED",
    completedAnswerValue: "NOT_CHECKED",
    completedReloadStartCode: "UNRECOGNIZED_API_CODE",
    completedReloadStartHttpStatus: 0,
    completedResultBadgeState: "NOT_OBSERVED",
    gradeCategory: "GRADE_NOT_OBSERVED",
    gradeHttpStatus: 0,
    persistedAttemptAnswer: "NOT_CHECKED",
    persistedAttemptRow: "NOT_CHECKED",
    persistenceResult: "NOT_OBSERVED",
    reloadStartCode: "UNRECOGNIZED_API_CODE",
    reloadStartHttpStatus: 0,
    reloadSessionConsistency: "NOT_OBSERVED",
    resultBadgeState: "NOT_OBSERVED",
    reviewCategory: "REVIEW_NOT_OBSERVED",
    reviewHttpStatus: 0,
    sessionDetailAnswer: "NOT_CHECKED",
    sessionDetailAttempt: "NOT_CHECKED",
  };
}

function gradeHttpStatusLabel(diagnostics) {
  if (diagnostics.gradeHttpStatus) return diagnostics.gradeHttpStatus;
  return diagnostics.gradeCategory === "GRADE_NOT_REQUIRED" ? "NOT_REQUIRED" : "NOT_OBSERVED";
}

function printCompletedAnswerDiagnostics(diagnostics) {
  if (diagnostics.persistedAttemptRow !== "NOT_CHECKED") {
    console.log(`persisted_attempt_row=${diagnostics.persistedAttemptRow}`);
    console.log(`persisted_attempt_answer=${diagnostics.persistedAttemptAnswer}`);
  }
  if (diagnostics.sessionDetailAttempt !== "NOT_CHECKED") {
    console.log(`session_detail_attempt=${diagnostics.sessionDetailAttempt}`);
    console.log(`session_detail_answer=${diagnostics.sessionDetailAnswer}`);
  }
  if (diagnostics.completedAnswerControl !== "NOT_CHECKED") {
    console.log(`completed_answer_control=${diagnostics.completedAnswerControl}`);
    console.log(`completed_answer_immutable=${diagnostics.completedAnswerImmutable}`);
    console.log(`completed_answer_value=${diagnostics.completedAnswerValue}`);
  }
}

function classifyPracticeAnswer(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return value.trim() ? "PRESENT" : "EMPTY";
  if (typeof value === "number" || typeof value === "boolean") return "PRESENT";
  if (Array.isArray(value)) {
    for (const item of value) {
      if (classifyPracticeAnswer(item) === "PRESENT") return "PRESENT";
    }
    return "EMPTY";
  }
  if (typeof value === "object") {
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) return "PRESENT";
    }
  }
  return "EMPTY";
}

function classifyPersistedAttemptRows(rows) {
  if (!rows.length) return { answer: "NOT_CHECKED", row: "MISSING" };
  if (rows.length > 1) return { answer: "NOT_CHECKED", row: "AMBIGUOUS" };
  return { answer: classifyPracticeAnswer(rows[0].answer), row: "FOUND" };
}

async function sessionDetailAttemptDiagnostics(page, { roundId, sessionId, sourceQuestionId }) {
  return page.evaluate(async ({ path, roundId: expectedRoundId, sourceQuestionId: expectedSourceId }) => {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok) return { answer: "NOT_CHECKED", attempt: "MISSING" };
    const payload = await response.json();
    const rounds = Array.isArray(payload?.session?.rounds) ? payload.session.rounds : [];
    const round = rounds.find((item) => item?.id === expectedRoundId);
    const attempts = Array.isArray(round?.attempts) ? round.attempts : [];
    const attempt = attempts.find((item) => item?.sourceQuestionId === expectedSourceId);
    if (!attempt) return { answer: "NOT_CHECKED", attempt: "MISSING" };

    const classify = (value) => {
      if (value === null || value === undefined) return "NULL";
      if (typeof value === "string") return value.trim() ? "PRESENT" : "EMPTY";
      if (typeof value === "number" || typeof value === "boolean") return "PRESENT";
      if (Array.isArray(value)) {
        for (const item of value) {
          if (classify(item) === "PRESENT") return "PRESENT";
        }
        return "EMPTY";
      }
      if (typeof value === "object") {
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) return "PRESENT";
        }
      }
      return "EMPTY";
    };

    return { answer: classify(attempt.answer), attempt: "FOUND" };
  }, {
    path: `/api/practice/sessions/${sessionId}`,
    roundId,
    sourceQuestionId,
  });
}

function phase(fixtures, name) {
  fixtures.phase = name;
  console.log(`PHASE=${name}`);
}

function randomPassword() {
  return `AssignmentStart!${randomBytes(24).toString("base64url")}`;
}

async function createOrganization(fixtures, runId) {
  const row = assertNoError(
    await fixtures.service
      .from("organizations")
      .insert({ name: `Assignment Start ${runId}`, slug: `${FIXTURE_PREFIX}${runId}`, status: "active" })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(row?.id, "FIXTURE_SETUP_FAILED");
  fixtures.organizationIds.push(row.id);
  return row.id;
}

async function createActor({ fixtures, label, organizationId, role, runId }) {
  const username = `${FIXTURE_PREFIX}${runId}-${label}`;
  const email = `${username}@local.app`;
  const password = randomPassword();
  const created = await fixtures.service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: FIXTURE_KIND },
  });
  assert(!created.error && created.data.user?.id, "FIXTURE_SETUP_FAILED");
  const userId = created.data.user.id;
  fixtures.userIds.push(userId);

  assertNoError(
    await fixtures.service.from("profiles").upsert(
      {
        default_organization_id: organizationId,
        display_name: `Assignment Start ${label}`,
        email,
        id: userId,
        role,
        status: "active",
        username,
      },
      { onConflict: "id" },
    ),
    "FIXTURE_SETUP_FAILED",
  );
  fixtures.profileIds.push(userId);
  const membership = assertNoError(
    await fixtures.service
      .from("organization_members")
      .insert({ organization_id: organizationId, role, status: "active", user_id: userId })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(membership?.id, "FIXTURE_SETUP_FAILED");
  fixtures.organizationMemberIds.push(membership.id);
  return { id: userId, password, username };
}

async function createLearningFixtures(fixtures, runId) {
  const organizationId = await createOrganization(fixtures, runId);
  const teacher = await createActor({ fixtures, label: "teacher", organizationId, role: "teacher", runId });
  const student = await createActor({ fixtures, label: "student", organizationId, role: "student", runId });
  const assignmentTitle = `Assignment Start ${runId}`;
  fixtures.student = student;
  fixtures.teacher = teacher;

  const bank = assertNoError(
    await fixtures.service
      .from("question_banks")
      .insert({
        created_by: teacher.id,
        description: "Disposable narrow live validation bank.",
        metadata: { fixture_kind: FIXTURE_KIND },
        name: `Assignment Start Bank ${runId}`,
        organization_id: organizationId,
        owner_id: teacher.id,
        status: "active",
        updated_by: teacher.id,
        visibility: "private",
      })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(bank?.id, "FIXTURE_SETUP_FAILED");
  fixtures.bankIds.push(bank.id);
  assertNoError(
    await fixtures.service.from("bank_members").insert({
      bank_id: bank.id,
      joined_at: new Date().toISOString(),
      role: "owner",
      status: "active",
      user_id: teacher.id,
    }),
    "FIXTURE_SETUP_FAILED",
  );

  const question = assertNoError(
    await fixtures.service
      .from("questions")
      .insert({
        answer_spec: { kind: "exact_text", value: "2" },
        content_html: "<p>Disposable narrow validation question.</p>",
        content_source: "Disposable narrow validation question.",
        content_source_format: "plain_text",
        created_by: teacher.id,
        difficulty_rating: 300,
        options: [],
        organization_id: organizationId,
        owner_bank_id: bank.id,
        question_code: `${FIXTURE_PREFIX}${runId}`,
        question_type: "fill_blank",
        solution_html: "<p>Disposable narrow validation solution.</p>",
        solution_source: "Disposable narrow validation solution.",
        solution_source_format: "plain_text",
        source: FIXTURE_SOURCE,
        source_kind: "manual",
        status: "review",
        title: `Assignment Start Question ${runId}`,
        updated_by: teacher.id,
        visibility: "private",
      })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(question?.id, "FIXTURE_SETUP_FAILED");
  fixtures.questionIds.push(question.id);

  const bankQuestion = assertNoError(
    await fixtures.service
      .from("bank_questions")
      .insert({
        added_by: teacher.id,
        bank_id: bank.id,
        metadata: { fixture_kind: FIXTURE_KIND },
        question_id: question.id,
        source_kind: "manual",
        status: "active",
      })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(bankQuestion?.id, "FIXTURE_SETUP_FAILED");
  fixtures.bankQuestionIds.push(bankQuestion.id);

  const classroom = assertNoError(
    await fixtures.service
      .from("classrooms")
      .insert({
        created_by: teacher.id,
        description: "Disposable narrow live validation classroom.",
        name: `Assignment Start Classroom ${runId}`,
        organization_id: organizationId,
        owner_id: teacher.id,
        status: "active",
        subject: "Validation",
        updated_by: teacher.id,
      })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(classroom?.id, "FIXTURE_SETUP_FAILED");
  fixtures.classroomIds.push(classroom.id);
  for (const member of [
    { role: "teacher", user_id: teacher.id },
    { role: "student", user_id: student.id },
  ]) {
    const membership = assertNoError(
      await fixtures.service
        .from("classroom_members")
        .insert({
          classroom_id: classroom.id,
          joined_at: new Date().toISOString(),
          role: member.role,
          status: "active",
          user_id: member.user_id,
        })
        .select("id")
        .single(),
      "FIXTURE_SETUP_FAILED",
    );
    assert(membership?.id, "FIXTURE_SETUP_FAILED");
    fixtures.classroomMemberIds.push(membership.id);
  }

  const assignment = assertNoError(
    await fixtures.service
      .from("assignments")
      .insert({
        assigned_at: new Date().toISOString(),
        classroom_id: classroom.id,
        created_by: teacher.id,
        instructions: "Disposable narrow live validation.",
        organization_id: organizationId,
        source_kind: "question_bank",
        source_record_id: bank.id,
        source_summary: { fixture_kind: FIXTURE_KIND, itemCount: 1 },
        status: "assigned",
        title: assignmentTitle,
      })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(assignment?.id, "FIXTURE_SETUP_FAILED");
  fixtures.assignmentIds.push(assignment.id);
  assertNoError(
    await fixtures.service.from("assignment_items").insert({
      assignment_id: assignment.id,
      bank_question_id: bankQuestion.id,
      item_type: "question",
      order_index: 1,
      question_id: question.id,
      source_bank_id: bank.id,
    }),
    "FIXTURE_SETUP_FAILED",
  );

  return {
    assignmentId: assignment.id,
    assignmentTitle,
    questionId: question.id,
    questionTitle: `Assignment Start Question ${runId}`,
    studentId: student.id,
  };
}

function encryptFixtureSecret(value, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(encryptionKey).digest(),
    iv,
  );
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    api_key_ciphertext: ciphertext.toString("base64"),
    api_key_iv: iv.toString("base64"),
    api_key_last4: value.slice(-4),
    api_key_tag: cipher.getAuthTag().toString("base64"),
  };
}

function providerMayRunPractice(row) {
  const provider = String(row.provider ?? "").toLowerCase();
  const baseUrl = String(row.base_url ?? "").toLowerCase();
  return (
    provider === "compatible" ||
    provider === "openai" ||
    provider === "deepseek" ||
    (provider === "gemini" && /(openai|\/v1)/.test(baseUrl))
  );
}

async function ensureNoExistingCompatibleDefault(fixtures) {
  const profiles = assertNoError(
    await fixtures.service
      .from("ai_provider_profiles")
      .select("provider, base_url, is_default")
      .eq("enabled", true)
      .is("deleted_at", null),
    "FIXTURE_CONTRACT_FAILED",
  ) ?? [];
  assert(
    !profiles.some((profile) => profile.is_default && providerMayRunPractice(profile)),
    "FIXTURE_CONTRACT_FAILED",
  );
}

async function createFixtureProvider({ encryptionKey, fakeProvider, fixtures }) {
  const secret = randomBytes(24).toString("base64url");
  fakeProvider.setExpectedCredential(secret);
  const inserted = assertNoError(
    await fixtures.service
      .from("ai_provider_profiles")
      .insert({
        base_url: fakeProvider.baseUrl,
        created_by: fixtures.teacher.id,
        enabled: true,
        is_default: false,
        model: "assignment-resume-submit-fixture",
        name: `!${FIXTURE_PREFIX}${randomUUID()}`,
        organization_id: fixtures.organizationIds[0],
        provider: "compatible",
        supports_pdf_input: false,
        supports_vision_images: false,
        updated_by: fixtures.teacher.id,
        ...encryptFixtureSecret(secret, encryptionKey),
      })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(inserted?.id, "FIXTURE_SETUP_FAILED");
  fixtures.providerProfileIds.push(inserted.id);

  const candidates = assertNoError(
    await fixtures.service
      .from("ai_provider_profiles")
      .select("id, provider, base_url, enabled, is_default, name")
      .eq("enabled", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    "FIXTURE_CONTRACT_FAILED",
  ) ?? [];
  const compatible = candidates.filter(providerMayRunPractice);
  const selected = compatible.find((profile) => profile.is_default) ?? compatible[0] ?? null;
  assert(selected?.id === inserted.id, "FIXTURE_CONTRACT_FAILED");
}

function readRequestBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function startLocalFakeProvider() {
  const state = {
    expectedCredential: "",
    requestCount: 0,
    sawOnlyExpectedCredential: true,
  };
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    state.requestCount += 1;
    state.sawOnlyExpectedCredential &&=
      request.headers.authorization === `Bearer ${state.expectedCredential}`;
    let body = {};
    try {
      body = JSON.parse(await readRequestBody(request));
    } catch {
      response.writeHead(400, { "content-type": "application/json" }).end("{}");
      return;
    }
    if (body.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Disposable review." } }] })}\n\n` +
          `data: ${JSON.stringify({ usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 } })}\n\n` +
          "data: [DONE]\n\n",
      );
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        is_correct: true,
        judgment_reason: "Disposable exact answer matched.",
        score: 1,
        solution_key_points: "The expected answer is 2.",
        student_answer: "2",
      }) } }],
      usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
    }));
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object", "FIXTURE_SETUP_FAILED");
  return {
    assertUsedSafely() {
      assert(state.requestCount > 0 && state.sawOnlyExpectedCredential, "REVIEW_OR_GRADE_FAILED");
    },
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
    setExpectedCredential(value) {
      state.expectedCredential = value;
    },
  };
}

async function countRows(query, category = "FIXTURE_CONTRACT_FAILED") {
  const result = await query;
  if (result.error) fail(category);
  return Number(result.count ?? 0);
}

async function verifyFirstStartPrecondition(fixtures, studentId) {
  const [preferenceCount, sessionCount, mergeCount] = await Promise.all([
    countRows(
      fixtures.service
        .from("user_practice_preferences")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", studentId),
    ),
    countRows(
      fixtures.service
        .from("practice_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", studentId),
    ),
    countRows(
      fixtures.service
        .from("practice_preference_merge_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", studentId),
    ),
  ]);
  if (preferenceCount > 0) fixtures.preferenceState = "EXISTING";
  assert(preferenceCount === 0 && sessionCount === 0 && mergeCount === 0, "FIXTURE_CONTRACT_FAILED");
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function childExitObserved(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child, timeoutMs) {
  if (childExitObserved(child)) return Promise.resolve(true);

  return new Promise((resolveExit) => {
    let settled = false;
    let timer = null;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.off("exit", onExit);
      resolveExit(exited);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
    timer = setTimeout(() => finish(childExitObserved(child)), timeoutMs);
    if (childExitObserved(child)) finish(true);
  });
}

function portIsListening(port) {
  return new Promise((resolveListening) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolveListening(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function waitForPortClosed(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (!(await portIsListening(port))) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  } while (Date.now() < deadline);
  return !(await portIsListening(port));
}

function terminateWindowsProcessTree(childPid) {
  if (!Number.isInteger(childPid) || childPid <= 0) return Promise.resolve(false);

  return new Promise((resolveTermination) => {
    let settled = false;
    const killer = spawn("taskkill", ["/PID", String(childPid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    const finish = (terminated) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveTermination(terminated);
    };
    const timer = setTimeout(() => {
      killer.kill();
      finish(false);
    }, SERVER_GRACEFUL_STOP_TIMEOUT_MS);
    killer.once("error", () => finish(false));
    killer.once("exit", (code) => finish(code === 0));
  });
}

async function stopOwnedTemporaryServer(child, port) {
  const childPid = child.pid;
  if (!Number.isInteger(childPid) || childPid <= 0) {
    return { category: "SERVER_STOP_FAILED", stopped: false };
  }

  if (!childExitObserved(child)) {
    try {
      child.kill("SIGTERM");
    } catch {
      // The bounded exit wait below determines whether the process already exited.
    }
  }

  const gracefulExitObserved = await waitForChildExit(child, SERVER_GRACEFUL_STOP_TIMEOUT_MS);
  if (gracefulExitObserved) {
    const portClosed = await waitForPortClosed(port, SERVER_PORT_CLOSE_TIMEOUT_MS);
    return portClosed
      ? { category: "SERVER_STOP_GRACEFUL", stopped: true }
      : { category: "SERVER_PORT_STILL_OPEN", stopped: false };
  }

  let forcedCategory = "SERVER_STOP_TIMEOUT";
  if (process.platform === "win32") {
    await terminateWindowsProcessTree(childPid);
    forcedCategory = "SERVER_STOP_TREE_TERMINATED";
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      return { category: "SERVER_STOP_FAILED", stopped: false };
    }
  }

  const forcedExitObserved = await waitForChildExit(child, SERVER_FORCED_STOP_TIMEOUT_MS);
  if (!forcedExitObserved) {
    return { category: "SERVER_STOP_EXIT_NOT_OBSERVED", stopped: false };
  }
  const portClosed = await waitForPortClosed(port, SERVER_PORT_CLOSE_TIMEOUT_MS);
  if (!portClosed) return { category: "SERVER_PORT_STILL_OPEN", stopped: false };
  return { category: forcedCategory, stopped: true };
}

async function startLocalNextServer(config) {
  const port = await findFreePort();
  assert(Number.isInteger(port) && port > 0, "LOCAL_SERVER_START_FAILED");
  const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const environment = {
    ...process.env,
    AI_PROVIDER_ENCRYPTION_KEY: config.encryptionKey,
    CLEAN_SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NODE_ENV: "development",
    PRACTICE_AGENT_FULL_CALL_LOGS: "false",
    PRACTICE_AGENT_TOKEN_STATS_LOGS: "false",
    VERCEL: "",
    VERCEL_ENV: "",
  };
  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "AI_PROVIDER_GATEWAY_TOKEN",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
    "ASSIGNMENT_RESUME_SUBMIT_E2E_ENVIRONMENT",
    "ASSIGNMENT_RESUME_SUBMIT_E2E_EXPECTED_PROJECT_REF",
    "ASSIGNMENT_RESUME_SUBMIT_E2E_CONFIRM_CLEANUP",
    "ASSIGNMENT_RESUME_SUBMIT_E2E_PROVIDER_MODE",
  ]) {
    delete environment[name];
  }

  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(port)], {
    cwd: root,
    env: environment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/auth/login`);
      if (response.status < 500) {
        return {
          close: () => stopOwnedTemporaryServer(child, port),
          origin,
        };
      }
    } catch {
      // Bounded readiness retry; server output is intentionally discarded.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  await stopOwnedTemporaryServer(child, port).catch(() => ({
    category: "SERVER_STOP_FAILED",
    stopped: false,
  }));
  fail("LOCAL_SERVER_START_FAILED");
}

async function signInThroughBrowser(page, origin, student) {
  await page.goto(`${origin}/auth/login?next=%2Fstudent`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(student.username);
  await page.locator("#password").fill(student.password);
  await Promise.all([
    page.waitForURL(/\/student(?:$|\?)/, { timeout: 30_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

function isPracticePost(response, pathname) {
  try {
    const request = response.request();
    return request.method() === "POST" && new URL(response.url()).pathname === pathname;
  } catch {
    return false;
  }
}

async function waitForAssignmentStart(page) {
  const response = await page.waitForResponse(
    (candidate) => isPracticePost(candidate, "/api/practice/assignments/start"),
    { timeout: 30_000 },
  );
  const status = response.status();
  let code = status >= 200 && status < 300 ? "NONE" : "UNRECOGNIZED_API_CODE";
  let sessionId = null;
  try {
    const payload = await response.json();
    if (status < 200 || status >= 300) {
      const candidate = typeof payload?.code === "string" ? payload.code : null;
      if (candidate && ASSIGNMENT_START_CODES.has(candidate)) code = candidate;
    }
    if (status >= 200 && status < 300 && typeof payload?.session?.id === "string") {
      sessionId = payload.session.id;
    }
  } catch {
    // The body is discarded after extracting only the internal session identity.
  }
  return { code, sessionId, status };
}

function reviewCategory(streamText) {
  const events = [...String(streamText).matchAll(/(?:^|\n)event:\s*([a-z_]+)\s*(?=\r?\n|$)/gi)]
    .map((match) => match[1]?.toLowerCase());
  if (events.includes("result")) return "REVIEW_SUCCESS_EVENT";
  if (events.includes("error")) return "REVIEW_ERROR_EVENT";
  return "REVIEW_STREAM_INCOMPLETE";
}

async function waitForReview(page) {
  const response = await page.waitForResponse(
    (candidate) => isPracticePost(candidate, "/api/practice/review"),
    { timeout: 60_000 },
  );
  const status = response.status();
  const category = status >= 200 && status < 300
    ? reviewCategory(await response.text().catch(() => ""))
    : "REVIEW_ERROR_EVENT";
  return { category, status };
}

function observeGrade(page) {
  let status = 0;
  const onResponse = (response) => {
    if (isPracticePost(response, "/api/practice/grade")) status = response.status();
  };
  page.on("response", onResponse);
  return {
    async read({ required }) {
      if (required) {
        for (let attempt = 0; attempt < 120 && status === 0; attempt += 1) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        }
      }
      page.off("response", onResponse);
      if (status >= 200 && status < 300) return { category: "GRADE_RESPONSE_2XX", status };
      if (status >= 400 && status < 500) return { category: "GRADE_RESPONSE_4XX", status };
      if (status >= 500 && status < 600) return { category: "GRADE_RESPONSE_5XX", status };
      return {
        category: required ? "GRADE_NOT_OBSERVED" : "GRADE_NOT_REQUIRED",
        status,
      };
    },
  };
}

async function verifyPostconditions(fixtures, { assignmentId, studentId }) {
  const preferenceCount = await countRows(
    fixtures.service
      .from("user_practice_preferences")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", studentId),
    "POSTCONDITION_FAILED",
  );
  assert(preferenceCount === 1, "POSTCONDITION_FAILED");
  fixtures.preferenceState = "CREATED";

  const sessions = assertNoError(
    await fixtures.service.from("practice_sessions").select("id").eq("user_id", studentId),
    "POSTCONDITION_FAILED",
  ) ?? [];
  assert(sessions.length === 1, "POSTCONDITION_FAILED");
  fixtures.sessionIds = ids(sessions);
  const rounds = assertNoError(
    await fixtures.service.from("practice_rounds").select("id").in("session_id", fixtures.sessionIds),
    "POSTCONDITION_FAILED",
  ) ?? [];
  assert(rounds.length === 1, "POSTCONDITION_FAILED");
  fixtures.roundIds = ids(rounds);

  const [roundQuestionCount, episodeCount, assignmentLinkCount, progressCount] = await Promise.all([
    countRows(
      fixtures.service
        .from("practice_round_questions")
        .select("id", { count: "exact", head: true })
        .in("round_id", fixtures.roundIds),
      "POSTCONDITION_FAILED",
    ),
    countRows(
      fixtures.service
        .from("practice_agent_episodes")
        .select("id", { count: "exact", head: true })
        .in("round_id", fixtures.roundIds),
      "POSTCONDITION_FAILED",
    ),
    countRows(
      fixtures.service
        .from("assignment_practice_sessions")
        .select("assignment_id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .in("practice_session_id", fixtures.sessionIds),
      "POSTCONDITION_FAILED",
    ),
    countRows(
      fixtures.service
        .from("student_assignment_progress")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .in("last_practice_session_id", fixtures.sessionIds),
      "POSTCONDITION_FAILED",
    ),
  ]);
  assert(
    roundQuestionCount === 1 && episodeCount === 1 && assignmentLinkCount === 1 && progressCount === 1,
    "POSTCONDITION_FAILED",
  );
}

async function runResumeSubmitJourney({ contract, diagnostics, fakeProvider, fixtures, page, server }) {
  phase(fixtures, "ASSIGNMENT_PRACTICE_FIRST_START");
  const firstStartPromise = waitForAssignmentStart(page);
  await page.goto(`${server.origin}/practice?assignmentId=${encodeURIComponent(contract.assignmentId)}`, {
    waitUntil: "domcontentloaded",
  });
  const firstStart = await firstStartPromise;
  diagnostics.assignmentStartHttpStatus = firstStart.status;
  diagnostics.assignmentStartCode = firstStart.code;
  assert(
    firstStart.status === 200 && firstStart.code === "NONE" && firstStart.sessionId,
    "ASSIGNMENT_START_NON_2XX",
  );
  await page.getByText("Assignment practice").waitFor({ timeout: 30_000 });
  await page.getByText(contract.questionTitle).waitFor({ timeout: 30_000 });

  phase(fixtures, "ASSIGNMENT_PRACTICE_FIRST_START_POSTCONDITIONS");
  await verifyPostconditions(fixtures, contract);
  assert(fixtures.sessionIds.length === 1 && fixtures.sessionIds[0] === firstStart.sessionId, "POSTCONDITION_FAILED");

  phase(fixtures, "ASSIGNMENT_PRACTICE_RELOAD_RESUME");
  const reloadStartPromise = waitForAssignmentStart(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloadStart = await reloadStartPromise;
  diagnostics.reloadStartHttpStatus = reloadStart.status;
  diagnostics.reloadStartCode = reloadStart.code;
  const reloadSessionConsistency =
    firstStart.sessionId && reloadStart.sessionId
      ? firstStart.sessionId === reloadStart.sessionId
        ? "MATCH"
        : "MISMATCH"
      : "NOT_OBSERVED";
  diagnostics.reloadSessionConsistency = reloadSessionConsistency;
  console.log(`reload_session_consistency=${reloadSessionConsistency}`);
  assert(
    reloadStart.status === 200 && reloadStart.code === "NONE" && reloadSessionConsistency === "MATCH",
    "ASSIGNMENT_RESUME_FAILED",
  );
  await page.getByText(contract.questionTitle).waitFor({ timeout: 30_000 });
  await verifyPostconditions(fixtures, contract);

  phase(fixtures, "ASSIGNMENT_PRACTICE_ANSWER_INPUT");
  const answerControl = page.getByPlaceholder("Enter your final answer");
  await answerControl.waitFor({ timeout: 30_000 });
  await answerControl.fill("2");
  const submitButton = page.getByRole("button", { name: "Submit round" });
  await submitButton.waitFor({ timeout: 30_000 });
  const reviewPromise = waitForReview(page);
  const gradeObserver = observeGrade(page);

  phase(fixtures, "ASSIGNMENT_PRACTICE_SUBMIT");
  await submitButton.click();

  phase(fixtures, "ASSIGNMENT_PRACTICE_REVIEW_OR_GRADE");
  const review = await reviewPromise;
  diagnostics.reviewCategory = review.category;
  diagnostics.reviewHttpStatus = review.status;
  const grade = await gradeObserver.read({ required: review.category !== "REVIEW_SUCCESS_EVENT" });
  diagnostics.gradeCategory = grade.category;
  diagnostics.gradeHttpStatus = grade.status;
  assert(
    (review.status === 200 && review.category === "REVIEW_SUCCESS_EVENT") ||
      grade.category === "GRADE_RESPONSE_2XX",
    "REVIEW_OR_GRADE_FAILED",
  );

  phase(fixtures, "ASSIGNMENT_PRACTICE_RESULT_BADGE");
  await page
    .locator('[data-testid="practice-result-badge"][data-result="correct"]')
    .waitFor({ timeout: 45_000 });
  diagnostics.resultBadgeState = "PRESENT";

  phase(fixtures, "ASSIGNMENT_PRACTICE_PERSISTENCE");
  const attemptCount = await countRows(
    fixtures.service
      .from("practice_attempts")
      .select("id", { count: "exact", head: true })
      .eq("session_id", firstStart.sessionId)
      .eq("user_id", contract.studentId),
    "POSTCONDITION_FAILED",
  );
  assert(attemptCount >= 1, "POSTCONDITION_FAILED");
  const persistedAttempts = assertNoError(
    await fixtures.service
      .from("practice_attempts")
      .select("answer")
      .eq("session_id", firstStart.sessionId)
      .eq("round_id", fixtures.roundIds[0])
      .eq("user_id", contract.studentId)
      .eq("source_question_id", contract.questionId)
      .order("created_at", { ascending: false })
      .limit(2),
    "POSTCONDITION_FAILED",
  ) ?? [];
  const persistedAttemptDiagnostics = classifyPersistedAttemptRows(persistedAttempts);
  diagnostics.persistedAttemptRow = persistedAttemptDiagnostics.row;
  diagnostics.persistedAttemptAnswer = persistedAttemptDiagnostics.answer;
  const progress = assertNoError(
    await fixtures.service
      .from("student_assignment_progress")
      .select("status, last_practice_session_id")
      .eq("assignment_id", contract.assignmentId)
      .eq("student_id", contract.studentId)
      .maybeSingle(),
    "POSTCONDITION_FAILED",
  );
  assert(
    progress?.status === "completed" && progress.last_practice_session_id === firstStart.sessionId,
    "POSTCONDITION_FAILED",
  );
  diagnostics.persistenceResult = "PASS";

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE");
  const completedReloadPromise = waitForAssignmentStart(page).catch(() => null);
  await runBounded("COMPLETED_RELOAD_ROUTE_FAILED", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    assert(new URL(page.url()).pathname === "/practice", "COMPLETED_RELOAD_ROUTE_FAILED");
  });

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_START");
  const completedReload = await runBounded(
    "COMPLETED_RELOAD_START_FAILED",
    () => completedReloadPromise,
  );
  if (completedReload) {
    diagnostics.completedReloadStartHttpStatus = completedReload.status;
    diagnostics.completedReloadStartCode = completedReload.code;
  }
  assert(completedReload?.status === 200, "COMPLETED_RELOAD_START_FAILED");

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_SESSION_CONSISTENCY");
  assert(completedReload.sessionId === firstStart.sessionId, "COMPLETED_SESSION_MISMATCH");

  const sessionDetailDiagnostics = await sessionDetailAttemptDiagnostics(page, {
    roundId: fixtures.roundIds[0],
    sessionId: firstStart.sessionId,
    sourceQuestionId: contract.questionId,
  });
  diagnostics.sessionDetailAttempt = sessionDetailDiagnostics.attempt;
  diagnostics.sessionDetailAnswer = sessionDetailDiagnostics.answer;

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RESULT_BADGE");
  await runBounded("COMPLETED_RESULT_BADGE_TIMEOUT", () =>
    page
      .locator('[data-testid="practice-result-badge"][data-result="correct"]')
      .waitFor({ timeout: 30_000 }),
  );
  diagnostics.completedResultBadgeState = "PRESENT";

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_CONTROL");
  diagnostics.completedAnswerControl = "MISSING";
  const completedAnswerControl = page.getByPlaceholder("Enter your final answer", { exact: true });
  await runBounded("COMPLETED_ANSWER_CONTROL_NOT_FOUND", async () => {
    await completedAnswerControl.waitFor({ timeout: 30_000 });
    const isExpectedControl = await completedAnswerControl.evaluate(
      (element) => element.tagName === "TEXTAREA" || element.tagName === "INPUT",
    );
    assert(isExpectedControl, "COMPLETED_ANSWER_CONTROL_NOT_FOUND");
  });
  diagnostics.completedAnswerControl = "PRESENT";

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_IMMUTABILITY");
  diagnostics.completedAnswerImmutable = "NO";
  await runBounded("COMPLETED_ANSWER_NOT_IMMUTABLE", async () => {
    const immutableMechanism = await completedAnswerControl.evaluate((element) => {
      if (element.tagName !== "TEXTAREA" && element.tagName !== "INPUT") return "NONE";
      if (element.disabled) return "DISABLED";
      if (element.readOnly) return "READ_ONLY";
      return "NONE";
    });
    assert(immutableMechanism !== "NONE", "COMPLETED_ANSWER_NOT_IMMUTABLE");
  });
  diagnostics.completedAnswerImmutable = "YES";

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_VALUE");
  diagnostics.completedAnswerValue = "MISSING";
  await runBounded("COMPLETED_ANSWER_VALUE_NOT_RESTORED", async () => {
    const answerValuePresent = await completedAnswerControl.evaluate((element) => {
      if (element.tagName !== "TEXTAREA" && element.tagName !== "INPUT") return false;
      return typeof element.value === "string" && Boolean(element.value.trim());
    });
    assert(answerValuePresent, "COMPLETED_ANSWER_VALUE_NOT_RESTORED");
  });
  diagnostics.completedAnswerValue = "PRESENT";

  phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_POSTCONDITIONS");
  await runBounded("COMPLETED_POSTCONDITION_FAILED", () =>
    verifyPostconditions(fixtures, contract),
  );

  phase(fixtures, "ASSIGNMENT_PRACTICE_MY_WORK_NAVIGATION");
  await runBounded("MY_WORK_NAVIGATION_FAILED", async () => {
    await page.goto(`${server.origin}/student/work`, { waitUntil: "domcontentloaded" });
    assert(new URL(page.url()).pathname === "/student/work", "MY_WORK_NAVIGATION_FAILED");
  });

  phase(fixtures, "ASSIGNMENT_PRACTICE_MY_WORK_COMPLETED_SECTION");
  const completedHeading = page.getByRole("heading", {
    exact: true,
    level: 2,
    name: "Completed",
  });
  const completedSection = page.locator("section").filter({ has: completedHeading });
  await runBounded("MY_WORK_COMPLETED_SECTION_NOT_FOUND", async () => {
    await completedHeading.waitFor({ timeout: 30_000 });
    assert(await completedSection.count() === 1, "MY_WORK_COMPLETED_SECTION_NOT_FOUND");
  });

  phase(fixtures, "ASSIGNMENT_PRACTICE_MY_WORK_COMPLETED_ASSIGNMENT");
  await runBounded("MY_WORK_COMPLETED_ASSIGNMENT_NOT_FOUND", async () => {
    await completedSection
      .getByRole("heading", { exact: true, level: 3, name: contract.assignmentTitle })
      .waitFor({ timeout: 30_000 });
    await completedSection
      .getByRole("link", { exact: true, name: "Review work" })
      .waitFor({ timeout: 30_000 });
  });
  fakeProvider.assertUsedSafely();
}

async function collectGeneratedIds(fixtures) {
  if (!fixtures.student?.id) return;
  const sessions = assertNoError(
    await fixtures.service.from("practice_sessions").select("id").eq("user_id", fixtures.student.id),
    "CLEANUP_FAILED",
  ) ?? [];
  fixtures.sessionIds = Array.from(new Set([...fixtures.sessionIds, ...ids(sessions)]));
  const rounds = await selectByIds(fixtures.service, "practice_rounds", "session_id", fixtures.sessionIds);
  fixtures.roundIds = Array.from(new Set([...fixtures.roundIds, ...ids(rounds)]));
}

async function deleteExact(service, table, column, values) {
  if (!values.length) return;
  const result = await service.from(table).delete().in(column, values);
  if (result.error) fail("CLEANUP_FAILED");
}

async function cleanupFixtures(fixtures) {
  const failedCategories = [];
  async function clean(category, operation) {
    try {
      await operation();
    } catch {
      failedCategories.push(category);
    }
  }

  await clean("COLLECT_GENERATED", () => collectGeneratedIds(fixtures));
  const service = fixtures.service;
  await clean("HINT_EVENTS", () => deleteExact(service, "practice_hint_events", "session_id", fixtures.sessionIds));
  await clean("REFLECTIONS", () => deleteExact(service, "practice_reflection_records", "session_id", fixtures.sessionIds));
  await clean("WEAKNESS_LINKS", () => deleteExact(service, "practice_weakness_links", "session_id", fixtures.sessionIds));
  await clean("WRONG_QUESTIONS", () => deleteExact(service, "practice_wrong_questions", "user_id", fixtures.userIds));
  await clean("ATTEMPTS", () => deleteExact(service, "practice_attempts", "session_id", fixtures.sessionIds));
  await clean("EPISODES", () => deleteExact(service, "practice_agent_episodes", "round_id", fixtures.roundIds));
  await clean("ROUND_QUESTIONS", () => deleteExact(service, "practice_round_questions", "round_id", fixtures.roundIds));
  await clean("ROUNDS", () => deleteExact(service, "practice_rounds", "id", fixtures.roundIds));
  await clean("ASSIGNMENT_LINKS", () => deleteExact(service, "assignment_practice_sessions", "assignment_id", fixtures.assignmentIds));
  await clean("ASSIGNMENT_PROGRESS", () => deleteExact(service, "student_assignment_progress", "assignment_id", fixtures.assignmentIds));
  await clean("MERGE_JOBS", () => deleteExact(service, "practice_preference_merge_jobs", "user_id", fixtures.userIds));
  await clean("SESSIONS", () => deleteExact(service, "practice_sessions", "id", fixtures.sessionIds));
  await clean("PREFERENCES", () => deleteExact(service, "user_practice_preferences", "user_id", fixtures.userIds));
  await clean("ASSIGNMENT_ITEMS", () => deleteExact(service, "assignment_items", "assignment_id", fixtures.assignmentIds));
  await clean("ASSIGNMENTS", () => deleteExact(service, "assignments", "id", fixtures.assignmentIds));
  await clean("BANK_QUESTIONS", () => deleteExact(service, "bank_questions", "id", fixtures.bankQuestionIds));
  await clean("QUESTIONS", () => deleteExact(service, "questions", "id", fixtures.questionIds));
  await clean("BANK_MEMBERS", () => deleteExact(service, "bank_members", "bank_id", fixtures.bankIds));
  await clean("BANKS", () => deleteExact(service, "question_banks", "id", fixtures.bankIds));
  await clean("CLASSROOM_MEMBERS", () => deleteExact(service, "classroom_members", "id", fixtures.classroomMemberIds));
  await clean("CLASSROOMS", () => deleteExact(service, "classrooms", "id", fixtures.classroomIds));
  await clean("AI_PROVIDER_ROWS", () => deleteExact(service, "ai_provider_profiles", "id", fixtures.providerProfileIds));
  await clean("ORGANIZATION_MEMBERS", () => deleteExact(service, "organization_members", "id", fixtures.organizationMemberIds));
  await clean("PROFILES", () => deleteExact(service, "profiles", "id", fixtures.profileIds));
  await clean("ORGANIZATIONS", () => deleteExact(service, "organizations", "id", fixtures.organizationIds));
  await clean("AUTH_USERS", async () => {
    for (const userId of fixtures.userIds) {
      const result = await service.auth.admin.deleteUser(userId);
      if (result.error) fail("CLEANUP_FAILED");
    }
  });
  await clean("ZERO_RESIDUE", async () => {
    const report = await readStaleFixtureCounts(service);
    assert(report.residueTotal === 0, "CLEANUP_FAILED");
  });
  return failedCategories.length === 0;
}

async function inspectPreferenceState(fixtures) {
  if (!fixtures.student?.id) return fixtures.preferenceState;
  if (fixtures.preferenceState === "READ_FAILED" || fixtures.preferenceState === "CREATE_FAILED") {
    return fixtures.preferenceState;
  }
  try {
    const count = await countRows(
      fixtures.service
        .from("user_practice_preferences")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", fixtures.student.id),
      "POSTCONDITION_FAILED",
    );
    return count === 1 ? "CREATED" : fixtures.preferenceState;
  } catch {
    return "UNKNOWN";
  }
}

async function runPreflightOnly() {
  let cleared = false;
  try {
    const config = requireApprovedEnvironment({ requireBrowser: false });
    const report = await readStaleFixtureCounts(serviceClient(config));
    printPreflight(report);
    if (report.residueTotal > 0) process.exitCode = 1;
  } catch (error) {
    console.log("STALE_ASSIGNMENT_RESUME_SUBMIT_PREFLIGHT_BLOCKED");
    console.log("residue_total=0");
    console.log(`affected_categories=${boundedFailureCategory(error)}`);
    process.exitCode = 1;
  } finally {
    cleared = clearProcessEnvironment();
    if (!cleared) process.exitCode = 1;
  }
}

async function runFullValidation() {
  let browser = null;
  let context = null;
  let fakeProvider = null;
  let fixtures = null;
  let server = null;
  let failureCategory = "NONE";
  const diagnostics = createJourneyDiagnostics();
  let succeeded = false;
  let cleanupPassed = true;
  let temporaryServerStopped = true;
  let processEnvironmentCleared = false;

  try {
    const config = requireApprovedEnvironment({ requireBrowser: true });
    const service = serviceClient(config);
    fixtures = createFixtureState(service);
    phase(fixtures, "STALE_FIXTURE_PREFLIGHT");
    const stale = await readStaleFixtureCounts(service);
    assert(stale.residueTotal === 0, "STALE_FIXTURES_BLOCKED");

    phase(fixtures, "FIXTURE_SETUP");
    const runId = randomUUID().replace(/-/g, "").slice(0, 16);
    const contract = await createLearningFixtures(fixtures, runId);
    phase(fixtures, "FIRST_START_PRECONDITION");
    await verifyFirstStartPrecondition(fixtures, contract.studentId);

    phase(fixtures, "LOCAL_FAKE_PROVIDER");
    await ensureNoExistingCompatibleDefault(fixtures);
    fakeProvider = await startLocalFakeProvider();
    temporaryServerStopped = false;
    await createFixtureProvider({
      encryptionKey: config.encryptionKey,
      fakeProvider,
      fixtures,
    });

    phase(fixtures, "LOCAL_NEXT_SERVER");
    server = await startLocalNextServer(config);
    temporaryServerStopped = false;
    phase(fixtures, "AUTHENTICATED_STUDENT_SESSION");
    browser = await chromium.launch({ executablePath: edgePath, headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    await signInThroughBrowser(page, server.origin, fixtures.student);

    await runResumeSubmitJourney({
      contract,
      diagnostics,
      fakeProvider,
      fixtures,
      page,
      server,
    });
    succeeded = true;
  } catch (error) {
    failureCategory = boundedFailureCategory(error);
    if (fixtures) fixtures.preferenceState = await inspectPreferenceState(fixtures);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    let fakeProviderStopped = true;
    if (server) {
      const stopResult = await server.close().catch(() => ({
        category: "SERVER_STOP_FAILED",
        stopped: false,
      }));
      temporaryServerStopped =
        stopResult.stopped === true && SERVER_STOP_CATEGORIES.has(stopResult.category);
    }
    if (fakeProvider) {
      fakeProviderStopped = await fakeProvider.close().then(() => true).catch(() => false);
    }
    temporaryServerStopped &&= fakeProviderStopped;
    if (fixtures) {
      cleanupPassed = await cleanupFixtures(fixtures).catch(() => false);
    }
    processEnvironmentCleared = clearProcessEnvironment();
    if (!cleanupPassed && failureCategory === "NONE") failureCategory = "CLEANUP_FAILED";
    if (!temporaryServerStopped && failureCategory === "NONE") {
      failureCategory = "TEMPORARY_SERVER_STOP_FAILED";
    }
    if (!processEnvironmentCleared && failureCategory === "NONE") {
      failureCategory = "UNEXPECTED_FAILURE";
    }
  }

  if (succeeded && cleanupPassed && temporaryServerStopped && processEnvironmentCleared) {
    console.log("PASS assignment_practice_resume_submit_live_validation");
    console.log(`assignment_start_http_status=${diagnostics.assignmentStartHttpStatus}`);
    console.log(`assignment_start_code=${diagnostics.assignmentStartCode}`);
    console.log(`reload_start_http_status=${diagnostics.reloadStartHttpStatus}`);
    console.log(`reload_start_code=${diagnostics.reloadStartCode}`);
    console.log(`completed_reload_start_http_status=${diagnostics.completedReloadStartHttpStatus}`);
    console.log(`completed_reload_start_code=${diagnostics.completedReloadStartCode}`);
    console.log(`reload_session_consistency=${diagnostics.reloadSessionConsistency}`);
    console.log(`result_badge_state=${diagnostics.resultBadgeState}`);
    console.log(`persistence_result=${diagnostics.persistenceResult}`);
    console.log(`completed_result_badge_state=${diagnostics.completedResultBadgeState}`);
    console.log("preference=PASS");
    console.log("session=PASS");
    console.log("round=PASS");
    console.log("round_questions=PASS");
    console.log("attempt=PASS");
    console.log("assignment_link=PASS");
    console.log("assignment_progress=PASS");
    console.log("session_reload=PASS");
    console.log(`review_category=${diagnostics.reviewCategory}`);
    console.log(`review_http_status=${diagnostics.reviewHttpStatus}`);
    console.log(`grade_category=${diagnostics.gradeCategory}`);
    console.log(`grade_http_status=${gradeHttpStatusLabel(diagnostics)}`);
    printCompletedAnswerDiagnostics(diagnostics);
    console.log("cleanup=PASS");
    console.log("temporary_server_stopped=YES");
    console.log("process_environment_cleared=YES");
    return;
  }

  console.log("FAIL assignment_practice_resume_submit_live_validation");
  console.log(`failure_category=${failureCategory}`);
  console.log(`assignment_start_http_status=${diagnostics.assignmentStartHttpStatus || "NOT_OBSERVED"}`);
  console.log(`assignment_start_code=${diagnostics.assignmentStartCode}`);
  console.log(`reload_start_http_status=${diagnostics.reloadStartHttpStatus || "NOT_OBSERVED"}`);
  console.log(`reload_start_code=${diagnostics.reloadStartCode}`);
  console.log(`completed_reload_start_http_status=${diagnostics.completedReloadStartHttpStatus || "NOT_OBSERVED"}`);
  console.log(`completed_reload_start_code=${diagnostics.completedReloadStartCode}`);
  console.log(`reload_session_consistency=${diagnostics.reloadSessionConsistency}`);
  console.log(`result_badge_state=${diagnostics.resultBadgeState}`);
  console.log(`persistence_result=${diagnostics.persistenceResult}`);
  console.log(`completed_result_badge_state=${diagnostics.completedResultBadgeState}`);
  console.log(`preference_state=${fixtures?.preferenceState ?? "NOT_REACHED"}`);
  console.log(`review_category=${diagnostics.reviewCategory}`);
  console.log(`review_http_status=${diagnostics.reviewHttpStatus || "NOT_OBSERVED"}`);
  console.log(`grade_category=${diagnostics.gradeCategory}`);
  console.log(`grade_http_status=${gradeHttpStatusLabel(diagnostics)}`);
  printCompletedAnswerDiagnostics(diagnostics);
  console.log(`cleanup=${cleanupPassed ? "PASS" : "FAIL"}`);
  console.log(`temporary_server_stopped=${temporaryServerStopped ? "YES" : "NO"}`);
  console.log(`process_environment_cleared=${processEnvironmentCleared ? "YES" : "NO"}`);
  process.exitCode = 1;
}

const args = process.argv.slice(2);
const preflightOnly = args.length === 1 && args[0] === "--preflight-only";
if (args.length && !preflightOnly) {
  console.log("FAIL assignment_practice_resume_submit_live_validation");
  console.log("failure_category=UNEXPECTED_FAILURE");
  process.exitCode = 1;
  clearProcessEnvironment();
} else if (preflightOnly) {
  // PREFLIGHT_EXIT_BEFORE_MUTATION_SERVER_BROWSER_API
  await runPreflightOnly();
} else {
  await runFullValidation();
}
