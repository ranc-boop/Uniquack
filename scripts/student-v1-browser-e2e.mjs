#!/usr/bin/env node

// Disposable, process-only browser validation for the Student V1 contract.
// It launches locally installed Edge through Playwright, creates only exact-ID
// fixtures, and never reads an environment file or prints fixture identities.

import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const DISPOSABLE_CONFIRMATION = "DISPOSABLE_STUDENT_BROWSER_E2E";
const CLEANUP_CONFIRMATION = "DELETE_STUDENT_BROWSER_E2E_FIXTURES";
const LOCAL_FAKE_PROVIDER_MODE = "LOCAL_FAKE_HTTP_PROVIDER";
const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "STUDENT_BROWSER_E2E_ENVIRONMENT",
  "STUDENT_BROWSER_E2E_EXPECTED_PROJECT_REF",
  "STUDENT_BROWSER_E2E_CONFIRM_CLEANUP",
  "STUDENT_BROWSER_E2E_PROVIDER_MODE",
];
const MAX_DIAGNOSTIC_CATEGORIES = 8;
const PRACTICE_START_PATH = "/api/practice/assignments/start";
const PRACTICE_REVIEW_PATH = "/api/practice/review";
const PRACTICE_GRADE_PATH = "/api/practice/grade";
const AUTH_FIXTURE_KIND = "student_v1_browser_e2e";
const STALE_FIXTURE_SOURCE = "student_browser_e2e";
const STALE_FIXTURE_PREFIX = "student-browser-";
const STALE_PROVIDER_PREFIX = "!student-browser-e2e-";
const PREFLIGHT_CATEGORY_LABELS = Object.freeze([
  "AUTH_USERS",
  "ORGANIZATIONS",
  "PROFILES",
  "ORGANIZATION_MEMBERSHIPS",
  "CLASSROOMS",
  "CLASSROOM_MEMBERSHIPS",
  "CLASSROOM_JOIN_CODES",
  "BANKS",
  "BANK_MEMBERSHIPS",
  "QUESTIONS",
  "QUESTION_SUPPORT_ROWS",
  "ASSIGNMENTS",
  "ASSIGNMENT_ITEMS",
  "ASSIGNMENT_PROGRESS",
  "PRACTICE_PREFERENCES",
  "PREFERENCE_MERGE_JOBS",
  "PRACTICE_SESSIONS",
  "PRACTICE_ROUNDS",
  "PRACTICE_QUESTIONS",
  "PRACTICE_ATTEMPTS",
  "PRACTICE_EPISODES",
  "PRACTICE_WRONG_QUESTION_ROWS",
  "PRACTICE_HINT_EVENTS",
  "PRACTICE_REFLECTION_ROWS",
  "PRACTICE_WEAKNESS_ROWS",
  "ASSIGNMENT_PRACTICE_LINKS",
  "FEEDBACK_ROWS",
  "QUESTION_ASSET_ROWS",
  "STORAGE_OBJECTS",
  "AI_PROVIDER_ROWS",
]);

const NAVIGATION_STATUSES = new Set([
  "NO_DOCUMENT_RESPONSE",
  "NAVIGATION_2XX",
  "NAVIGATION_3XX",
  "NAVIGATION_4XX",
  "NAVIGATION_5XX",
]);
const ASSIGNMENT_START_API_STATUSES = new Set([
  "RESPONSE_2XX",
  "RESPONSE_3XX",
  "RESPONSE_4XX",
  "RESPONSE_5XX",
  "REQUEST_FAILED",
  "REQUEST_NOT_OBSERVED",
]);
const ASSIGNMENT_START_API_CODES = new Set([
  "NONE",
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
  "UNRECOGNIZED_API_CODE",
]);
const REVIEW_CATEGORIES = new Set([
  "REVIEW_SUCCESS_EVENT",
  "REVIEW_ERROR_EVENT",
  "REVIEW_STREAM_INCOMPLETE",
  "REVIEW_NOT_OBSERVED",
]);
const GRADE_CATEGORIES = new Set([
  "GRADE_NOT_REQUIRED",
  "GRADE_RESPONSE_2XX",
  "GRADE_RESPONSE_4XX",
  "GRADE_RESPONSE_5XX",
  "GRADE_NOT_OBSERVED",
]);
const RELOAD_SESSION_CONSISTENCY = new Set(["MATCH", "MISMATCH", "NOT_OBSERVED"]);
const FINAL_ROUTE_CATEGORIES = new Set([
  "PRACTICE_ROUTE",
  "LOGIN_ROUTE",
  "STUDENT_ROUTE",
  "ERROR_ROUTE",
  "UNEXPECTED_ROUTE",
]);
const PAGE_ERROR_CATEGORIES = new Set([
  "CLIENT_RENDER_ERROR",
  "NETWORK_ERROR",
  "AUTH_ERROR",
  "UNKNOWN_PAGE_ERROR",
]);
const FAILED_REQUEST_CATEGORIES = new Set([
  "DOCUMENT",
  "PRACTICE_ASSIGNMENT_START",
  "NEXT_STATIC",
  "OTHER_SAME_ORIGIN",
  "EXTERNAL",
  "UNKNOWN",
]);
const SERVER_RUNTIME_CATEGORIES = new Set([
  "HTTP_4XX",
  "HTTP_5XX",
  "UNHANDLED_REJECTION",
  "UNCAUGHT_EXCEPTION",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "PROCESS_EXIT_NONZERO",
]);
const ALLOWED_FAILURE_CATEGORIES = new Set([
  "missing_process_environment",
  "production_environment_refused",
  "disposable_environment_acknowledgement_required",
  "destructive_fixture_acknowledgement_required",
  "local_fake_provider_mode_required",
  "expected_project_identity_mismatch",
  "local_edge_browser_missing",
  "stale_fixture_preflight_failed",
  "stale_disposable_fixtures_refused",
  "next_server_start_timeout",
  "practice_navigation_timeout",
  "practice_start_api_timeout",
  "practice_start_api_request_failed",
  "practice_start_api_non_2xx",
  "practice_login_redirect",
  "practice_student_redirect",
  "practice_error_route",
  "practice_unexpected_route",
  "practice_banner_timeout",
  "practice_question_title_timeout",
  "practice_page_context_error",
  "practice_persisted_completion_state_failed",
  "practice_my_work_navigation_failed",
  "practice_my_work_completed_section_not_found",
  "practice_my_work_completed_assignment_not_found",
  "temporary_server_stop_failed",
  "process_environment_clear_failed",
  "cleanup_failed",
  "FIXTURE_SETUP_FAILURE",
  "BROWSER_JOURNEY_FAILURE",
  "HARNESS_FAILURE",
]);

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

function boundedFailureCategory(error, phase = "initialization") {
  const category = safeFailureCategory(error);
  if (ALLOWED_FAILURE_CATEGORIES.has(category)) return category;
  if (String(phase).startsWith("fixture_") || phase === "local_next_server") {
    return "FIXTURE_SETUP_FAILURE";
  }
  if (String(phase).startsWith("browser_")) return "BROWSER_JOURNEY_FAILURE";
  return "HARNESS_FAILURE";
}

function addBoundedCategory(target, category, allowed) {
  if (!allowed.has(category) || target.includes(category) || target.length >= MAX_DIAGNOSTIC_CATEGORIES) return;
  target.push(category);
}

function createSanitizedDiagnostics() {
  return {
    assignmentStartApi: "REQUEST_NOT_OBSERVED",
    assignmentStartCode: "UNRECOGNIZED_API_CODE",
    assignmentStartHttpStatus: 0,
    cleanup: "FAIL",
    consoleErrorCount: 0,
    failedRequestCategories: [],
    finalRoute: "UNEXPECTED_ROUTE",
    navigationStatus: "NO_DOCUMENT_RESPONSE",
    gradeCategory: "GRADE_NOT_OBSERVED",
    gradeHttpStatus: 0,
    pageErrorCategories: [],
    processEnvironmentCleared: false,
    reloadSessionConsistency: "NOT_OBSERVED",
    reviewCategory: "REVIEW_NOT_OBSERVED",
    reviewHttpStatus: 0,
    server: {
      closing: false,
      exitCodeCategory: "UNKNOWN",
      healthy: false,
      runtimeCategories: [],
    },
    temporaryServersStopped: false,
  };
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

function requireApprovedProcessEnvironment({ requireLocalBrowser = true, reportPresence = true } = {}) {
  if (reportPresence) printEnvironmentPresence();
  const missing = REQUIRED_ENVIRONMENT.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new HarnessError("missing_process_environment");
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new HarnessError("production_environment_refused");
  }
  if (process.env.STUDENT_BROWSER_E2E_ENVIRONMENT !== DISPOSABLE_CONFIRMATION) {
    throw new HarnessError("disposable_environment_acknowledgement_required");
  }
  if (process.env.STUDENT_BROWSER_E2E_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    throw new HarnessError("destructive_fixture_acknowledgement_required");
  }
  if (process.env.STUDENT_BROWSER_E2E_PROVIDER_MODE !== LOCAL_FAKE_PROVIDER_MODE) {
    throw new HarnessError("local_fake_provider_mode_required");
  }

  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (
    !projectRef ||
    projectRef !== process.env.STUDENT_BROWSER_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase()
  ) {
    throw new HarnessError("expected_project_identity_mismatch");
  }
  if (requireLocalBrowser && !existsSync(edgePath)) throw new HarnessError("local_edge_browser_missing");

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
}

async function countStaleFixtureRows(query) {
  const result = await query;
  if (result.error) throw new HarnessError("stale_fixture_preflight_failed");
  return Math.max(0, Number(result.count ?? 0));
}

async function assertNoStaleStudentBrowserFixtures(service) {
  const counts = await Promise.all([
    countStaleFixtureRows(
      service.from("organizations").select("id", { count: "exact", head: true }).like("slug", `${STALE_FIXTURE_PREFIX}%`),
    ),
    countStaleFixtureRows(
      service.from("profiles").select("id", { count: "exact", head: true }).like("username", `${STALE_FIXTURE_PREFIX}%`),
    ),
    countStaleFixtureRows(
      service.from("questions").select("id", { count: "exact", head: true }).eq("source", STALE_FIXTURE_SOURCE),
    ),
    countStaleFixtureRows(
      service.from("ai_provider_profiles").select("id", { count: "exact", head: true }).like("name", `${STALE_PROVIDER_PREFIX}%`),
    ),
  ]);
  const aggregateCount = counts.reduce((total, count) => total + count, 0);
  console.log(`STALE_FIXTURE_PREFLIGHT_COUNT=${Math.min(aggregateCount, 999_999)}`);
  if (aggregateCount > 0) throw new HarnessError("stale_disposable_fixtures_refused");
}

// PREFLIGHT_ONLY_READ_START
const PREFLIGHT_PAGE_SIZE = 500;
const PREFLIGHT_MAX_PAGES = 200;
const PREFLIGHT_IN_FILTER_SIZE = 50;

class PreflightAuditError extends Error {
  constructor(outputCategory) {
    super(outputCategory);
    this.outputCategory = outputCategory;
  }
}

class PreflightCoverageError extends Error {
  constructor(missingCategories) {
    super("PREFLIGHT_COVERAGE_INCOMPLETE");
    this.missingCategories = missingCategories.filter((category) => PREFLIGHT_CATEGORY_LABELS.includes(category));
  }
}

function parseHarnessMode(args) {
  if (args.length === 0) return "FULL_E2E";
  if (args.length === 1 && args[0] === "--preflight-only") return "PREFLIGHT_ONLY";
  return "INVALID_ARGUMENTS";
}

function chunksOf(values, size = PREFLIGHT_IN_FILTER_SIZE) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

async function readAllPreflightPages(buildQuery, coverageCategory) {
  const rows = [];
  for (let page = 0; page < PREFLIGHT_MAX_PAGES; page += 1) {
    const from = page * PREFLIGHT_PAGE_SIZE;
    const result = await buildQuery().range(from, from + PREFLIGHT_PAGE_SIZE - 1);
    if (result.error) throw new PreflightAuditError("READ_ONLY_QUERY_FAILED");
    const pageRows = Array.isArray(result.data) ? result.data : [];
    rows.push(...pageRows);
    if (pageRows.length < PREFLIGHT_PAGE_SIZE) return rows;
  }
  throw new PreflightCoverageError([coverageCategory]);
}

function preflightRowKey(row, keyFields) {
  return keyFields.map((field) => String(row?.[field] ?? "")).join(":");
}

function uniquePreflightRows(rows, keyFields = ["id"]) {
  const unique = new Map();
  for (const row of rows) unique.set(preflightRowKey(row, keyFields), row);
  return [...unique.values()];
}

