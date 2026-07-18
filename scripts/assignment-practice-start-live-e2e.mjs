#!/usr/bin/env node

// Narrow disposable validation for the authenticated Assignment Practice start
// transaction. It never loads environment files or invokes an AI Provider.

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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

const DISPOSABLE_CONFIRMATION = "DISPOSABLE_ASSIGNMENT_START_LIVE";
const CLEANUP_CONFIRMATION = "DELETE_ASSIGNMENT_START_LIVE_FIXTURES";
const FIXTURE_KIND = "assignment_practice_start_live_e2e";
const FIXTURE_PREFIX = "assignment-start-live-";
const FIXTURE_SOURCE = "assignment_start_live_e2e";
const REQUIRED_ENVIRONMENT = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "ASSIGNMENT_START_LIVE_ENVIRONMENT",
  "ASSIGNMENT_START_LIVE_EXPECTED_PROJECT_REF",
  "ASSIGNMENT_START_LIVE_CONFIRM_CLEANUP",
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
  "PRACTICE_EPISODES",
  "ASSIGNMENT_PRACTICE_LINKS",
  "ASSIGNMENT_PROGRESS",
]);
const ALLOWED_FAILURE_CATEGORIES = new Set([
  "MISSING_PROCESS_ENVIRONMENT",
  "PRODUCTION_ENVIRONMENT_REFUSED",
  "DISPOSABLE_ENVIRONMENT_ACKNOWLEDGEMENT_REQUIRED",
  "CLEANUP_ACKNOWLEDGEMENT_REQUIRED",
  "EXPECTED_PROJECT_IDENTITY_MISMATCH",
  "LOCAL_EDGE_BROWSER_MISSING",
  "STALE_FIXTURE_PREFLIGHT_FAILED",
  "STALE_FIXTURES_BLOCKED",
  "FIXTURE_SETUP_FAILED",
  "FIXTURE_CONTRACT_FAILED",
  "LOCAL_SERVER_START_FAILED",
  "AUTHENTICATED_STUDENT_SESSION_FAILED",
  "ASSIGNMENT_START_REQUEST_FAILED",
  "ASSIGNMENT_START_NON_2XX",
  "POSTCONDITION_FAILED",
  "CLEANUP_FAILED",
  "TEMPORARY_SERVER_STOP_FAILED",
  "UNEXPECTED_FAILURE",
]);

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
  if (process.env.ASSIGNMENT_START_LIVE_ENVIRONMENT !== DISPOSABLE_CONFIRMATION) {
    fail("DISPOSABLE_ENVIRONMENT_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (process.env.ASSIGNMENT_START_LIVE_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    fail("CLEANUP_ACKNOWLEDGEMENT_REQUIRED");
  }
  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (
    !projectRef ||
    projectRef !== process.env.ASSIGNMENT_START_LIVE_EXPECTED_PROJECT_REF.trim().toLowerCase()
  ) {
    fail("EXPECTED_PROJECT_IDENTITY_MISMATCH");
  }
  if (requireBrowser && !edgePath) fail("LOCAL_EDGE_BROWSER_MISSING");

  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
  const episodes = await selectByIds(service, "practice_agent_episodes", "session_id", sessionIds);
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
    AUTH_USERS: authUsers.length,
    BANKS: banks.length,
    BANK_MEMBERSHIPS: bankMemberships.length,
    BANK_QUESTIONS: bankQuestions.length,
    CLASSROOMS: classrooms.length,
    CLASSROOM_MEMBERSHIPS: classroomMemberships.length,
    ORGANIZATIONS: organizations.length,
    ORGANIZATION_MEMBERSHIPS: organizationMemberships.length,
    PRACTICE_EPISODES: episodes.length,
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
    console.log("STALE_ASSIGNMENT_START_PREFLIGHT_PASS");
    console.log("residue_total=0");
    return;
  }
  console.log("STALE_ASSIGNMENT_START_PREFLIGHT_BLOCKED");
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
    questionIds: [],
    roundIds: [],
    service,
    sessionIds: [],
    student: null,
    userIds: [],
  };
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
  fixtures.student = student;

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
        title: `Assignment Start ${runId}`,
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

  return { assignmentId: assignment.id, studentId: student.id };
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

async function startLocalNextServer(config) {
  const port = await findFreePort();
  assert(Number.isInteger(port) && port > 0, "LOCAL_SERVER_START_FAILED");
  const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const environment = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NODE_ENV: "development",
    PRACTICE_AGENT_FULL_CALL_LOGS: "false",
    PRACTICE_AGENT_TOKEN_STATS_LOGS: "false",
    VERCEL: "",
    VERCEL_ENV: "",
  };
  for (const name of [
    "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AI_PROVIDER_ENCRYPTION_KEY",
    "AI_PROVIDER_GATEWAY_TOKEN",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
    "ASSIGNMENT_START_LIVE_ENVIRONMENT",
    "ASSIGNMENT_START_LIVE_EXPECTED_PROJECT_REF",
    "ASSIGNMENT_START_LIVE_CONFIRM_CLEANUP",
  ]) {
    delete environment[name];
  }

  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(port)], {
    cwd: root,
    env: environment,
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
          close: async () => {
            if (child.exitCode !== null) return true;
            child.kill();
            await Promise.race([
              new Promise((resolveExit) => child.once("exit", () => resolveExit(true))),
              new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 10_000)),
            ]);
            return child.exitCode !== null;
          },
          origin,
        };
      }
    } catch {
      // Bounded readiness retry; server output is intentionally discarded.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  child.kill();
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 10_000)),
    ]);
  }
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