async function readPreflightRows({
  columns = "id",
  coverageCategory,
  filters,
  keyFields = ["id"],
  service,
  table,
}) {
  const rows = [];
  for (const filter of filters) {
    if (filter.kind === "in" && filter.values.length === 0) continue;
    const valueGroups = filter.kind === "in" ? chunksOf(filter.values) : [null];
    for (const values of valueGroups) {
      rows.push(
        ...(await readAllPreflightPages(() => {
          let query = service.from(table).select(columns);
          if (filter.kind === "eq") query = query.eq(filter.column, filter.value);
          else if (filter.kind === "like") query = query.like(filter.column, filter.value);
          else if (filter.kind === "contains") query = query.contains(filter.column, filter.value);
          else if (filter.kind === "in") query = query.in(filter.column, values);
          return query;
        }, coverageCategory)),
      );
    }
  }
  return uniquePreflightRows(rows, keyFields);
}

async function readFixtureAuthUserIds(service) {
  const matchedIds = new Set();
  for (let page = 1; page <= PREFLIGHT_MAX_PAGES; page += 1) {
    const result = await service.auth.admin.listUsers({ page, perPage: PREFLIGHT_PAGE_SIZE });
    if (result.error) throw new PreflightAuditError("READ_ONLY_AUTH_QUERY_FAILED");
    const users = Array.isArray(result.data?.users) ? result.data.users : [];
    for (const user of users) {
      if (user.user_metadata?.fixture_kind === AUTH_FIXTURE_KIND && user.id) matchedIds.add(user.id);
    }
    if (users.length < PREFLIGHT_PAGE_SIZE) return [...matchedIds];
  }
  throw new PreflightCoverageError(["AUTH_USERS"]);
}

async function readFixtureStorageObjectCount(service, questionIds, assetRows) {
  let count = 0;
  const inspectedPaths = new Set();
  for (const questionId of questionIds) {
    const folder = `questions/${questionId}`;
    for (let page = 0; page < PREFLIGHT_MAX_PAGES; page += 1) {
      const result = await service.storage.from("question-assets").list(folder, {
        limit: PREFLIGHT_PAGE_SIZE,
        offset: page * PREFLIGHT_PAGE_SIZE,
      });
      if (result.error) throw new PreflightAuditError("READ_ONLY_STORAGE_QUERY_FAILED");
      const objects = Array.isArray(result.data) ? result.data : [];
      count += objects.length;
      for (const object of objects) inspectedPaths.add(`${folder}/${String(object.name ?? "")}`);
      if (objects.length < PREFLIGHT_PAGE_SIZE) break;
      if (page === PREFLIGHT_MAX_PAGES - 1) throw new PreflightCoverageError(["STORAGE_OBJECTS"]);
    }
  }

  for (const asset of assetRows) {
    const path = String(asset.storage_path ?? "");
    const bucket = String(asset.storage_bucket ?? "");
    if (!path || !bucket || inspectedPaths.has(path)) continue;
    const separator = path.lastIndexOf("/");
    if (separator < 1 || separator === path.length - 1) throw new PreflightCoverageError(["STORAGE_OBJECTS"]);
    const folder = path.slice(0, separator);
    const fileName = path.slice(separator + 1);
    const result = await service.storage.from(bucket).list(folder, { limit: 100, offset: 0, search: fileName });
    if (result.error) throw new PreflightAuditError("READ_ONLY_STORAGE_QUERY_FAILED");
    const exists = (result.data ?? []).some((object) => object.name === fileName);
    if (exists) count += 1;
  }
  return count;
}

function preflightIds(rows) {
  return rows.map((row) => row.id).filter(Boolean);
}

function setPreflightCount(counts, category, value) {
  counts.set(category, Math.max(0, Number(Array.isArray(value) ? value.length : value) || 0));
}

async function auditStudentBrowserFixtureResidue(service) {
  const counts = new Map();

  const authUserIds = await readFixtureAuthUserIds(service);
  setPreflightCount(counts, "AUTH_USERS", authUserIds.length);

  const organizations = await readPreflightRows({
    coverageCategory: "ORGANIZATIONS",
    filters: [{ kind: "like", column: "slug", value: `${STALE_FIXTURE_PREFIX}%` }],
    service,
    table: "organizations",
  });
  const organizationIds = preflightIds(organizations);
  setPreflightCount(counts, "ORGANIZATIONS", organizations);

  const profiles = await readPreflightRows({
    coverageCategory: "PROFILES",
    filters: [
      { kind: "like", column: "username", value: `${STALE_FIXTURE_PREFIX}%` },
      { kind: "in", column: "id", values: authUserIds },
    ],
    service,
    table: "profiles",
  });
  const userIds = [...new Set([...authUserIds, ...preflightIds(profiles)])];
  setPreflightCount(counts, "PROFILES", profiles);

  const organizationMemberships = await readPreflightRows({
    coverageCategory: "ORGANIZATION_MEMBERSHIPS",
    filters: [
      { kind: "in", column: "organization_id", values: organizationIds },
      { kind: "in", column: "user_id", values: userIds },
    ],
    service,
    table: "organization_members",
  });
  setPreflightCount(counts, "ORGANIZATION_MEMBERSHIPS", organizationMemberships);

  const classrooms = await readPreflightRows({
    coverageCategory: "CLASSROOMS",
    filters: [
      { kind: "like", column: "name", value: "Student Browser %" },
      { kind: "in", column: "organization_id", values: organizationIds },
      { kind: "in", column: "owner_id", values: userIds },
    ],
    service,
    table: "classrooms",
  });
  const classroomIds = preflightIds(classrooms);
  setPreflightCount(counts, "CLASSROOMS", classrooms);

  const classroomMemberships = await readPreflightRows({
    coverageCategory: "CLASSROOM_MEMBERSHIPS",
    filters: [
      { kind: "in", column: "classroom_id", values: classroomIds },
      { kind: "in", column: "user_id", values: userIds },
    ],
    service,
    table: "classroom_members",
  });
  setPreflightCount(counts, "CLASSROOM_MEMBERSHIPS", classroomMemberships);

  const classroomJoinCodes = await readPreflightRows({
    coverageCategory: "CLASSROOM_JOIN_CODES",
    filters: [{ kind: "in", column: "classroom_id", values: classroomIds }],
    service,
    table: "classroom_join_codes",
  });
  setPreflightCount(counts, "CLASSROOM_JOIN_CODES", classroomJoinCodes);

  const banks = await readPreflightRows({
    coverageCategory: "BANKS",
    filters: [
      { kind: "like", column: "name", value: "Student Browser Bank %" },
      { kind: "in", column: "organization_id", values: organizationIds },
      { kind: "in", column: "owner_id", values: userIds },
    ],
    service,
    table: "question_banks",
  });
  const bankIds = preflightIds(banks);
  setPreflightCount(counts, "BANKS", banks);

  const bankMemberships = await readPreflightRows({
    coverageCategory: "BANK_MEMBERSHIPS",
    filters: [
      { kind: "in", column: "bank_id", values: bankIds },
      { kind: "in", column: "user_id", values: userIds },
    ],
    service,
    table: "bank_members",
  });
  setPreflightCount(counts, "BANK_MEMBERSHIPS", bankMemberships);

  const questions = await readPreflightRows({
    coverageCategory: "QUESTIONS",
    filters: [{ kind: "eq", column: "source", value: STALE_FIXTURE_SOURCE }],
    service,
    table: "questions",
  });
  const questionIds = preflightIds(questions);
  setPreflightCount(counts, "QUESTIONS", questions);

  const questionSupportRows = await readPreflightRows({
    coverageCategory: "QUESTION_SUPPORT_ROWS",
    filters: [
      { kind: "contains", column: "metadata", value: { fixture_only: true } },
      { kind: "in", column: "bank_id", values: bankIds },
      { kind: "in", column: "question_id", values: questionIds },
    ],
    service,
    table: "bank_questions",
  });
  setPreflightCount(counts, "QUESTION_SUPPORT_ROWS", questionSupportRows);

  const assignments = await readPreflightRows({
    coverageCategory: "ASSIGNMENTS",
    filters: [
      { kind: "like", column: "title", value: "Student Browser %" },
      { kind: "in", column: "organization_id", values: organizationIds },
      { kind: "in", column: "classroom_id", values: classroomIds },
      { kind: "in", column: "created_by", values: userIds },
    ],
    service,
    table: "assignments",
  });
  const assignmentIds = preflightIds(assignments);
  setPreflightCount(counts, "ASSIGNMENTS", assignments);

  const assignmentItems = await readPreflightRows({
    coverageCategory: "ASSIGNMENT_ITEMS",
    filters: [
      { kind: "in", column: "assignment_id", values: assignmentIds },
      { kind: "in", column: "question_id", values: questionIds },
    ],
    service,
    table: "assignment_items",
  });
  setPreflightCount(counts, "ASSIGNMENT_ITEMS", assignmentItems);

  const assignmentProgress = await readPreflightRows({
    coverageCategory: "ASSIGNMENT_PROGRESS",
    filters: [
      { kind: "in", column: "assignment_id", values: assignmentIds },
      { kind: "in", column: "student_id", values: userIds },
    ],
    service,
    table: "student_assignment_progress",
  });
  setPreflightCount(counts, "ASSIGNMENT_PROGRESS", assignmentProgress);

  const practicePreferences = await readPreflightRows({
    columns: "user_id",
    coverageCategory: "PRACTICE_PREFERENCES",
    filters: [{ kind: "in", column: "user_id", values: userIds }],
    keyFields: ["user_id"],
    service,
    table: "user_practice_preferences",
  });
  setPreflightCount(counts, "PRACTICE_PREFERENCES", practicePreferences);

  const practiceSessions = await readPreflightRows({
    coverageCategory: "PRACTICE_SESSIONS",
    filters: [{ kind: "in", column: "user_id", values: userIds }],
    service,
    table: "practice_sessions",
  });
  const practiceSessionIds = preflightIds(practiceSessions);
  setPreflightCount(counts, "PRACTICE_SESSIONS", practiceSessions);

  const preferenceMergeJobs = await readPreflightRows({
    coverageCategory: "PREFERENCE_MERGE_JOBS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "source_session_id", values: practiceSessionIds },
    ],
    service,
    table: "practice_preference_merge_jobs",
  });
  setPreflightCount(counts, "PREFERENCE_MERGE_JOBS", preferenceMergeJobs);

  const practiceRounds = await readPreflightRows({
    coverageCategory: "PRACTICE_ROUNDS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "session_id", values: practiceSessionIds },
    ],
    service,
    table: "practice_rounds",
  });
  setPreflightCount(counts, "PRACTICE_ROUNDS", practiceRounds);

  const practiceQuestions = await readPreflightRows({
    coverageCategory: "PRACTICE_QUESTIONS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "session_id", values: practiceSessionIds },
      { kind: "in", column: "source_question_id", values: questionIds },
    ],
    service,
    table: "practice_round_questions",
  });
  setPreflightCount(counts, "PRACTICE_QUESTIONS", practiceQuestions);

  const practiceAttempts = await readPreflightRows({
    coverageCategory: "PRACTICE_ATTEMPTS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "session_id", values: practiceSessionIds },
      { kind: "in", column: "source_question_id", values: questionIds },
    ],
    service,
    table: "practice_attempts",
  });
  setPreflightCount(counts, "PRACTICE_ATTEMPTS", practiceAttempts);

  const practiceEpisodes = await readPreflightRows({
    coverageCategory: "PRACTICE_EPISODES",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "session_id", values: practiceSessionIds },
    ],
    service,
    table: "practice_agent_episodes",
  });
  setPreflightCount(counts, "PRACTICE_EPISODES", practiceEpisodes);

  const wrongQuestionRows = await readPreflightRows({
    coverageCategory: "PRACTICE_WRONG_QUESTION_ROWS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "source_question_id", values: questionIds },
    ],
    service,
    table: "practice_wrong_questions",
  });
  setPreflightCount(counts, "PRACTICE_WRONG_QUESTION_ROWS", wrongQuestionRows);

  const hintEvents = await readPreflightRows({
    coverageCategory: "PRACTICE_HINT_EVENTS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "session_id", values: practiceSessionIds },
    ],
    service,
    table: "practice_hint_events",
  });
  setPreflightCount(counts, "PRACTICE_HINT_EVENTS", hintEvents);

  const reflectionRows = await readPreflightRows({
    coverageCategory: "PRACTICE_REFLECTION_ROWS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "session_id", values: practiceSessionIds },
    ],
    service,
    table: "practice_reflection_records",
  });
  setPreflightCount(counts, "PRACTICE_REFLECTION_ROWS", reflectionRows);

  const weaknessRows = await readPreflightRows({
    coverageCategory: "PRACTICE_WEAKNESS_ROWS",
    filters: [
      { kind: "in", column: "user_id", values: userIds },
      { kind: "in", column: "session_id", values: practiceSessionIds },
    ],
    service,
    table: "practice_weakness_links",
  });
  setPreflightCount(counts, "PRACTICE_WEAKNESS_ROWS", weaknessRows);

  const assignmentPracticeLinks = await readPreflightRows({
    columns: "assignment_id, student_id, practice_session_id",
    coverageCategory: "ASSIGNMENT_PRACTICE_LINKS",
    filters: [
      { kind: "in", column: "assignment_id", values: assignmentIds },
      { kind: "in", column: "student_id", values: userIds },
      { kind: "in", column: "practice_session_id", values: practiceSessionIds },
    ],
    keyFields: ["assignment_id", "student_id", "practice_session_id"],
    service,
    table: "assignment_practice_sessions",
  });
  setPreflightCount(counts, "ASSIGNMENT_PRACTICE_LINKS", assignmentPracticeLinks);

  const feedbackRows = await readPreflightRows({
    coverageCategory: "FEEDBACK_ROWS",
    filters: [
      { kind: "in", column: "body", values: ["Disposable sent feedback.", "Disposable private teacher note."] },
      { kind: "in", column: "organization_id", values: organizationIds },
      { kind: "in", column: "assignment_id", values: assignmentIds },
      { kind: "in", column: "student_id", values: userIds },
    ],
    service,
    table: "teacher_feedback_notes",
  });
  setPreflightCount(counts, "FEEDBACK_ROWS", feedbackRows);

  const questionAssetRows = await readPreflightRows({
    columns: "id, storage_bucket, storage_path",
    coverageCategory: "QUESTION_ASSET_ROWS",
    filters: [
      { kind: "eq", column: "label", value: "Disposable browser fixture" },
      { kind: "in", column: "question_id", values: questionIds },
    ],
    service,
    table: "question_assets",
  });
  setPreflightCount(counts, "QUESTION_ASSET_ROWS", questionAssetRows);
  setPreflightCount(
    counts,
    "STORAGE_OBJECTS",
    await readFixtureStorageObjectCount(service, questionIds, questionAssetRows),
  );

  const providerRows = await readPreflightRows({
    coverageCategory: "AI_PROVIDER_ROWS",
    filters: [
      { kind: "like", column: "name", value: `${STALE_PROVIDER_PREFIX}%` },
      { kind: "in", column: "organization_id", values: organizationIds },
      { kind: "in", column: "created_by", values: userIds },
    ],
    service,
    table: "ai_provider_profiles",
  });
  setPreflightCount(counts, "AI_PROVIDER_ROWS", providerRows);

  const missingCategories = PREFLIGHT_CATEGORY_LABELS.filter((category) => !counts.has(category));
  if (missingCategories.length) throw new PreflightCoverageError(missingCategories);
  return counts;
}