async function invokeAuthenticatedAssignmentStart(page, assignmentId) {
  return page.evaluate(
    async ({ allowedCodes, targetAssignmentId }) => {
      try {
        const response = await fetch("/api/practice/assignments/start", {
          body: JSON.stringify({ assignmentId: targetAssignmentId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        let code = "NONE";
        if (!response.ok) {
          try {
            const payload = await response.json();
            const candidate = typeof payload?.code === "string" ? payload.code : "NONE";
            code = allowedCodes.includes(candidate) ? candidate : "NONE";
          } catch {
            code = "NONE";
          }
        }
        return { code, status: response.status };
      } catch {
        return { code: "NONE", status: 0 };
      }
    },
    { allowedCodes: [...ASSIGNMENT_START_CODES], targetAssignmentId: assignmentId },
  );
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

function preferenceStateFromCode(code, fallback) {
  if (code === "PREFERENCE_READ_FAILED") return "READ_FAILED";
  if (code === "PREFERENCE_CREATE_FAILED") return "CREATE_FAILED";
  return fallback;
}

async function runPreflightOnly() {
  let cleared = false;
  try {
    const config = requireApprovedEnvironment({ requireBrowser: false });
    const report = await readStaleFixtureCounts(serviceClient(config));
    printPreflight(report);
    if (report.residueTotal > 0) process.exitCode = 1;
  } catch (error) {
    console.log("STALE_ASSIGNMENT_START_PREFLIGHT_BLOCKED");
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
  let fixtures = null;
  let server = null;
  let failureCategory = "NONE";
  let httpStatus = 0;
  let responseCode = "NONE";
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

    phase(fixtures, "LOCAL_NEXT_SERVER");
    server = await startLocalNextServer(config);
    temporaryServerStopped = false;
    phase(fixtures, "AUTHENTICATED_STUDENT_SESSION");
    browser = await chromium.launch({ executablePath: edgePath, headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    await signInThroughBrowser(page, server.origin, fixtures.student);

    phase(fixtures, "AUTHENTICATED_ASSIGNMENT_START_POST");
    const result = await invokeAuthenticatedAssignmentStart(page, contract.assignmentId);
    httpStatus = Number.isInteger(result.status) ? result.status : 0;
    responseCode = ASSIGNMENT_START_CODES.has(result.code) ? result.code : "NONE";
    fixtures.preferenceState = preferenceStateFromCode(responseCode, fixtures.preferenceState);
    assert(httpStatus > 0, "ASSIGNMENT_START_REQUEST_FAILED");
    assert(httpStatus === 200, "ASSIGNMENT_START_NON_2XX");

    phase(fixtures, "PERSISTENCE_POSTCONDITIONS");
    await verifyPostconditions(fixtures, contract);
    succeeded = true;
  } catch (error) {
    failureCategory = boundedFailureCategory(error);
    if (fixtures) fixtures.preferenceState = await inspectPreferenceState(fixtures);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) {
      temporaryServerStopped = await server.close().catch(() => false);
    }
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
    console.log("PASS authenticated_assignment_start_live_validation");
    console.log("assignment_start_http_status=200");
    console.log("preference=PASS");
    console.log("session=PASS");
    console.log("round=PASS");
    console.log("round_questions=PASS");
    console.log("episode=PASS_OR_NOT_REQUIRED");
    console.log("assignment_link=PASS");
    console.log("assignment_progress=PASS");
    console.log("session_reload=PASS");
    console.log("cleanup=PASS");
    console.log("temporary_server_stopped=YES");
    console.log("process_environment_cleared=YES");
    return;
  }

  console.log("FAIL authenticated_assignment_start_live_validation");
  console.log(`failure_category=${failureCategory}`);
  console.log(`assignment_start_http_status=${httpStatus || "NOT_OBSERVED"}`);
  console.log(`assignment_start_code=${responseCode}`);
  console.log(`preference_state=${fixtures?.preferenceState ?? "NOT_REACHED"}`);
  console.log(`cleanup=${cleanupPassed ? "PASS" : "FAIL"}`);
  console.log(`temporary_server_stopped=${temporaryServerStopped ? "YES" : "NO"}`);
  console.log(`process_environment_cleared=${processEnvironmentCleared ? "YES" : "NO"}`);
  process.exitCode = 1;
}

const args = process.argv.slice(2);
const preflightOnly = args.length === 1 && args[0] === "--preflight-only";
if (args.length && !preflightOnly) {
  console.log("FAIL authenticated_assignment_start_live_validation");
  console.log("failure_category=UNEXPECTED_FAILURE");
  process.exitCode = 1;
  clearProcessEnvironment();
} else if (preflightOnly) {
  // PREFLIGHT_EXIT_BEFORE_MUTATION_SERVER_BROWSER_API
  await runPreflightOnly();
} else {
  await runFullValidation();
}