function preflightErrorCategory(error) {
  if (error instanceof PreflightAuditError) return error.outputCategory;
  const category = safeFailureCategory(error);
  if (category === "missing_process_environment") return "ENVIRONMENT_MISSING";
  if (category === "production_environment_refused") return "PRODUCTION_REFUSED";
  if (category === "expected_project_identity_mismatch") return "PROJECT_IDENTITY_MISMATCH";
  if (
    [
      "disposable_environment_acknowledgement_required",
      "destructive_fixture_acknowledgement_required",
      "local_fake_provider_mode_required",
    ].includes(category)
  ) {
    return "SAFETY_ACKNOWLEDGEMENT_INVALID";
  }
  return "READ_ONLY_PREFLIGHT_FAILED";
}

async function runPreflightOnly() {
  try {
    const config = requireApprovedProcessEnvironment({ requireLocalBrowser: false, reportPresence: false });
    const service = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const counts = await auditStudentBrowserFixtureResidue(service);
    for (const category of PREFLIGHT_CATEGORY_LABELS) console.log(`${category}=${counts.get(category)}`);
    const residueTotal = PREFLIGHT_CATEGORY_LABELS.reduce((total, category) => total + counts.get(category), 0);
    const affectedCategories = PREFLIGHT_CATEGORY_LABELS.filter((category) => counts.get(category) > 0);
    if (residueTotal === 0) {
      console.log("STALE_FIXTURE_PREFLIGHT_PASS");
      console.log("residue_total=0");
      process.exitCode = 0;
      return;
    }
    console.log("STALE_FIXTURE_PREFLIGHT_BLOCKED");
    console.log(`residue_total=${residueTotal}`);
    console.log(`affected_categories=${affectedCategories.join(",")}`);
    process.exitCode = 1;
  } catch (error) {
    if (error instanceof PreflightCoverageError) {
      console.log("PREFLIGHT_COVERAGE_INCOMPLETE");
      console.log(`missing_categories=${error.missingCategories.join(",")}`);
    } else {
      console.log("STALE_FIXTURE_PREFLIGHT_ERROR");
      console.log(`error_category=${preflightErrorCategory(error)}`);
    }
    process.exitCode = 1;
  } finally {
    clearProcessEnvironment();
  }
}
// PREFLIGHT_ONLY_READ_END

function opaqueRunId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function randomPassword() {
  return `StudentBrowserE2E!${randomBytes(24).toString("base64url")}`;
}

function createSessionClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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

async function signInFixture({ anonKey, email, password, url }) {
  const client = createSessionClient(url, anonKey);
  const result = await client.auth.signInWithPassword({ email, password });
  assert(!result.error && result.data.user?.id, "fixture_sign_in_failed");
  return { client, id: result.data.user.id };
}

async function createFixtureUser({ anonKey, fixtures, organizationId, role, service, url, label }) {
  const ordinal = fixtures.userIds.length + 1;
  const username = `student-browser-${fixtures.runId}-${label}-${ordinal}`;
  // Browser login resolves bare usernames to the local-app domain before it
  // calls Supabase Auth, so the disposable auth user must use that same form.
  const email = `${username}@local.app`;
  const password = randomPassword();
  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: AUTH_FIXTURE_KIND },
  });
  assert(!created.error && created.data.user?.id, "fixture_auth_user_create_failed");
  const userId = created.data.user.id;
  fixtures.userIds.push(userId);

  assertNoError(
    await service.from("profiles").upsert(
      {
        default_organization_id: organizationId,
        display_name: `Student Browser ${label}`,
        email,
        id: userId,
        role,
        status: "active",
        username,
      },
      { onConflict: "id" },
    ),
    "fixture_profile_create_failed",
  );
  const membership = assertNoError(
    await service
      .from("organization_members")
      .insert({ organization_id: organizationId, role, status: "active", user_id: userId })
      .select("id")
      .single(),
    "fixture_organization_membership_create_failed",
  );
  assert(membership?.id, "fixture_organization_membership_id_missing");
  fixtures.organizationMemberIds.push(membership.id);

  const session = await signInFixture({ anonKey, email, password, url });
  assert(session.id === userId, "fixture_session_identity_mismatch");
  return { ...session, password, username };
}

async function createFixtureOrganization(service, fixtures) {
  const row = assertNoError(
    await service
      .from("organizations")
      .insert({
        name: `Student Browser ${fixtures.runId}`,
        slug: `student-browser-${fixtures.runId}`,
        status: "active",
      })
      .select("id")
      .single(),
    "fixture_organization_create_failed",
  );
  assert(row?.id, "fixture_organization_id_missing");
  fixtures.organizationId = row.id;
}

async function createFixtureClassroom(fixtures, label) {
  const result = await fixtures.teacher.client.rpc("create_teacher_classroom", {
    p_description: "Disposable browser validation.",
    p_name: `Student Browser ${label} ${fixtures.runId}`,
    p_organization_id: fixtures.organizationId,
    p_request_id: randomUUID(),
    p_subject: "Browser validation",
  });
  const rows = Array.isArray(assertNoError(result, "fixture_classroom_create_failed"))
    ? result.data
    : [result.data];
  const classroom = rows[0];
  assert(classroom?.classroom_id && classroom?.display_code, "fixture_classroom_create_contract_failed");
  fixtures.classroomIds.push(classroom.classroom_id);
  return classroom;
}

async function createFixtureBank(fixtures) {
  const bankId = assertNoError(
    await fixtures.teacher.client.rpc("create_question_bank", {
      bank_description: "Disposable private source bank for browser validation.",
      bank_name: `Student Browser Bank ${fixtures.runId}`,
      bank_visibility: "private",
    }),
    "fixture_bank_create_failed",
  );
  assert(bankId, "fixture_bank_id_missing");
  fixtures.bankId = bankId;
}

async function insertQuestion(fixtures, suffix) {
  const row = assertNoError(
    await fixtures.service
      .from("questions")
      .insert({
        answer_spec: { kind: "exact_text", value: "2" },
        content_html: "<p>Disposable browser question.</p>",
        content_source: "Disposable browser fixture.",
        content_source_format: "plain_text",
        created_by: fixtures.teacher.id,
        difficulty_rating: 320,
        options: [],
        organization_id: fixtures.organizationId,
        owner_bank_id: fixtures.bankId,
        published_at: null,
        question_code: `student-browser-${fixtures.runId}-${suffix}`,
        question_type: "fill_blank",
        solution_html: "<p>Disposable browser solution.</p>",
        solution_source: "Disposable browser solution.",
        solution_source_format: "plain_text",
        source: "student_browser_e2e",
        source_kind: "manual",
        status: "review",
        title: `Student Browser ${suffix} ${fixtures.runId}`,
        updated_by: fixtures.teacher.id,
        visibility: "private",
      })
      .select("id, title")
      .single(),
    "fixture_question_create_failed",
  );
  assert(row?.id && row.title, "fixture_question_contract_failed");
  fixtures.questionIds.push(row.id);
  return row;
}

async function createBankQuestion(fixtures, questionId) {
  const row = assertNoError(
    await fixtures.service
      .from("bank_questions")
      .insert({
        added_by: fixtures.teacher.id,
        bank_id: fixtures.bankId,
        metadata: { fixture_only: true },
        question_id: questionId,
        source_kind: "manual",
        status: "active",
      })
      .select("id")
      .single(),
    "fixture_bank_question_create_failed",
  );
  assert(row?.id, "fixture_bank_question_id_missing");
  fixtures.bankQuestionIds.push(row.id);
  return row.id;
}

async function createQuestionAsset(fixtures, questionId) {
  const assetId = randomUUID();
  const storagePath = `questions/${questionId}/${assetId}.png`;
  const row = assertNoError(
    await fixtures.service
      .from("question_assets")
      .insert({
        alt_text: "Disposable browser fixture",
        asset_kind: "image",
        created_by: fixtures.teacher.id,
        display_order: 0,
        id: assetId,
        label: "Disposable browser fixture",
        question_id: questionId,
        storage_bucket: "question-assets",
        storage_path: storagePath,
      })
      .select("id")
      .single(),
    "fixture_asset_create_failed",
  );
  assert(row?.id, "fixture_asset_id_missing");
  fixtures.assetIds.push(assetId);
  fixtures.assetPaths.push(storagePath);
  const upload = await fixtures.service.storage
    .from("question-assets")
    .upload(storagePath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
      contentType: "image/png",
    });
  assert(!upload.error, "fixture_asset_upload_failed");
  return assetId;
}

async function createFixtureAssignment(fixtures, bankQuestionId, classroomId, label) {
  const assignmentId = assertNoError(
    await fixtures.teacher.client.rpc("create_assignment_from_bank", {
      p_assign_now: true,
      p_assignment_due_at: null,
      p_assignment_instructions: "Disposable browser validation.",
      p_assignment_title: `Student Browser ${label} ${fixtures.runId}`,
      p_selected_bank_question_ids: [bankQuestionId],
      p_target_bank_id: fixtures.bankId,
      p_target_classroom_id: classroomId,
    }),
    "fixture_assignment_create_failed",
  );
  assert(assignmentId, "fixture_assignment_id_missing");
  fixtures.assignmentIds.push(assignmentId);
  return assignmentId;
}

async function publishFixtureAssignmentsAfterStudentJoin(fixtures) {
  fixtures.phase = "fixture_teacher_assignment_publish";
  console.log("PHASE=fixture_teacher_assignment_publish");
  fixtures.assignmentId = await createFixtureAssignment(
    fixtures,
    fixtures.selectedBankQuestionId,
    fixtures.classroomId,
    "assigned",
  );
  fixtures.assignmentTitle = `Student Browser assigned ${fixtures.runId}`;
  fixtures.hiddenAssignmentId = await createFixtureAssignment(
    fixtures,
    fixtures.selectedBankQuestionId,
    fixtures.hiddenClassroomId,
    "unentitled",
  );
  fixtures.hiddenAssignmentTitle = `Student Browser unentitled ${fixtures.runId}`;
  await createFeedback(fixtures);
}

async function assertStudentAssignmentEntitlement(fixtures) {
  fixtures.phase = "fixture_student_assignment_entitlement_preflight";
  console.log("PHASE=fixture_student_assignment_entitlement_preflight");
  const membership = assertNoError(
    await fixtures.studentA.client
      .from("classroom_members")
      .select("classroom_id")
      .eq("classroom_id", fixtures.classroomId)
      .eq("user_id", fixtures.studentA.id)
      .eq("role", "student")
      .eq("status", "active")
      .maybeSingle(),
    "student_assignment_membership_preflight_failed",
  );
  assert(membership?.classroom_id === fixtures.classroomId, "student_browser_join_not_persisted");

  const assignment = assertNoError(
    await fixtures.studentA.client
      .from("assignments")
      .select("id, title")
      .eq("id", fixtures.assignmentId)
      .maybeSingle(),
    "student_assignment_read_preflight_failed",
  );
  assert(assignment?.id === fixtures.assignmentId, "student_session_cannot_read_published_assignment");
  assert(assignment.title === fixtures.assignmentTitle, "fixture_assignment_title_mismatch");
  fixtures.assignmentTitle = assignment.title;

  const items = assertNoError(
    await fixtures.studentA.client
      .from("assignment_items")
      .select("id")
      .eq("assignment_id", fixtures.assignmentId),
    "student_assignment_item_read_preflight_failed",
  );
  assert(items?.length === 1, "student_session_cannot_read_published_assignment_item");
}

async function createFeedback(fixtures) {
  const sent = assertNoError(
    await fixtures.service
      .from("teacher_feedback_notes")
      .insert({
        assignment_id: fixtures.assignmentId,
        author_id: fixtures.teacher.id,
        body: "Disposable sent feedback.",
        classroom_id: fixtures.classroomId,
        organization_id: fixtures.organizationId,
        question_id: fixtures.selectedQuestionId,
        sent_at: new Date().toISOString(),
        status: "sent",
        student_id: fixtures.studentA.id,
        visibility: "sent_to_student",
      })
      .select("id")
      .single(),
    "fixture_sent_feedback_create_failed",
  );
  const privateNote = assertNoError(
    await fixtures.service
      .from("teacher_feedback_notes")
      .insert({
        assignment_id: fixtures.assignmentId,
        author_id: fixtures.teacher.id,
        body: "Disposable private teacher note.",
        classroom_id: fixtures.classroomId,
        organization_id: fixtures.organizationId,
        question_id: fixtures.selectedQuestionId,
        status: "draft",
        student_id: fixtures.studentA.id,
        visibility: "private_teacher",
      })
      .select("id")
      .single(),
    "fixture_private_feedback_create_failed",
  );
  assert(sent?.id && privateNote?.id, "fixture_feedback_ids_missing");
  fixtures.feedbackIds.push(sent.id, privateNote.id);
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
    "provider_preflight_failed",
  ) ?? [];
  assert(
    !profiles.some((profile) => profile.is_default && providerMayRunPractice(profile)),
    "preexisting_compatible_default_provider_refused",
  );
}

async function createFixtureProvider({ fakeProvider, fixtures, encryptionKey }) {
  const secret = randomBytes(24).toString("base64url");
  fakeProvider.setExpectedCredential(secret);
  const row = assertNoError(
    await fixtures.service
      .from("ai_provider_profiles")
      .insert({
        ...encryptFixtureSecret(secret, encryptionKey),
        base_url: fakeProvider.baseUrl,
        created_by: fixtures.teacher.id,
        enabled: true,
        is_default: false,
        model: "fixture-student-browser-model",
        name: `!student-browser-e2e-${fixtures.runId}`,
        organization_id: fixtures.organizationId,
        provider: "compatible",
        supports_pdf_input: false,
        supports_vision_images: false,
        updated_by: fixtures.teacher.id,
      })
      .select("id")
      .single(),
    "fixture_provider_create_failed",
  );
  assert(row?.id, "fixture_provider_id_missing");
  fixtures.providerProfileIds.push(row.id);

  const candidates = assertNoError(
    await fixtures.service
      .from("ai_provider_profiles")
      .select("id, provider, base_url, enabled, is_default, name")
      .eq("enabled", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    "provider_selection_preflight_failed",
  ) ?? [];
  const compatible = candidates.filter(providerMayRunPractice);
  const selected = compatible.find((profile) => profile.is_default) ?? compatible[0] ?? null;
  assert(selected?.id === row.id, "fixture_provider_selection_not_exclusive");
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
  const state = { expectedCredential: "", requestCount: 0, sawOnlyExpectedCredential: true };
  const rawMarker = `upstream-${randomBytes(18).toString("base64url")}`;
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    state.requestCount += 1;
    state.sawOnlyExpectedCredential &&= request.headers.authorization === `Bearer ${state.expectedCredential}`;
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
  assert(address && typeof address === "object", "local_fake_provider_listen_failed");
  return {
    assertCredentialSelection() {
      assert(state.requestCount > 0 && state.sawOnlyExpectedCredential, "fixture_provider_not_selected_safely");
    },
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
    rawMarker,
    setExpectedCredential(value) {
      state.expectedCredential = value;
    },
  };
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : null;
  await new Promise((resolveClose) => server.close(resolveClose));
  assert(port, "next_server_port_allocate_failed");
  return port;
}

function markServerRuntimeCategory(serverDiagnostics, category) {
  addBoundedCategory(serverDiagnostics.runtimeCategories, category, SERVER_RUNTIME_CATEGORIES);
}

function inspectServerOutput(chunk, serverDiagnostics) {
  const text = String(chunk).slice(0, 32_768).toLowerCase();
  if (/\b(?:get|post|put|patch|delete|head|options)\s+\S+\s+4\d\d\b|status(?: code)?[\s:=]+4\d\d/.test(text)) {
    markServerRuntimeCategory(serverDiagnostics, "HTTP_4XX");
  }
  if (/\b(?:get|post|put|patch|delete|head|options)\s+\S+\s+5\d\d\b|status(?: code)?[\s:=]+5\d\d/.test(text)) {
    markServerRuntimeCategory(serverDiagnostics, "HTTP_5XX");
  }
  if (/unhandled\s*rejection|unhandledrejection/.test(text)) {
    markServerRuntimeCategory(serverDiagnostics, "UNHANDLED_REJECTION");
  }
  if (/uncaught\s*exception|uncaughtexception/.test(text)) {
    markServerRuntimeCategory(serverDiagnostics, "UNCAUGHT_EXCEPTION");
  }
  if (/failed to compile|compilation failed|module not found|syntax error/.test(text)) {
    markServerRuntimeCategory(serverDiagnostics, "COMPILE_ERROR");
  }
  if (/runtime error|internal server error|application error/.test(text)) {
    markServerRuntimeCategory(serverDiagnostics, "RUNTIME_ERROR");
  }
}

function primaryServerRuntimeCategory(serverDiagnostics) {
  const priority = [
    "UNCAUGHT_EXCEPTION",
    "UNHANDLED_REJECTION",
    "COMPILE_ERROR",
    "RUNTIME_ERROR",
    "HTTP_5XX",
    "HTTP_4XX",
    "PROCESS_EXIT_NONZERO",
  ];
  return priority.find((category) => serverDiagnostics.runtimeCategories.includes(category)) ?? "NONE";
}

async function startNextServer(config, diagnostics) {
  const port = await findFreePort();
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
  delete environment.AI_PROVIDER_GATEWAY_TOKEN;

  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(port)], {
    cwd: root,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => inspectServerOutput(chunk, diagnostics.server));
  child.stderr.on("data", (chunk) => inspectServerOutput(chunk, diagnostics.server));
  child.once("exit", (code) => {
    diagnostics.server.exitCodeCategory = Number.isInteger(code) ? (code === 0 ? "ZERO" : "NONZERO") : "UNKNOWN";
    if (!diagnostics.server.closing && Number.isInteger(code) && code !== 0) {
      markServerRuntimeCategory(diagnostics.server, "PROCESS_EXIT_NONZERO");
    }
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/auth/login`);
      if (response.status >= 500) markServerRuntimeCategory(diagnostics.server, "HTTP_5XX");
      else if (response.status >= 400) markServerRuntimeCategory(diagnostics.server, "HTTP_4XX");
      if (response.status < 500) {
        diagnostics.server.healthy = true;
        return {
          close: async () => {
            if (child.exitCode !== null) return;
            diagnostics.server.closing = true;
            child.kill();
            await new Promise((resolveExit) => child.once("exit", resolveExit));
          },
          origin,
        };
      }
    } catch {
      // Keep startup retries bounded without leaking server output.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  diagnostics.server.closing = true;
  child.kill();
  if (child.exitCode === null) await new Promise((resolveExit) => child.once("exit", resolveExit));
  throw new HarnessError("next_server_start_timeout");
}

function setHarnessPhase(fixtures, phase) {
  fixtures.phase = phase;
  console.log(`PHASE=${phase}`);
}

function navigationStatusFor(status) {
  if (status >= 200 && status < 300) return "NAVIGATION_2XX";
  if (status >= 300 && status < 400) return "NAVIGATION_3XX";
  if (status >= 400 && status < 500) return "NAVIGATION_4XX";
  if (status >= 500 && status < 600) return "NAVIGATION_5XX";
  return "NO_DOCUMENT_RESPONSE";
}

function assignmentStartStatusFor(status) {
  if (status >= 200 && status < 300) return "RESPONSE_2XX";
  if (status >= 300 && status < 400) return "RESPONSE_3XX";
  if (status >= 400 && status < 500) return "RESPONSE_4XX";
  if (status >= 500 && status < 600) return "RESPONSE_5XX";
  return "REQUEST_FAILED";
}

async function assignmentStartResponseOutcome(response) {
  const httpStatus = response.status();
  const succeeded = httpStatus >= 200 && httpStatus < 300;
  let code = succeeded ? "NONE" : "UNRECOGNIZED_API_CODE";
  let sessionId = null;
  try {
    const parsed = await response.json();
    const candidate = parsed && typeof parsed === "object" ? parsed.code : null;
    if (!succeeded && typeof candidate === "string" && candidate !== "NONE" && ASSIGNMENT_START_API_CODES.has(candidate)) {
      code = candidate;
    }
    const candidateSessionId = parsed && typeof parsed === "object" ? parsed.session?.id : null;
    if (succeeded && typeof candidateSessionId === "string") sessionId = candidateSessionId;
  } catch {
    // The body is discarded; malformed or absent codes fail closed.
  }
  return {
    apiStatus: assignmentStartStatusFor(httpStatus),
    code,
    httpStatus,
    sessionId,
  };
}

function assignmentStartUnavailableOutcome(apiStatus) {
  return {
    apiStatus,
    code: "UNRECOGNIZED_API_CODE",
    httpStatus: 0,
    sessionId: null,
  };
}

function finalRouteCategory(value) {
  try {
    const pathname = new URL(value).pathname;
    if (pathname === "/practice") return "PRACTICE_ROUTE";
    if (pathname.startsWith("/auth/login")) return "LOGIN_ROUTE";
    if (pathname.startsWith("/student")) return "STUDENT_ROUTE";
    if (/^\/(?:_error|error|404|500|not-found)(?:\/|$)/.test(pathname)) return "ERROR_ROUTE";
    return "UNEXPECTED_ROUTE";
  } catch {
    return "UNEXPECTED_ROUTE";
  }
}

function isAssignmentStartRequest(request, expectedOrigin) {
  return isPracticePostRequest(request, expectedOrigin, PRACTICE_START_PATH);
}

function isPracticePostRequest(request, expectedOrigin, pathname) {
  try {
    const url = new URL(request.url());
    return (
      request.method() === "POST" &&
      request.resourceType() === "fetch" &&
      url.origin === expectedOrigin &&
      url.pathname === pathname
    );
  } catch {
    return false;
  }
}

function reviewCategoryFromStream(httpStatus, streamText) {
  if (httpStatus < 200 || httpStatus >= 300) return "REVIEW_ERROR_EVENT";
  const eventNames = [...String(streamText).matchAll(/(?:^|\n)event:\s*([a-z_]+)\s*(?=\r?\n|$)/gi)]
    .map((match) => match[1]?.toLowerCase());
  if (eventNames.includes("result")) return "REVIEW_SUCCESS_EVENT";
  if (eventNames.includes("error")) return "REVIEW_ERROR_EVENT";
  return "REVIEW_STREAM_INCOMPLETE";
}

function waitForReviewOutcome(page, expectedOrigin, timeoutMs = 60_000) {
  return new Promise((resolveOutcome) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
      resolveOutcome(outcome);
    };
    const onResponse = async (response) => {
      if (!isPracticePostRequest(response.request(), expectedOrigin, PRACTICE_REVIEW_PATH)) return;
      const httpStatus = response.status();
      let category = httpStatus >= 200 && httpStatus < 300
        ? "REVIEW_STREAM_INCOMPLETE"
        : "REVIEW_ERROR_EVENT";
      if (httpStatus >= 200 && httpStatus < 300) {
        const streamText = await response.text().catch(() => "");
        category = reviewCategoryFromStream(httpStatus, streamText);
      }
      finish({ category, httpStatus });
    };
    const onRequestFailed = (request) => {
      if (isPracticePostRequest(request, expectedOrigin, PRACTICE_REVIEW_PATH)) {
        finish({ category: "REVIEW_NOT_OBSERVED", httpStatus: 0 });
      }
    };
    const timer = setTimeout(
      () => finish({ category: "REVIEW_NOT_OBSERVED", httpStatus: 0 }),
      timeoutMs,
    );
    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);
  });
}

function gradeCategoryFromStatus(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300) return "GRADE_RESPONSE_2XX";
  if (httpStatus >= 400 && httpStatus < 500) return "GRADE_RESPONSE_4XX";
  if (httpStatus >= 500 && httpStatus < 600) return "GRADE_RESPONSE_5XX";
  return "GRADE_NOT_OBSERVED";
}

function observeGradeOutcome(page, expectedOrigin, timeoutMs = 60_000) {
  let current = { category: "GRADE_NOT_OBSERVED", httpStatus: 0 };
  let resolveWait;
  const wait = new Promise((resolveOutcome) => {
    resolveWait = resolveOutcome;
  });
  let settled = false;
  const finish = (outcome) => {
    if (settled) return;
    settled = true;
    current = outcome;
    clearTimeout(timer);
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
    resolveWait(outcome);
  };
  const onResponse = (response) => {
    if (!isPracticePostRequest(response.request(), expectedOrigin, PRACTICE_GRADE_PATH)) return;
    const httpStatus = response.status();
    finish({ category: gradeCategoryFromStatus(httpStatus), httpStatus });
  };
  const onRequestFailed = (request) => {
    if (isPracticePostRequest(request, expectedOrigin, PRACTICE_GRADE_PATH)) {
      finish({ category: "GRADE_NOT_OBSERVED", httpStatus: 0 });
    }
  };
  const timer = setTimeout(
    () => finish({ category: "GRADE_NOT_OBSERVED", httpStatus: 0 }),
    timeoutMs,
  );
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);

  return {
    disposeAsNotRequired() {
      finish({ category: "GRADE_NOT_REQUIRED", httpStatus: 0 });
    },
    read: () => current,
    wait: () => wait,
  };
}

function classifyPageError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  if (/unauthori[sz]ed|forbidden|auth|session|sign[ -]?in/.test(message)) return "AUTH_ERROR";
  if (/network|fetch|connection|socket|dns|timeout/.test(message)) return "NETWORK_ERROR";
  if (/hydration|render|react|chunk|component/.test(message)) return "CLIENT_RENDER_ERROR";
  return "UNKNOWN_PAGE_ERROR";
}

function classifyFailedRequest(request, expectedOrigin) {
  try {
    const url = new URL(request.url());
    if (request.resourceType() === "document") return "DOCUMENT";
    if (url.origin !== expectedOrigin) return "EXTERNAL";
    if (url.pathname === PRACTICE_START_PATH) return "PRACTICE_ASSIGNMENT_START";
    if (url.pathname.startsWith("/_next/static/")) return "NEXT_STATIC";
    return "OTHER_SAME_ORIGIN";
  } catch {
    return "UNKNOWN";
  }
}

function installSanitizedBrowserDiagnostics(page, diagnostics, expectedOrigin) {
  page.on("pageerror", (error) => {
    addBoundedCategory(diagnostics.pageErrorCategories, classifyPageError(error), PAGE_ERROR_CATEGORIES);
  });
  page.on("requestfailed", (request) => {
    addBoundedCategory(
      diagnostics.failedRequestCategories,
      classifyFailedRequest(request, expectedOrigin),
      FAILED_REQUEST_CATEGORIES,
    );
  });
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrorCount = Math.min(diagnostics.consoleErrorCount + 1, 999);
  });
}

function waitForAssignmentStartOutcome(page, expectedOrigin, timeoutMs = 30_000) {
  return new Promise((resolveOutcome) => {
    let responseClaimed = false;
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
      resolveOutcome(outcome);
    };
    const onResponse = async (response) => {
      if (!isAssignmentStartRequest(response.request(), expectedOrigin) || responseClaimed) return;
      responseClaimed = true;
      finish(await assignmentStartResponseOutcome(response));
    };
    const onRequestFailed = (request) => {
      if (isAssignmentStartRequest(request, expectedOrigin)) {
        finish(assignmentStartUnavailableOutcome("REQUEST_FAILED"));
      }
    };
    const timer = setTimeout(
      () => finish(assignmentStartUnavailableOutcome("REQUEST_NOT_OBSERVED")),
      timeoutMs,
    );
    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);
  });
}

function waitForPracticeDocumentOutcome(page, expectedOrigin, timeoutMs = 4_000) {
  return new Promise((resolveOutcome) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off("response", onResponse);
      resolveOutcome(outcome);
    };
    const onResponse = (response) => {
      try {
        const url = new URL(response.url());
        if (
          response.request().resourceType() === "document" &&
          url.origin === expectedOrigin &&
          url.pathname === "/practice"
        ) {
          finish(navigationStatusFor(response.status()));
        }
      } catch {
        // A malformed response URL is safely treated as no document response.
      }
    };
    const timer = setTimeout(() => finish("NO_DOCUMENT_RESPONSE"), timeoutMs);
    page.on("response", onResponse);
  });
}

function isPageContextError(error) {
  return /target (?:page|context|browser).*closed|page has been closed|browser has been closed/i.test(
    String(error?.message ?? ""),
  );
}

async function waitForPracticeStep(promise, timeoutCategory) {
  try {
    return await promise;
  } catch (error) {
    if (isPageContextError(error)) throw new HarnessError("practice_page_context_error");
    throw new HarnessError(timeoutCategory);
  }
}

function assertPracticeRoute(category) {
  assert(FINAL_ROUTE_CATEGORIES.has(category), "practice_unexpected_route");
  if (category === "LOGIN_ROUTE") throw new HarnessError("practice_login_redirect");
  if (category === "STUDENT_ROUTE") throw new HarnessError("practice_student_redirect");
  if (category === "ERROR_ROUTE") throw new HarnessError("practice_error_route");
  if (category !== "PRACTICE_ROUTE") throw new HarnessError("practice_unexpected_route");
}

function assertSafeBrowserText(value, fixtures, fakeProvider) {
  const normalized = String(value).toLowerCase();
  assert(
    !/row-level security|new row violates|permission denied|sqlstate|pgrst|postgresql|supabase error/.test(normalized),
    "raw_database_error_exposed_to_browser",
  );
  assert(!value.includes(fakeProvider.rawMarker), "raw_provider_error_exposed_to_browser");
  assert(
    !/api_key_ciphertext|api_key_iv|api_key_tag|credential_ref|ai_provider_gateway_token/.test(normalized),
    "provider_secret_metadata_exposed_to_browser",
  );
  assert(!fixtures.providerProfileIds.some((id) => value.includes(id)), "provider_identifier_exposed_to_browser");
}

async function assertSafePage(page, fixtures, fakeProvider) {
  assertSafeBrowserText(await page.locator("body").innerText(), fixtures, fakeProvider);
}

async function browserFetch(page, path, options = {}) {
  return page.evaluate(
    async ({ path: requestPath, options: requestOptions }) => {
      const response = await fetch(requestPath, requestOptions);
      return { status: response.status, text: await response.text() };
    },
    { options, path },
  );
}

async function signInThroughBrowser(page, origin, actor) {
  await page.goto(`${origin}/auth/login?next=%2Fstudent`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(actor.username);
  await page.locator("#password").fill(actor.password);
  await Promise.all([
    page.waitForURL(/\/student(?:$|\?)/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function joinClassroomThroughBrowser(page, fixtures, fakeProvider) {
  fixtures.phase = "browser_join_open_classes";
  console.log("PHASE=browser_join_open_classes");
  await page.goto(`${fixtures.server.origin}/student/classrooms`, { waitUntil: "networkidle" });
  await page.getByText("No classes joined yet").waitFor();
  await assertSafePage(page, fixtures, fakeProvider);
  fixtures.phase = "browser_join_open_form";
  console.log("PHASE=browser_join_open_form");
  await page.getByRole("link", { name: "Join a class" }).click();
  await page.locator("#join_code").fill(fixtures.classroomDisplayCode);
  fixtures.phase = "browser_join_submit";
  console.log("PHASE=browser_join_submit");
  await page.getByRole("button", { name: "Join classroom" }).click();
  let joined = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const url = page.url();
    if (/\/student\/classrooms\/join\?error=/.test(url)) {
      throw new HarnessError("browser_classroom_join_action_rejected");
    }
    if (/\/student\/classrooms(?:\?|$)/.test(url)) {
      const text = await page.locator("body").innerText();
      if (text.includes("Joined ")) {
        joined = true;
        break;
      }
    }
    await page.waitForTimeout(250);
  }
  assert(joined, "browser_classroom_join_navigation_timeout");
  await assertSafePage(page, fixtures, fakeProvider);
}

async function assertStudentWorkspaceOnly(page, fixtures, fakeProvider) {
  await page.goto(`${fixtures.server.origin}/student`, { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Student workspace" }).waitFor();
  const text = await page.locator("body").innerText();
  assert(!/AI Settings|Admin workspace|Teacher Studio|Review Drafts/.test(text), "teacher_or_admin_control_visible_to_student");
  assertSafeBrowserText(text, fixtures, fakeProvider);
}

async function assertMyWorkAndDetail(page, fixtures, fakeProvider) {
  fixtures.phase = "browser_my_work_open";
  console.log("PHASE=browser_my_work_open");
  const response = await page.goto(`${fixtures.server.origin}/student/work`, {
    waitUntil: "domcontentloaded",
  });
  assert(response?.status() && response.status() < 500, "browser_my_work_server_error");
  assert(!page.url().includes("/auth/login"), "browser_my_work_auth_lost");
  fixtures.phase = "browser_my_work_list";
  console.log("PHASE=browser_my_work_list");
  const initialWorkText = await page.locator("body").innerText();
  assert(!initialWorkText.includes("No assigned work yet"), "browser_my_work_empty_after_entitlement");
  fixtures.phase = "browser_my_work_entitled_assignment_visible";
  console.log("PHASE=browser_my_work_entitled_assignment_visible");
  const entitledAssignmentLink = page.locator(`a[href="/student/work/${fixtures.assignmentId}"]`);
  await entitledAssignmentLink.waitFor({ timeout: 30_000 }).catch(async () => {
    const startPracticeCount = await page.getByRole("link", { name: "Start Practice" }).count();
    throw new HarnessError(
      startPracticeCount
        ? "browser_my_work_assignment_data_mismatch"
        : "browser_my_work_assignment_card_missing_after_entitlement",
    );
  });
  const workText = await page.locator("body").innerText();
  fixtures.phase = "browser_my_work_unentitled_assignment_denied";
  console.log("PHASE=browser_my_work_unentitled_assignment_denied");
  assert(
    (await page.locator(`a[href="/student/work/${fixtures.hiddenAssignmentId}"]`).count()) === 0,
    "unentitled_assignment_link_visible_in_my_work",
  );
  assert(!workText.includes(fixtures.hiddenAssignmentTitle), "unentitled_assignment_visible_in_my_work");
  assertSafeBrowserText(workText, fixtures, fakeProvider);

  fixtures.phase = "browser_assignment_detail";
  console.log("PHASE=browser_assignment_detail");
  const detailResponse = await page.goto(`${fixtures.server.origin}/student/work/${fixtures.assignmentId}`, {
    waitUntil: "domcontentloaded",
  });
  assert(detailResponse?.status() === 200, "browser_assignment_detail_not_found_or_denied");
  assert(!page.url().includes("/auth/login"), "browser_assignment_detail_auth_lost");
  fixtures.phase = "browser_assignment_detail_title";
  console.log("PHASE=browser_assignment_detail_title");
  const detailHeading = await page.locator("h1").first().innerText();
  assert(
    !/internal server error|application error|not found/i.test(detailHeading),
    "browser_assignment_detail_render_error",
  );
  assert(detailHeading === fixtures.assignmentTitle, "browser_assignment_detail_title_mismatch");
  fixtures.phase = "browser_assignment_detail_selected_question";
  console.log("PHASE=browser_assignment_detail_selected_question");
  await page.getByText(fixtures.selectedQuestionTitle).waitFor({ timeout: 30_000 });
  const detailText = await page.locator("body").innerText();
  fixtures.phase = "browser_assignment_detail_sent_feedback";
  console.log("PHASE=browser_assignment_detail_sent_feedback");
  assert(detailText.includes("Disposable sent feedback."), "sent_feedback_not_visible_to_student");
  fixtures.phase = "browser_assignment_detail_private_feedback_hidden";
  console.log("PHASE=browser_assignment_detail_private_feedback_hidden");
  assert(!detailText.includes("Disposable private teacher note."), "private_teacher_note_visible_to_student");
  fixtures.phase = "browser_assignment_detail_unselected_question_hidden";
  console.log("PHASE=browser_assignment_detail_unselected_question_hidden");
  assert(!detailText.includes(fixtures.unselectedQuestionTitle), "unselected_bank_question_visible_in_assignment_detail");
  assertSafeBrowserText(detailText, fixtures, fakeProvider);
}

async function startResumeAndCompleteAssignment(page, fixtures, fakeProvider) {
  const initialUrl = page.url();
  const assignmentStartOutcome = waitForAssignmentStartOutcome(page, fixtures.server.origin);
  const documentOutcome = waitForPracticeDocumentOutcome(page, fixtures.server.origin);

  setHarnessPhase(fixtures, "browser_assignment_practice_click");
  await waitForPracticeStep(
    page.getByRole("link", { name: /Practice for this assignment/ }).click(),
    "practice_navigation_timeout",
  );

  setHarnessPhase(fixtures, "browser_assignment_practice_navigation_response");
  fixtures.diagnostics.navigationStatus = await documentOutcome;
  assert(NAVIGATION_STATUSES.has(fixtures.diagnostics.navigationStatus), "practice_navigation_timeout");

  setHarnessPhase(fixtures, "browser_assignment_practice_final_route");
  await waitForPracticeStep(
    page.waitForURL((url) => url.href !== initialUrl, { timeout: 30_000 }),
    "practice_navigation_timeout",
  );
  fixtures.diagnostics.finalRoute = finalRouteCategory(page.url());
  assertPracticeRoute(fixtures.diagnostics.finalRoute);

  setHarnessPhase(fixtures, "browser_assignment_practice_start_api_wait");
  const assignmentStartResult = await assignmentStartOutcome;
  fixtures.diagnostics.assignmentStartApi = assignmentStartResult.apiStatus;
  fixtures.diagnostics.assignmentStartCode = assignmentStartResult.code;
  fixtures.diagnostics.assignmentStartHttpStatus = assignmentStartResult.httpStatus;
  assert(ASSIGNMENT_START_API_STATUSES.has(fixtures.diagnostics.assignmentStartApi), "practice_start_api_timeout");
  assert(ASSIGNMENT_START_API_CODES.has(fixtures.diagnostics.assignmentStartCode), "practice_start_api_non_2xx");
  assert(
    Number.isInteger(fixtures.diagnostics.assignmentStartHttpStatus) &&
      fixtures.diagnostics.assignmentStartHttpStatus >= 0 &&
      fixtures.diagnostics.assignmentStartHttpStatus <= 599,
    "practice_start_api_non_2xx",
  );
  if (fixtures.diagnostics.assignmentStartApi === "REQUEST_NOT_OBSERVED") {
    throw new HarnessError("practice_start_api_timeout");
  }
  if (fixtures.diagnostics.assignmentStartApi === "REQUEST_FAILED") {
    throw new HarnessError("practice_start_api_request_failed");
  }

  setHarnessPhase(fixtures, "browser_assignment_practice_start_api_status");
  if (fixtures.diagnostics.assignmentStartApi !== "RESPONSE_2XX") {
    throw new HarnessError("practice_start_api_non_2xx");
  }
  assert(fixtures.diagnostics.assignmentStartCode === "NONE", "practice_start_api_non_2xx");

  setHarnessPhase(fixtures, "browser_assignment_practice_banner");
  await waitForPracticeStep(
    page.getByText("Assignment practice").waitFor({ timeout: 30_000 }),
    "practice_banner_timeout",
  );

  setHarnessPhase(fixtures, "browser_assignment_practice_question_title");
  await waitForPracticeStep(
    page.getByText(fixtures.selectedQuestionTitle).waitFor({ timeout: 30_000 }),
    "practice_question_title_timeout",
  );

  setHarnessPhase(fixtures, "browser_assignment_practice_safe_text");
  await waitForPracticeStep(assertSafePage(page, fixtures, fakeProvider), "practice_page_context_error");

  setHarnessPhase(fixtures, "browser_assignment_practice_reload_start");
  const reloadStartOutcome = waitForAssignmentStartOutcome(page, fixtures.server.origin);
  await page.reload({ waitUntil: "networkidle" });

  setHarnessPhase(fixtures, "browser_assignment_practice_reload_start_api_wait");
  const reloadStartResult = await reloadStartOutcome;

  setHarnessPhase(fixtures, "browser_assignment_practice_reload_start_api_status");
  assert(
    reloadStartResult.apiStatus === "RESPONSE_2XX" &&
      reloadStartResult.httpStatus >= 200 &&
      reloadStartResult.httpStatus < 300 &&
      reloadStartResult.code === "NONE",
    "practice_reload_start_api_non_2xx",
  );

  setHarnessPhase(fixtures, "browser_assignment_practice_reload_session_consistency");
  fixtures.diagnostics.reloadSessionConsistency =
    assignmentStartResult.sessionId && reloadStartResult.sessionId
      ? assignmentStartResult.sessionId === reloadStartResult.sessionId
        ? "MATCH"
        : "MISMATCH"
      : "NOT_OBSERVED";
  console.log(`reload_session_consistency=${fixtures.diagnostics.reloadSessionConsistency}`);
  assert(fixtures.diagnostics.reloadSessionConsistency === "MATCH", "practice_reload_session_mismatch");
  const linkedSessionCountResult = await fixtures.service
    .from("assignment_practice_sessions")
    .select("practice_session_id", { count: "exact", head: true })
    .eq("assignment_id", fixtures.assignmentId)
    .eq("student_id", fixtures.studentA.id);
  assertNoError(linkedSessionCountResult, "assignment_practice_link_count_failed");
  assert(linkedSessionCountResult.count === 1, "assignment_practice_link_count_changed_after_reload");
  await page.getByText("Assignment practice").waitFor({ timeout: 30_000 });
  await page.getByText(fixtures.selectedQuestionTitle).waitFor({ timeout: 30_000 });
  await assertSafePage(page, fixtures, fakeProvider);

  setHarnessPhase(fixtures, "browser_assignment_practice_answer_control");
  const answerControlContainer = page.locator('[data-testid="practice-answer-control"]');
  await answerControlContainer.waitFor({ timeout: 30_000 });
  assert(await answerControlContainer.count() === 1, "practice_answer_control_not_unique");

  setHarnessPhase(fixtures, "browser_assignment_practice_client_ready");
  await page
    .locator('[data-testid="practice-answer-control"][data-client-ready="yes"]')
    .waitFor({ timeout: 30_000 });
  const answerControl = answerControlContainer.getByPlaceholder("Enter your final answer", { exact: true });

  setHarnessPhase(fixtures, "browser_assignment_practice_answer_input");
  await answerControl.fill("2");

  setHarnessPhase(fixtures, "browser_assignment_practice_answer_committed");
  await page
    .locator('[data-testid="practice-answer-control"][data-answer-committed="yes"]')
    .waitFor({ timeout: 30_000 });

  setHarnessPhase(fixtures, "browser_assignment_practice_submit_button");
  const submitButton = page.getByRole("button", { name: "Submit round" });
  await submitButton.waitFor({ timeout: 30_000 });
  const reviewOutcome = waitForReviewOutcome(page, fixtures.server.origin);
  const gradeObserver = observeGradeOutcome(page, fixtures.server.origin);

  setHarnessPhase(fixtures, "browser_assignment_practice_submit_click");
  await submitButton.click();

  setHarnessPhase(fixtures, "browser_assignment_practice_guard_passed");
  await page
    .locator('[data-testid="practice-submission-state"][data-client-missing-answer-guard="PASSED"]')
    .waitFor({ timeout: 30_000 });

  setHarnessPhase(fixtures, "browser_assignment_practice_review_api_wait");
  const reviewResult = await reviewOutcome;
  fixtures.diagnostics.reviewCategory = reviewResult.category;
  fixtures.diagnostics.reviewHttpStatus = reviewResult.httpStatus;

  setHarnessPhase(fixtures, "browser_assignment_practice_review_api_status");
  assert(REVIEW_CATEGORIES.has(reviewResult.category), "practice_review_category_invalid");
  assert(reviewResult.category !== "REVIEW_NOT_OBSERVED", "practice_review_not_observed");

  setHarnessPhase(fixtures, "browser_assignment_practice_grade_api_wait");
  if (reviewResult.category === "REVIEW_SUCCESS_EVENT") {
    gradeObserver.disposeAsNotRequired();
  }
  const gradeResult = await gradeObserver.wait();
  fixtures.diagnostics.gradeCategory = gradeResult.category;
  fixtures.diagnostics.gradeHttpStatus = gradeResult.httpStatus;

  setHarnessPhase(fixtures, "browser_assignment_practice_grade_api_status");
  assert(GRADE_CATEGORIES.has(gradeResult.category), "practice_grade_category_invalid");
  assert(
    reviewResult.category === "REVIEW_SUCCESS_EVENT" || gradeResult.category === "GRADE_RESPONSE_2XX",
    "practice_review_and_grade_failed",
  );

  setHarnessPhase(fixtures, "browser_assignment_practice_result_badge");
  await page
    .locator('[data-testid="practice-result-badge"][data-result="correct"]')
    .waitFor({ timeout: 45_000 });
  await assertSafePage(page, fixtures, fakeProvider);

  setHarnessPhase(fixtures, "browser_assignment_practice_attempt_persistence");
  const persistedRounds = assertNoError(
    await fixtures.service
      .from("practice_rounds")
      .select("id")
      .eq("session_id", assignmentStartResult.sessionId)
      .eq("user_id", fixtures.studentA.id),
    "assignment_practice_round_read_failed",
  ) ?? [];
  assert(persistedRounds.length >= 1, "assignment_practice_round_not_persisted");
  const persistedAttempts = assertNoError(
    await fixtures.service
      .from("practice_attempts")
      .select("id")
      .eq("user_id", fixtures.studentA.id)
      .in("round_id", persistedRounds.map((round) => round.id)),
    "assignment_practice_attempt_read_failed",
  ) ?? [];
  assert(persistedAttempts.length >= 1, "assignment_practice_attempt_not_persisted");

  setHarnessPhase(fixtures, "browser_assignment_practice_assignment_progress");
  const progressResult = await fixtures.service
    .from("student_assignment_progress")
    .select("status, last_practice_session_id")
    .eq("assignment_id", fixtures.assignmentId)
    .eq("student_id", fixtures.studentA.id)
    .maybeSingle();

  setHarnessPhase(fixtures, "browser_assignment_practice_persisted_completion_state");
  assert(!progressResult.error, "practice_persisted_completion_state_failed");
  const progress = progressResult.data;
  assert(
    progress?.status === "completed" && progress.last_practice_session_id,
    "practice_persisted_completion_state_failed",
  );
  fixtures.assignmentSessionId = progress.last_practice_session_id;

  setHarnessPhase(fixtures, "browser_assignment_practice_my_work_navigation");
  await waitForPracticeStep(
    page.goto(`${fixtures.server.origin}/student/work`, { waitUntil: "networkidle" }),
    "practice_my_work_navigation_failed",
  );

  setHarnessPhase(fixtures, "browser_assignment_practice_my_work_completed_section");
  const completedHeading = page.getByRole("heading", {
    exact: true,
    level: 2,
    name: "Completed",
  });
  const completedSection = page.locator("section").filter({ has: completedHeading });
  await waitForPracticeStep(
    completedHeading.waitFor({ timeout: 30_000 }),
    "practice_my_work_completed_section_not_found",
  );
  assert(
    await completedSection.count() === 1,
    "practice_my_work_completed_section_not_found",
  );

  setHarnessPhase(fixtures, "browser_assignment_practice_my_work_completed_assignment");
  await waitForPracticeStep(
    completedSection
      .getByRole("heading", { exact: true, level: 3, name: fixtures.assignmentTitle })
      .waitFor({ timeout: 30_000 }),
    "practice_my_work_completed_assignment_not_found",
  );
  await waitForPracticeStep(
    completedSection
      .getByRole("link", { exact: true, name: "Review work" })
      .waitFor({ timeout: 30_000 }),
    "practice_my_work_completed_assignment_not_found",
  );
  await waitForPracticeStep(
    assertSafePage(page, fixtures, fakeProvider),
    "practice_page_context_error",
  );
}

async function createAndResumePrivateSelfStudy(page, fixtures, fakeProvider) {
  await page.goto(`${fixtures.server.origin}/practice`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New practice session" }).click();
  await page.getByText("Practice session").waitFor({ timeout: 30_000 });
  await assertSafePage(page, fixtures, fakeProvider);

  const sessionsResult = await browserFetch(page, "/api/practice/sessions");
  assert(sessionsResult.status === 200, "private_self_study_session_list_failed");
  assertSafeBrowserText(sessionsResult.text, fixtures, fakeProvider);
  const sessionsPayload = JSON.parse(sessionsResult.text);
  const selfStudy = (sessionsPayload.sessions ?? []).find(
    (session) => session.id !== fixtures.assignmentSessionId && session.title === "New practice session",
  );
  assert(selfStudy?.id, "private_self_study_session_not_created");
  fixtures.selfStudySessionId = selfStudy.id;

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Practice session").waitFor({ timeout: 30_000 });
  await assertSafePage(page, fixtures, fakeProvider);
}

async function assertAssetAccessThroughBrowser(page, fixtures, fakeProvider) {
  const selectedPromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/question-assets/${fixtures.selectedAssetId}`,
  );
  await page.goto(`${fixtures.server.origin}/api/question-assets/${fixtures.selectedAssetId}`);
  const selectedResponse = await selectedPromise;
  assert(selectedResponse.status() === 302, "selected_assignment_asset_not_authorized");

  const unselectedPromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/question-assets/${fixtures.unselectedAssetId}`,
  );
  await page.goto(`${fixtures.server.origin}/api/question-assets/${fixtures.unselectedAssetId}`);
  const unselectedResponse = await unselectedPromise;
  assert(unselectedResponse.status() === 404, "unselected_private_bank_asset_not_denied");
  await assertSafePage(page, fixtures, fakeProvider);
}

async function assertBrowserIsolation(studentBPage, fixtures, fakeProvider) {
  await joinClassroomThroughBrowser(studentBPage, fixtures, fakeProvider);
  const privateSession = await browserFetch(
    studentBPage,
    `/api/practice/sessions/${fixtures.selfStudySessionId}`,
  );
  assert(privateSession.status === 404, "same_class_student_private_evidence_exposed");
  assertSafeBrowserText(privateSession.text, fixtures, fakeProvider);

  const bankRoute = await browserFetch(studentBPage, `/teacher/banks/${fixtures.bankId}`, {
    redirect: "manual",
  });
  assert(bankRoute.status !== 200, "source_bank_route_exposed_to_student");
  assertSafeBrowserText(bankRoute.text, fixtures, fakeProvider);

  const reviewRoute = await browserFetch(studentBPage, `/teacher/banks/${fixtures.bankId}/review`, {
    redirect: "manual",
  });
  assert(reviewRoute.status !== 200, "review_draft_route_exposed_to_student");
  assertSafeBrowserText(reviewRoute.text, fixtures, fakeProvider);

  const blueprintRoute = await browserFetch(studentBPage, "/teacher/blueprints", { redirect: "manual" });
  assert(blueprintRoute.status !== 200, "blueprint_route_exposed_to_student");
  assertSafeBrowserText(blueprintRoute.text, fixtures, fakeProvider);
}

async function assertLogoutAndUnauthenticatedDenial(page, fixtures, fakeProvider) {
  await page.goto(`${fixtures.server.origin}/student/work`, { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL(/\/auth\/login/),
    page.getByRole("button", { name: "Sign out" }).click(),
  ]);
  await assertSafePage(page, fixtures, fakeProvider);

  await page.goto(`${fixtures.server.origin}/student/work`, { waitUntil: "networkidle" });
  assert(/\/auth\/login/.test(page.url()), "protected_student_page_not_redirected_after_logout");
  const api = await browserFetch(page, "/api/practice/sessions");
  assert(api.status === 401, "practice_api_not_denied_after_logout");
  assertSafeBrowserText(api.text, fixtures, fakeProvider);
}

async function deleteExact(service, table, column, values, category) {
  if (!values?.length) return;
  assertNoError(await service.from(table).delete().in(column, values), category);
}

async function verifyAbsent(service, table, column, values, category) {
  if (!values?.length) return;
  const result = await service.from(table).select("id", { count: "exact", head: true }).in(column, values);
  assertNoError(result, category);
  assert((result.count ?? 0) === 0, category);
}

async function collectFixtureSessionIds(fixtures) {
  if (!fixtures.userIds.length) return;
  const rows = assertNoError(
    await fixtures.service.from("practice_sessions").select("id").in("user_id", fixtures.userIds),
    "fixture_session_collection_failed",
  ) ?? [];
  fixtures.practiceSessionIds = Array.from(new Set([...fixtures.practiceSessionIds, ...rows.map((row) => row.id)]));
}

async function cleanupFixtures(fixtures) {
  const failures = [];
  async function clean(category, action) {
    try {
      await action();
    } catch {
      failures.push(category);
    }
  }
  await clean("collect_sessions", () => collectFixtureSessionIds(fixtures));
  const service = fixtures.service;
  await clean("teacher_feedback_notes", () => deleteExact(service, "teacher_feedback_notes", "id", fixtures.feedbackIds, "cleanup_feedback_failed"));
  await clean("practice_preference_merge_jobs", () => deleteExact(service, "practice_preference_merge_jobs", "user_id", [fixtures.studentA?.id].filter(Boolean), "cleanup_preference_jobs_failed"));
  await clean("practice_hint_events", () => deleteExact(service, "practice_hint_events", "session_id", fixtures.practiceSessionIds, "cleanup_hint_events_failed"));
  await clean("practice_reflection_records", () => deleteExact(service, "practice_reflection_records", "session_id", fixtures.practiceSessionIds, "cleanup_reflections_failed"));
  await clean("practice_weakness_links", () => deleteExact(service, "practice_weakness_links", "session_id", fixtures.practiceSessionIds, "cleanup_weakness_failed"));
  await clean("practice_wrong_questions", () => deleteExact(service, "practice_wrong_questions", "user_id", [fixtures.studentA?.id].filter(Boolean), "cleanup_wrong_questions_failed"));
  await clean("practice_attempts", () => deleteExact(service, "practice_attempts", "session_id", fixtures.practiceSessionIds, "cleanup_attempts_failed"));
  await clean("practice_round_questions", () => deleteExact(service, "practice_round_questions", "session_id", fixtures.practiceSessionIds, "cleanup_round_questions_failed"));
  await clean("practice_agent_episodes", () => deleteExact(service, "practice_agent_episodes", "session_id", fixtures.practiceSessionIds, "cleanup_episodes_failed"));
  await clean("practice_rounds", () => deleteExact(service, "practice_rounds", "session_id", fixtures.practiceSessionIds, "cleanup_rounds_failed"));
  await clean("assignment_practice_sessions", () => deleteExact(service, "assignment_practice_sessions", "assignment_id", fixtures.assignmentIds, "cleanup_assignment_sessions_failed"));
  await clean("student_assignment_progress", () => deleteExact(service, "student_assignment_progress", "assignment_id", fixtures.assignmentIds, "cleanup_assignment_progress_failed"));
  await clean("practice_sessions", () => deleteExact(service, "practice_sessions", "id", fixtures.practiceSessionIds, "cleanup_practice_sessions_failed"));
  await clean("user_practice_preferences", () => deleteExact(service, "user_practice_preferences", "user_id", [fixtures.studentA?.id].filter(Boolean), "cleanup_preferences_failed"));
  await clean("assignment_items", () => deleteExact(service, "assignment_items", "assignment_id", fixtures.assignmentIds, "cleanup_assignment_items_failed"));
  await clean("assignments", () => deleteExact(service, "assignments", "id", fixtures.assignmentIds, "cleanup_assignments_failed"));
  await clean("storage_objects", async () => {
    if (!fixtures.assetPaths.length) return;
    const result = await service.storage.from("question-assets").remove(fixtures.assetPaths);
    assert(!result.error, "cleanup_storage_objects_failed");
  });
  await clean("question_assets", () => deleteExact(service, "question_assets", "id", fixtures.assetIds, "cleanup_assets_failed"));
  await clean("bank_questions", () => deleteExact(service, "bank_questions", "id", fixtures.bankQuestionIds, "cleanup_bank_questions_failed"));
  await clean("questions", () => deleteExact(service, "questions", "id", fixtures.questionIds, "cleanup_questions_failed"));
  await clean("bank_members", () => deleteExact(service, "bank_members", "bank_id", [fixtures.bankId].filter(Boolean), "cleanup_bank_members_failed"));
  await clean("question_banks", () => deleteExact(service, "question_banks", "id", [fixtures.bankId].filter(Boolean), "cleanup_bank_failed"));
  await clean("classroom_join_codes", () => deleteExact(service, "classroom_join_codes", "classroom_id", fixtures.classroomIds, "cleanup_join_codes_failed"));
  await clean("classroom_members", () => deleteExact(service, "classroom_members", "classroom_id", fixtures.classroomIds, "cleanup_classroom_members_failed"));
  await clean("classrooms", () => deleteExact(service, "classrooms", "id", fixtures.classroomIds, "cleanup_classrooms_failed"));
  await clean("ai_provider_profiles", () => deleteExact(service, "ai_provider_profiles", "id", fixtures.providerProfileIds, "cleanup_provider_profiles_failed"));
  await clean("organization_members", () => deleteExact(service, "organization_members", "id", fixtures.organizationMemberIds, "cleanup_organization_members_failed"));
  await clean("profiles", () => deleteExact(service, "profiles", "id", fixtures.userIds, "cleanup_profiles_failed"));
  await clean("organizations", () => deleteExact(service, "organizations", "id", [fixtures.organizationId].filter(Boolean), "cleanup_organization_failed"));
  await clean("auth_users", async () => {
    for (const userId of fixtures.userIds) {
      const result = await service.auth.admin.deleteUser(userId);
      assert(!result.error, "cleanup_auth_user_failed");
    }
  });
  await clean("verification", async () => {
    await verifyAbsent(service, "practice_sessions", "id", fixtures.practiceSessionIds, "cleanup_practice_verification_failed");
    await verifyAbsent(service, "assignments", "id", fixtures.assignmentIds, "cleanup_assignment_verification_failed");
    await verifyAbsent(service, "question_assets", "id", fixtures.assetIds, "cleanup_asset_verification_failed");
    await verifyAbsent(service, "questions", "id", fixtures.questionIds, "cleanup_question_verification_failed");
    await verifyAbsent(service, "question_banks", "id", [fixtures.bankId].filter(Boolean), "cleanup_bank_verification_failed");
    await verifyAbsent(service, "classrooms", "id", fixtures.classroomIds, "cleanup_classroom_verification_failed");
    await verifyAbsent(service, "profiles", "id", fixtures.userIds, "cleanup_profile_verification_failed");
  });
  return { failureCount: failures.length, ok: failures.length === 0 };
}

async function validateBrowserJourneys(fixtures, fakeProvider) {
  fixtures.phase = "browser_launch";
  console.log("PHASE=browser_launch");
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  try {
    fixtures.phase = "browser_student_a_sign_in";
    console.log("PHASE=browser_student_a_sign_in");
    const studentAContext = await browser.newContext();
    const studentAPage = await studentAContext.newPage();
    installSanitizedBrowserDiagnostics(studentAPage, fixtures.diagnostics, fixtures.server.origin);
    await signInThroughBrowser(studentAPage, fixtures.server.origin, fixtures.studentA);
    await assertStudentWorkspaceOnly(studentAPage, fixtures, fakeProvider);

    fixtures.phase = "browser_classroom_join";
    console.log("PHASE=browser_classroom_join");
    await joinClassroomThroughBrowser(studentAPage, fixtures, fakeProvider);
    console.log("PASS browser_student_joins_disposable_classroom");

    await publishFixtureAssignmentsAfterStudentJoin(fixtures);
    await assertStudentAssignmentEntitlement(fixtures);

    fixtures.phase = "browser_my_work_and_detail";
    console.log("PHASE=browser_my_work_and_detail");
    await assertMyWorkAndDetail(studentAPage, fixtures, fakeProvider);
    console.log("PASS browser_student_my_work_and_assignment_detail_are_entitled_and_scoped");

    fixtures.phase = "browser_assignment_practice";
    console.log("PHASE=browser_assignment_practice");
    await startResumeAndCompleteAssignment(studentAPage, fixtures, fakeProvider);
    console.log("PASS browser_assignment_practice_start_resume_completion_and_progress_persist");

    fixtures.phase = "browser_private_self_study";
    console.log("PHASE=browser_private_self_study");
    await createAndResumePrivateSelfStudy(studentAPage, fixtures, fakeProvider);
    console.log("PASS browser_private_self_study_create_and_resume");

    fixtures.phase = "browser_question_assets";
    console.log("PHASE=browser_question_assets");
    await assertAssetAccessThroughBrowser(studentAPage, fixtures, fakeProvider);
    console.log("PASS browser_selected_asset_allowed_and_unselected_private_asset_denied");

    fixtures.phase = "browser_same_class_isolation";
    console.log("PHASE=browser_same_class_isolation");
    const studentBContext = await browser.newContext();
    const studentBPage = await studentBContext.newPage();
    installSanitizedBrowserDiagnostics(studentBPage, fixtures.diagnostics, fixtures.server.origin);
    await signInThroughBrowser(studentBPage, fixtures.server.origin, fixtures.studentB);
    await assertBrowserIsolation(studentBPage, fixtures, fakeProvider);
    await studentBContext.close();
    console.log("PASS browser_same_class_student_evidence_and_source_content_isolation");

    fixtures.phase = "browser_logout";
    console.log("PHASE=browser_logout");
    await assertLogoutAndUnauthenticatedDenial(studentAPage, fixtures, fakeProvider);
    await studentAContext.close();
    console.log("PASS browser_logout_protected_redirect_and_practice_api_denial");

    fakeProvider.assertCredentialSelection();
    console.log("PASS browser_teacher_admin_controls_hidden_and_error_copy_safe");
  } finally {
    await browser.close();
  }
}

function allowedOr(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function firstCategory(values) {
  return values[0] ?? "NONE";
}

function printSanitizedFailureSummary(diagnostics, failureCategory) {
  console.error("FAIL Student V1 browser E2E");
  console.error(`failure_category=${allowedOr(failureCategory, ALLOWED_FAILURE_CATEGORIES, "HARNESS_FAILURE")}`);
  console.error(`navigation_status=${allowedOr(diagnostics.navigationStatus, NAVIGATION_STATUSES, "NO_DOCUMENT_RESPONSE")}`);
  console.error(`final_route=${allowedOr(diagnostics.finalRoute, FINAL_ROUTE_CATEGORIES, "UNEXPECTED_ROUTE")}`);
  console.error(
    `assignment_start_http_status=${
      Number.isInteger(diagnostics.assignmentStartHttpStatus) &&
      diagnostics.assignmentStartHttpStatus >= 0 &&
      diagnostics.assignmentStartHttpStatus <= 599
        ? diagnostics.assignmentStartHttpStatus
        : 0
    }`,
  );
  console.error(
    `assignment_start_code=${allowedOr(
      diagnostics.assignmentStartCode,
      ASSIGNMENT_START_API_CODES,
      "UNRECOGNIZED_API_CODE",
    )}`,
  );
  console.error(
    `reload_session_consistency=${allowedOr(
      diagnostics.reloadSessionConsistency,
      RELOAD_SESSION_CONSISTENCY,
      "NOT_OBSERVED",
    )}`,
  );
  console.error(
    `review_category=${allowedOr(
      diagnostics.reviewCategory,
      REVIEW_CATEGORIES,
      "REVIEW_NOT_OBSERVED",
    )}`,
  );
  console.error(
    `review_http_status=${
      Number.isInteger(diagnostics.reviewHttpStatus) && diagnostics.reviewHttpStatus >= 0 && diagnostics.reviewHttpStatus <= 599
        ? diagnostics.reviewHttpStatus
        : 0
    }`,
  );
  console.error(
    `grade_category=${allowedOr(
      diagnostics.gradeCategory,
      GRADE_CATEGORIES,
      "GRADE_NOT_OBSERVED",
    )}`,
  );
  console.error(
    `grade_http_status=${
      Number.isInteger(diagnostics.gradeHttpStatus) && diagnostics.gradeHttpStatus >= 0 && diagnostics.gradeHttpStatus <= 599
        ? diagnostics.gradeHttpStatus
        : 0
    }`,
  );
  console.error(`pageerror_category=${firstCategory(diagnostics.pageErrorCategories)}`);
  console.error(`failed_request_category=${firstCategory(diagnostics.failedRequestCategories)}`);
  console.error(`server_runtime_category=${primaryServerRuntimeCategory(diagnostics.server)}`);
  console.error(`pageerror_count=${Math.min(diagnostics.pageErrorCategories.length, MAX_DIAGNOSTIC_CATEGORIES)}`);
  console.error(`failed_request_count=${Math.min(diagnostics.failedRequestCategories.length, MAX_DIAGNOSTIC_CATEGORIES)}`);
  console.error(`console_error_count=${Math.min(diagnostics.consoleErrorCount, 999)}`);
  console.error(`server_healthy=${diagnostics.server.healthy ? "YES" : "NO"}`);
  console.error(`server_exit_code=${diagnostics.server.exitCodeCategory}`);
  console.error(`temporary_servers_stopped=${diagnostics.temporaryServersStopped ? "YES" : "NO"}`);
  console.error(`process_environment_cleared=${diagnostics.processEnvironmentCleared ? "YES" : "NO"}`);
  console.error(`cleanup=${diagnostics.cleanup}`);
}

async function main() {
  const diagnostics = createSanitizedDiagnostics();
  let config = null;
  let service = null;
  let fixtures = null;
  let fakeProvider = null;
  let server = null;
  let failure = null;
  let failurePhase = "initialization";
  let cleanupResult = { failureCount: 0, ok: true };
  try {
    config = requireApprovedProcessEnvironment();
    service = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    fixtures = {
      assignmentId: null,
      assignmentIds: [],
      assignmentSessionId: null,
      assignmentTitle: "",
      assetIds: [],
      assetPaths: [],
      bankId: null,
      bankQuestionIds: [],
      classroomDisplayCode: "",
      classroomId: null,
      classroomIds: [],
      diagnostics,
      feedbackIds: [],
      hiddenAssignmentId: null,
      hiddenAssignmentTitle: "",
      hiddenClassroomId: null,
      organizationId: null,
      organizationMemberIds: [],
      projectRef: config.projectRef,
      providerProfileIds: [],
      practiceSessionIds: [],
      questionIds: [],
      runId: opaqueRunId(),
      selectedAssetId: null,
      selectedBankQuestionId: null,
      selectedQuestionId: null,
      selectedQuestionTitle: "",
      selfStudySessionId: null,
      server: null,
      service,
      studentA: null,
      studentB: null,
      teacher: null,
      unselectedAssetId: null,
      unselectedQuestionId: null,
      unselectedQuestionTitle: "",
      userIds: [],
    };
    setHarnessPhase(fixtures, "fixture_stale_preflight");
    await assertNoStaleStudentBrowserFixtures(service);
    fixtures.phase = "fixture_organization";
    console.log("PHASE=fixture_organization");
    await createFixtureOrganization(service, fixtures);
    fixtures.phase = "fixture_users";
    console.log("PHASE=fixture_users");
    fixtures.teacher = await createFixtureUser({ ...config, fixtures, label: "teacher", organizationId: fixtures.organizationId, role: "teacher", service });
    fixtures.studentA = await createFixtureUser({ ...config, fixtures, label: "student-a", organizationId: fixtures.organizationId, role: "student", service });
    fixtures.studentB = await createFixtureUser({ ...config, fixtures, label: "student-b", organizationId: fixtures.organizationId, role: "student", service });
    fixtures.phase = "fixture_classrooms";
    console.log("PHASE=fixture_classrooms");
    const classroom = await createFixtureClassroom(fixtures, "assigned");
    fixtures.classroomId = classroom.classroom_id;
    fixtures.classroomDisplayCode = classroom.display_code;
    const hiddenClassroom = await createFixtureClassroom(fixtures, "unentitled");
    fixtures.hiddenClassroomId = hiddenClassroom.classroom_id;
    fixtures.phase = "fixture_bank_assignment_assets";
    console.log("PHASE=fixture_bank_assignment_assets");
    await createFixtureBank(fixtures);
    const selected = await insertQuestion(fixtures, "selected");
    const unselected = await insertQuestion(fixtures, "unselected");
    fixtures.selectedQuestionId = selected.id;
    fixtures.selectedQuestionTitle = selected.title;
    fixtures.unselectedQuestionId = unselected.id;
    fixtures.unselectedQuestionTitle = unselected.title;
    fixtures.selectedAssetId = await createQuestionAsset(fixtures, selected.id);
    fixtures.unselectedAssetId = await createQuestionAsset(fixtures, unselected.id);
    fixtures.selectedBankQuestionId = await createBankQuestion(fixtures, selected.id);
    await createBankQuestion(fixtures, unselected.id);
    fixtures.phase = "fixture_provider";
    console.log("PHASE=fixture_provider");
    await ensureNoExistingCompatibleDefault(fixtures);
    fakeProvider = await startLocalFakeProvider();
    await createFixtureProvider({ fakeProvider, fixtures, encryptionKey: config.encryptionKey });
    fixtures.phase = "local_next_server";
    console.log("PHASE=local_next_server");
    server = await startNextServer(config, diagnostics);
    fixtures.server = server;
    await validateBrowserJourneys(fixtures, fakeProvider);
  } catch (error) {
    failure = error;
    failurePhase = fixtures?.phase ?? "initialization";
  } finally {
    let serversStopped = true;
    if (server) {
      try {
        await server.close();
      } catch {
        serversStopped = false;
      }
    }
    if (fakeProvider) {
      try {
        await fakeProvider.close();
      } catch {
        serversStopped = false;
      }
    }
    diagnostics.temporaryServersStopped = serversStopped;
    if (!serversStopped && !failure) {
      failure = new HarnessError("temporary_server_stop_failed");
      failurePhase = "fixture_cleanup";
    }

    if (fixtures) fixtures.phase = "fixture_cleanup";
    console.log("PHASE=fixture_cleanup");
    try {
      cleanupResult = fixtures ? await cleanupFixtures(fixtures) : { failureCount: 0, ok: true };
    } catch {
      cleanupResult = { failureCount: 1, ok: false };
    }
    diagnostics.cleanup = cleanupResult.ok ? "PASS" : "FAIL";
    console.log(cleanupResult.ok ? "CLEANUP_PASS" : "CLEANUP_FAIL");
    if (!cleanupResult.ok && !failure) {
      failure = new HarnessError("cleanup_failed");
      failurePhase = "fixture_cleanup";
    }

    clearProcessEnvironment();
    diagnostics.processEnvironmentCleared = REQUIRED_ENVIRONMENT.every((name) => !process.env[name]);
    console.log(`PROCESS_ENVIRONMENT_CLEARED=${diagnostics.processEnvironmentCleared ? "YES" : "NO"}`);
    if (!diagnostics.processEnvironmentCleared && !failure) {
      failure = new HarnessError("process_environment_clear_failed");
      failurePhase = "fixture_cleanup";
    }
  }
  if (failure) {
    printSanitizedFailureSummary(diagnostics, boundedFailureCategory(failure, failurePhase));
    process.exitCode = 1;
    return;
  }
  console.log("PASS Student V1 browser E2E completed with exact cleanup");
}

async function runHarnessCli() {
  const mode = parseHarnessMode(process.argv.slice(2));
  if (mode === "INVALID_ARGUMENTS") {
    console.error("STUDENT_BROWSER_E2E_ARGUMENT_ERROR");
    clearProcessEnvironment();
    process.exitCode = 1;
    return;
  }
  if (mode === "PREFLIGHT_ONLY") {
    await runPreflightOnly();
    return;
  }
  await main();
}

try {
  await runHarnessCli();
} catch {
  const diagnostics = createSanitizedDiagnostics();
  clearProcessEnvironment();
  diagnostics.processEnvironmentCleared = true;
  printSanitizedFailureSummary(diagnostics, "HARNESS_FAILURE");
  process.exitCode = 1;
}
