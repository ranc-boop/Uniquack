#!/usr/bin/env node

// Disposable, process-only E2E for the normal Student Practice provider path.
// It never reads an env file, uses a local fake provider, and deletes only IDs
// captured during this invocation.

import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DISPOSABLE_CONFIRMATION = "DISPOSABLE_STUDENT_PRACTICE_E2E";
const CLEANUP_CONFIRMATION = "DELETE_STUDENT_PRACTICE_E2E_FIXTURES";
const LOCAL_FAKE_PROVIDER_MODE = "LOCAL_FAKE_HTTP_PROVIDER";
const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "STUDENT_PRACTICE_E2E_ENVIRONMENT",
  "STUDENT_PRACTICE_E2E_EXPECTED_PROJECT_REF",
  "STUDENT_PRACTICE_E2E_CONFIRM_CLEANUP",
  "STUDENT_PRACTICE_E2E_PROVIDER_MODE",
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

function safeErrorCategory(error) {
  const value = String(error?.code ?? error?.status ?? "request_failed");
  return /^[A-Za-z0-9_:-]{1,80}$/.test(value) ? value : "request_failed";
}

function assertNoError(result, category) {
  if (result?.error) {
    throw new HarnessError(`${category}:${safeErrorCategory(result.error)}`);
  }
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
  if (process.env.STUDENT_PRACTICE_E2E_ENVIRONMENT !== DISPOSABLE_CONFIRMATION) {
    throw new HarnessError("disposable_environment_acknowledgement_required");
  }
  if (process.env.STUDENT_PRACTICE_E2E_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    throw new HarnessError("destructive_fixture_acknowledgement_required");
  }
  if (process.env.STUDENT_PRACTICE_E2E_PROVIDER_MODE !== LOCAL_FAKE_PROVIDER_MODE) {
    throw new HarnessError("local_fake_provider_mode_required");
  }

  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (
    !projectRef ||
    projectRef !== process.env.STUDENT_PRACTICE_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase()
  ) {
    throw new HarnessError("expected_project_identity_mismatch");
  }

  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    encryptionKey: process.env.AI_PROVIDER_ENCRYPTION_KEY,
    projectRef,
    serviceRoleKey: process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

function opaqueRunId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function createSessionClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function randomPassword() {
  return `PracticeE2E!${randomBytes(24).toString("base64url")}`;
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

async function createFixtureOrganization(service, fixtures) {
  const result = await service
    .from("organizations")
    .insert({
      name: `Student Practice E2E ${fixtures.runId}`,
      slug: `student-practice-e2e-${fixtures.runId}`,
      status: "active",
    })
    .select("id")
    .single();
  const row = assertNoError(result, "fixture_organization_create_failed");
  assert(row?.id, "fixture_organization_id_missing");
  fixtures.organizationId = row.id;
}

async function signInFixture({ anonKey, email, password, url }) {
  const client = createSessionClient(url, anonKey);
  const result = await client.auth.signInWithPassword({ email, password });
  assert(!result.error && result.data.user?.id && result.data.session, "fixture_sign_in_failed");
  return { client, id: result.data.user.id, session: result.data.session };
}

async function createFixtureUser({ anonKey, fixtures, role, service, url }) {
  const ordinal = fixtures.userIds.length + 1;
  const email = `student-practice-e2e-${fixtures.runId}-${role}-${ordinal}@fixture.invalid`;
  const password = randomPassword();
  const authResult = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: "student_assignment_practice_live_e2e" },
  });
  assert(!authResult.error && authResult.data.user?.id, "fixture_auth_user_create_failed");
  const userId = authResult.data.user.id;
  fixtures.userIds.push(userId);

  assertNoError(
    await service.from("profiles").upsert(
      {
        default_organization_id: fixtures.organizationId,
        display_name: `Student Practice E2E ${role}`,
        email,
        id: userId,
        role,
        status: "active",
        username: `student-practice-e2e-${fixtures.runId}-${role}-${ordinal}`,
      },
      { onConflict: "id" },
    ),
    "fixture_profile_create_failed",
  );
  const membershipResult = await service
    .from("organization_members")
    .insert({
      organization_id: fixtures.organizationId,
      role,
      status: "active",
      user_id: userId,
    })
    .select("id")
    .single();
  const membership = assertNoError(membershipResult, "fixture_organization_member_create_failed");
  assert(membership?.id, "fixture_organization_member_id_missing");
  fixtures.organizationMemberIds.push(membership.id);

  const session = await signInFixture({ anonKey, email, password, url });
  assert(session.id === userId, "fixture_session_identity_mismatch");
  return session;
}

async function createFixtureClassroom(fixtures) {
  const response = await fixtures.teacher.client.rpc("create_teacher_classroom", {
    p_description: "Disposable assignment practice validation.",
    p_name: `Student Practice E2E ${fixtures.runId}`,
    p_organization_id: fixtures.organizationId,
    p_request_id: randomUUID(),
    p_subject: "Practice validation",
  });
  const rows = assertNoError(response, "fixture_classroom_create_failed");
  const classroom = Array.isArray(rows) ? rows[0] : rows;
  assert(classroom?.classroom_id && classroom?.display_code, "fixture_classroom_create_contract_failed");
  fixtures.classroomId = classroom.classroom_id;

  const joinResult = await fixtures.student.client.rpc("join_classroom_by_code", {
    join_code: classroom.display_code,
  });
  const joined = assertNoError(joinResult, "fixture_student_join_failed");
  const row = Array.isArray(joined) ? joined[0] : joined;
  assert(row?.classroom_id === fixtures.classroomId, "fixture_student_join_contract_failed");
}

async function createFixtureBank(fixtures) {
  const result = await fixtures.teacher.client.rpc("create_question_bank", {
    bank_description: "Disposable private Bank for Student Practice validation.",
    bank_name: `Student Practice E2E ${fixtures.runId}`,
    bank_visibility: "private",
  });
  const bankId = assertNoError(result, "fixture_bank_create_failed");
  assert(bankId, "fixture_bank_id_missing");
  fixtures.bankId = bankId;
}

async function insertQuestion({ bankId, fixtures, published = false, suffix }) {
  const result = await fixtures.service
    .from("questions")
    .insert({
      answer_spec: { kind: "exact_text", value: "2" },
      content_html: "<p>Practice fixture question.</p>",
      content_source: "Disposable fixture.",
      content_source_format: "plain_text",
      created_by: fixtures.teacher.id,
      difficulty_rating: 320,
      options: [],
      organization_id: fixtures.organizationId,
      owner_bank_id: published ? null : bankId,
      published_at: published ? new Date().toISOString() : null,
      question_code: `student-practice-e2e-${fixtures.runId}-${suffix}`,
      question_type: "fill_blank",
      solution_html: "<p>Fixture solution.</p>",
      solution_source: "Fixture solution.",
      solution_source_format: "plain_text",
      source: published ? "student_practice_e2e_public_anchor" : "student_practice_e2e_private_bank",
      source_kind: "manual",
      status: published ? "published" : "review",
      title: published ? "Student Practice public anchor" : "Student Practice private item",
      updated_by: fixtures.teacher.id,
      visibility: published ? "public" : "private",
    })
    .select("id")
    .single();
  const question = assertNoError(result, "fixture_question_create_failed");
  assert(question?.id, "fixture_question_id_missing");
  fixtures.questionIds.push(question.id);
  return question.id;
}

async function createBankQuestion(fixtures, questionId) {
  const result = await fixtures.service
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
    .single();
  const row = assertNoError(result, "fixture_bank_question_create_failed");
  assert(row?.id, "fixture_bank_question_id_missing");
  fixtures.bankQuestionIds.push(row.id);
  return row.id;
}

async function createPrivateReviewAndBlueprint(fixtures) {
  const batchResult = await fixtures.service
    .from("review_batches")
    .insert({
      created_by: fixtures.teacher.id,
      organization_id: fixtures.organizationId,
      source_kind: "manual",
      status: "pending_review",
      summary: { fixture_only: true },
      target_bank_id: fixtures.bankId,
      title: "Disposable review fixture",
    })
    .select("id")
    .single();
  const batch = assertNoError(batchResult, "fixture_review_batch_create_failed");
  assert(batch?.id, "fixture_review_batch_id_missing");
  fixtures.reviewBatchId = batch.id;

  const itemResult = await fixtures.service
    .from("review_draft_items")
    .insert({
      draft_payload: { fixture_only: true },
      item_kind: "question",
      review_batch_id: batch.id,
      status: "pending_review",
      target_bank_id: fixtures.bankId,
      validation_warnings: [],
    })
    .select("id")
    .single();
  const item = assertNoError(itemResult, "fixture_review_item_create_failed");
  assert(item?.id, "fixture_review_item_id_missing");
  fixtures.reviewItemId = item.id;

  const blueprintId = randomUUID();
  assertNoError(
    await fixtures.service.from("question_blueprints").insert({
      answer_spec_pattern: {},
      blueprint_kind: "manual",
      created_by: fixtures.teacher.id,
      description: "Disposable private Blueprint fixture.",
      difficulty_profile: {},
      distractor_pattern: {},
      generation_blocking_reasons: ["fixture"],
      generation_constraints: { fixture_only: true },
      generation_ready: false,
      id: blueprintId,
      metadata: { fixture_only: true },
      organization_id: fixtures.organizationId,
      originality_constraints: {},
      owner_id: fixtures.teacher.id,
      owner_scope: "teacher",
      question_pattern: {},
      required_elements: [],
      source_bank_id: fixtures.bankId,
      source_kind: "question_bank",
      status: "pending_review",
      taxonomy_targets: [],
      title: "Disposable private Blueprint",
      updated_by: fixtures.teacher.id,
      visibility: "private",
    }),
    "fixture_blueprint_create_failed",
  );
  fixtures.blueprintId = blueprintId;
}

async function createFixtureAssignment(fixtures, assignedBankQuestionId) {
  const result = await fixtures.teacher.client.rpc("create_assignment_from_bank", {
    p_assign_now: true,
    p_assignment_due_at: null,
    p_assignment_instructions: "Disposable assignment practice validation.",
    p_assignment_title: `Student Practice E2E ${fixtures.runId}`,
    p_selected_bank_question_ids: [assignedBankQuestionId],
    p_target_bank_id: fixtures.bankId,
    p_target_classroom_id: fixtures.classroomId,
  });
  const assignmentId = assertNoError(result, "fixture_assignment_create_failed");
  assert(assignmentId, "fixture_assignment_id_missing");
  fixtures.assignmentId = assignmentId;
  fixtures.assignmentTitle = `Student Practice E2E ${fixtures.runId}`;
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
  const result = await fixtures.service
    .from("ai_provider_profiles")
    .select("provider, base_url, is_default")
    .eq("enabled", true)
    .is("deleted_at", null);
  const profiles = assertNoError(result, "provider_preflight_failed") ?? [];
  assert(
    !profiles.some((profile) => profile.is_default && providerMayRunPractice(profile)),
    "preexisting_compatible_default_provider_refused",
  );
}

async function createFixtureProviderProfiles({ fakeProvider, fixtures, encryptionKey }) {
  const activeSecret = randomBytes(24).toString("base64url");
  const disabledSecret = randomBytes(24).toString("base64url");
  fakeProvider.setExpectedCredential(activeSecret);
  const base = {
    base_url: fakeProvider.baseUrl,
    created_by: fixtures.teacher.id,
    model: "fixture-practice-model",
    organization_id: fixtures.organizationId,
    provider: "compatible",
    supports_pdf_input: false,
    supports_vision_images: false,
    updated_by: fixtures.teacher.id,
  };
  const activeResult = await fixtures.service
    .from("ai_provider_profiles")
    .insert({
      ...base,
      ...encryptFixtureSecret(activeSecret, encryptionKey),
      enabled: true,
      is_default: false,
      name: `!student-practice-e2e-active-${fixtures.runId}`,
    })
    .select("id")
    .single();
  const active = assertNoError(activeResult, "fixture_provider_create_failed");
  assert(active?.id, "fixture_provider_id_missing");
  fixtures.providerProfileIds.push(active.id);

  const disabledResult = await fixtures.service
    .from("ai_provider_profiles")
    .insert({
      ...base,
      ...encryptFixtureSecret(disabledSecret, encryptionKey),
      enabled: false,
      is_default: false,
      name: `!student-practice-e2e-disabled-${fixtures.runId}`,
    })
    .select("id")
    .single();
  const disabled = assertNoError(disabledResult, "fixture_disabled_provider_create_failed");
  assert(disabled?.id, "fixture_disabled_provider_id_missing");
  fixtures.providerProfileIds.push(disabled.id);

  // loadPracticeAIProfile chooses the default compatible profile, otherwise the
  // first compatible profile by name. Refuse before starting Next unless this
  // local-only profile is the exact profile the normal resolver will select.
  const candidatesResult = await fixtures.service
    .from("ai_provider_profiles")
    .select("id, provider, base_url, enabled, is_default, name")
    .eq("enabled", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  const candidates = assertNoError(candidatesResult, "provider_selection_preflight_failed") ?? [];
  const compatible = candidates.filter(providerMayRunPractice);
  const selected = compatible.find((profile) => profile.is_default) ?? compatible[0] ?? null;
  assert(selected?.id === active.id, "fixture_provider_selection_not_exclusive");
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
    mode: "success",
    requestCount: 0,
    sawOnlyExpectedCredential: true,
  };
  const rawErrorMarker = `upstream-${randomBytes(18).toString("base64url")}`;
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

    const errorStatus = {
      generic_failure: 500,
      rate_limited: 429,
      timeout: 504,
    }[state.mode];
    if (errorStatus) {
      response
        .writeHead(errorStatus, { "content-type": "application/json" })
        .end(JSON.stringify({ internal: rawErrorMarker }));
      return;
    }
    if (state.mode === "invalid_response") {
      response.writeHead(200, { "content-type": "text/plain" }).end(rawErrorMarker);
      return;
    }
    if (body.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (state.mode === "malformed_sse") {
        response.end(`data: ${rawErrorMarker}\n\ndata: [DONE]\n\n`);
        return;
      }
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Fixture review." } }] })}\n\n` +
          `data: ${JSON.stringify({ usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 } })}\n\n` +
          "data: [DONE]\n\n",
      );
      return;
    }
    if (Array.isArray(body.tools) && body.tools.length) {
      // The normal agent records tool output as role=tool with a call id, not a
      // provider-specific tool name. A tool result means the next loop should
      // finalize only from the candidate IDs returned by that result.
      const hasSearchResult = Array.isArray(body.messages) && body.messages.some(
        (message) => message?.role === "tool",
      );
      const toolCall = hasSearchResult
        ? {
            arguments: JSON.stringify({
              question_ids: [state.publicQuestionId].filter(Boolean),
              reasons: state.publicQuestionId ? { [state.publicQuestionId]: "Fixture selection." } : {},
              visible_thought: "Finish the disposable recommendation.",
            }),
            name: "finalize_recommendation",
          }
        : {
            arguments: JSON.stringify({
              lanes: [{ confirmed_tag_ids: [], lane_id: "fixture", query_text: "student practice public anchor", rationale: "Fixture retrieval." }],
              mode: "relaxed",
              visible_thought: "Find a disposable public anchor.",
            }),
            name: "practice_search_batch",
          };
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        choices: [{ message: { content: "", tool_calls: [{ function: toolCall, id: "fixture-tool", type: "function" }] } }],
        usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
      }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ hint: "Fixture hint.", is_correct: false, judgment_reason: "Fixture review.", long_term_preference: "Fixture preference.", score: 0, title: "Fixture practice" }) } }],
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
    rawErrorMarker,
    requestCount() {
      return state.requestCount;
    },
    setExpectedCredential(value) {
      state.expectedCredential = value;
    },
    setMode(value) {
      state.mode = value;
    },
    setPublicQuestionId(value) {
      state.publicQuestionId = value;
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

async function startNextServer(config) {
  const port = await findFreePort();
  const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const childEnvironment = {
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
  // Normal Practice provider resolution must not need the admin gateway. Do
  // not let an inherited local gateway token mask a regression in this E2E.
  delete childEnvironment.AI_PROVIDER_GATEWAY_TOKEN;

  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(port)], {
    cwd: root,
    env: childEnvironment,
    stdio: "ignore",
    windowsHide: true,
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/auth/login`);
      if (response.status < 500) {
        return {
          close: async () => {
            if (child.exitCode !== null) return;
            child.kill();
            await new Promise((resolveExit) => child.once("exit", resolveExit));
          },
          origin,
        };
      }
    } catch {
      // The local server is still starting. Keep the retry bounded.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  child.kill();
  throw new HarnessError("next_server_start_timeout");
}

function sessionCookie(session, projectRef) {
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `sb-${projectRef}-auth-token=base64-${encoded}`;
}

function assertNoSensitiveBrowserResponse(text, fixtures, fakeProvider) {
  assert(!text.includes(fakeProvider.rawErrorMarker), "raw_upstream_body_leaked_to_browser");
  assert(!text.includes("api_key_ciphertext") && !text.includes("credential_ref") && !text.includes("base_url"), "provider_metadata_leaked_to_browser");
  assert(!fixtures.providerProfileIds.some((id) => text.includes(id)), "provider_profile_identifier_leaked_to_browser");
}

async function requestBrowser(server, { body, cookie, headers = {}, path, method = "POST" }, fixtures, fakeProvider) {
  const response = await fetch(`${server.origin}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    method,
    redirect: "manual",
  });
  const text = await response.text();
  assertNoSensitiveBrowserResponse(text, fixtures, fakeProvider);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Page and SSE responses are validated by status/content below.
  }
  return { json, status: response.status, text };
}

function parseSseEvents(text) {
  return text
    .split(/\n\n/)
    .map((block) => {
      const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? "message";
      const data = /^data:\s*([\s\S]+)$/m.exec(block)?.[1]?.trim() ?? "";
      if (!data || data === "[DONE]") return { event, value: null };
      try {
        return { event, value: JSON.parse(data) };
      } catch {
        return { event, value: null };
      }
    });
}

async function assertRlsIsolation(fixtures) {
  const checks = await Promise.all([
    fixtures.student.client.from("question_banks").select("id").eq("id", fixtures.bankId),
    fixtures.student.client.from("bank_questions").select("id").eq("bank_id", fixtures.bankId),
    fixtures.student.client.from("questions").select("id").eq("id", fixtures.unassignedPrivateQuestionId),
    fixtures.student.client.from("review_draft_items").select("id").eq("id", fixtures.reviewItemId),
    fixtures.student.client.from("question_blueprints").select("id").eq("id", fixtures.blueprintId),
    fixtures.unrelatedStudent.client.from("assignments").select("id").eq("id", fixtures.assignmentId),
    fixtures.unrelatedStudent.client.from("student_assignment_progress").select("id").eq("assignment_id", fixtures.assignmentId),
  ]);
  for (const result of checks) {
    assert(!result.error && !(result.data ?? []).length, "student_or_unrelated_rls_isolation_failed");
  }

  const assigned = await fixtures.student.client
    .from("questions")
    .select("id, published_at, owner_bank_id, status")
    .eq("id", fixtures.assignedPrivateQuestionId)
    .maybeSingle();
  const question = assertNoError(assigned, "assigned_question_read_failed");
  assert(
    question?.id === fixtures.assignedPrivateQuestionId &&
      question.owner_bank_id === fixtures.bankId &&
      question.published_at === null &&
      question.status !== "published",
    "assigned_private_question_contract_failed",
  );
}

async function assertProviderManagementDenied(fixtures) {
  const result = await fixtures.teacher.client.rpc("list_ai_provider_profiles_for_gateway", {
    gateway_token: "fixture-not-a-gateway-token",
  });
  assert(result.error || !(result.data ?? []).length, "teacher_provider_management_rpc_unexpectedly_available");
  const profileRead = await fixtures.student.client
    .from("ai_provider_profiles")
    .select("id")
    .in("id", fixtures.providerProfileIds);
  assert(!profileRead.error && !(profileRead.data ?? []).length, "student_provider_profile_read_unexpectedly_available");
}

async function createPreferenceMergeJob(fixtures, sessionId) {
  const result = await fixtures.service
    .from("practice_preference_merge_jobs")
    .insert({
      organization_id: fixtures.organizationId,
      previous_preference: "",
      source_session_id: sessionId,
      source_session_memory: "",
      source_summary: { fixture_only: true },
      status: "pending",
      user_id: fixtures.student.id,
    })
    .select("id")
    .single();
  const job = assertNoError(result, "fixture_preference_job_create_failed");
  assert(job?.id, "fixture_preference_job_id_missing");
  fixtures.preferenceJobIds.push(job.id);
}

async function validateJourney({ fakeProvider, fixtures, server }) {
  const studentCookie = sessionCookie(fixtures.student.session, fixtures.projectRef);
  const unrelatedCookie = sessionCookie(fixtures.unrelatedStudent.session, fixtures.projectRef);
  const requestCountBeforeAnonymous = fakeProvider.requestCount();
  const anonymous = await requestBrowser(server, {
    body: { goal: "fixture", questionCount: 1, sessionId: randomUUID() },
    path: "/api/practice/recommend",
  }, fixtures, fakeProvider);
  assert(anonymous.status === 401 && fakeProvider.requestCount() === requestCountBeforeAnonymous, "anonymous_practice_access_not_denied_before_provider_resolution");

  const myWork = await requestBrowser(server, {
    cookie: studentCookie,
    method: "GET",
    path: "/student/work",
  }, fixtures, fakeProvider);
  assert(myWork.status === 200 && myWork.text.includes(fixtures.assignmentTitle), "student_my_work_assignment_not_visible");
  const detail = await requestBrowser(server, {
    cookie: studentCookie,
    method: "GET",
    path: `/student/work/${fixtures.assignmentId}`,
  }, fixtures, fakeProvider);
  assert(detail.status === 200 && detail.text.includes(fixtures.assignmentTitle), "student_assignment_detail_not_visible");

  const unrelatedStart = await requestBrowser(server, {
    body: { assignmentId: fixtures.assignmentId },
    cookie: unrelatedCookie,
    path: "/api/practice/assignments/start",
  }, fixtures, fakeProvider);
  assert(unrelatedStart.status >= 400, "unrelated_student_assignment_start_unexpectedly_allowed");

  const start = await requestBrowser(server, {
    body: { assignmentId: fixtures.assignmentId },
    cookie: studentCookie,
    path: "/api/practice/assignments/start",
  }, fixtures, fakeProvider);
  assert(start.status === 200 && start.json?.session?.id && start.json?.recommendation?.roundId, "assignment_practice_start_failed");
  fixtures.practiceSessionIds.push(start.json.session.id);
  const assignmentRoundId = start.json.recommendation.roundId;
  const assignmentRecommendation = start.json.recommendation.recommendations?.[0];
  assert(assignmentRecommendation?.id === fixtures.assignedPrivateQuestionId, "assignment_start_did_not_load_selected_private_question");

  const hint = await requestBrowser(server, {
    body: {
      apiKey: "ignored-client-value",
      credentialRef: "ignored-client-value",
      hintLevel: 1,
      model: "ignored-client-value",
      providerId: randomUUID(),
      questionId: fixtures.assignedPrivateQuestionId,
    },
    cookie: studentCookie,
    path: "/api/practice/hint",
  }, fixtures, fakeProvider);
  assert(hint.status === 200 && hint.json?.mode === "ai", "practice_hint_provider_execution_failed");

  const title = await requestBrowser(server, {
    body: { goal: "Disposable assignment practice" },
    cookie: studentCookie,
    path: "/api/practice/sessions/title",
  }, fixtures, fakeProvider);
  assert(title.status === 200 && title.json?.title, "practice_title_provider_execution_failed");

  const recommend = await requestBrowser(server, {
    body: {
      apiKey: "ignored-client-value",
      completedQuestionIds: [],
      credentialRef: "ignored-client-value",
      goal: "student practice public anchor",
      model: "ignored-client-value",
      providerId: randomUUID(),
      questionCount: 1,
      sessionId: start.json.session.id,
      wrongQuestionIds: [],
    },
    cookie: studentCookie,
    path: "/api/practice/recommend",
  }, fixtures, fakeProvider);
  assert(
    recommend.status === 200 && recommend.json?.mode === "ai" && recommend.json?.recommendations?.length === 1,
    "practice_recommend_provider_execution_failed",
  );

  const grade = await requestBrowser(server, {
    body: {
      attempts: [{ answer: "2", hintCount: 1, questionId: fixtures.assignedPrivateQuestionId }],
      roundId: assignmentRoundId,
      sessionId: start.json.session.id,
    },
    cookie: studentCookie,
    path: "/api/practice/grade",
  }, fixtures, fakeProvider);
  assert(grade.status === 200 && grade.json?.results?.[0]?.isCorrect === true, "deterministic_assignment_grade_failed");

  const review = await requestBrowser(server, {
    body: {
      attempts: [{ answer: "2", hintCount: 1, questionId: fixtures.assignedPrivateQuestionId, result: grade.json.results[0] }],
      goal: "Disposable assignment practice",
      recommendations: start.json.recommendation.recommendations,
      roundId: assignmentRoundId,
      sessionId: start.json.session.id,
    },
    cookie: studentCookie,
    headers: { accept: "text/event-stream" },
    path: "/api/practice/review",
  }, fixtures, fakeProvider);
  assert(review.status === 200 && parseSseEvents(review.text).some((event) => event.event === "result"), "practice_review_provider_execution_failed");

  await createPreferenceMergeJob(fixtures, start.json.session.id);
  const merge = await requestBrowser(server, {
    cookie: studentCookie,
    path: "/api/practice/preferences/merge/run",
  }, fixtures, fakeProvider);
  assert(merge.status === 200 && merge.json?.status === "succeeded", "practice_preference_merge_provider_execution_failed");

  const preferences = await requestBrowser(server, {
    cookie: studentCookie,
    method: "GET",
    path: "/api/practice/preferences",
  }, fixtures, fakeProvider);
  assert(preferences.status === 200 && preferences.json?.fullCallLogsEnabled === false, "practice_full_call_logging_not_disabled_for_live_harness");

  const reload = await requestBrowser(server, {
    cookie: studentCookie,
    method: "GET",
    path: `/api/practice/sessions/${start.json.session.id}`,
  }, fixtures, fakeProvider);
  assert(reload.status === 200 && reload.json?.session?.rounds?.length >= 1, "practice_session_reload_not_persisted");

  const progress = await fixtures.teacher.client
    .from("student_assignment_progress")
    .select("assignment_id, last_practice_session_id, status")
    .eq("assignment_id", fixtures.assignmentId)
    .eq("student_id", fixtures.student.id)
    .maybeSingle();
  const evidence = assertNoError(progress, "teacher_assignment_evidence_read_failed");
  assert(
    evidence?.last_practice_session_id === start.json.session.id && evidence.status === "completed",
    "teacher_assignment_evidence_not_persisted",
  );

  for (const [mode, expectedCode] of [
    ["timeout", "provider_timeout"],
    ["rate_limited", "provider_rate_limited"],
    ["invalid_response", "provider_invalid_response"],
    ["generic_failure", "provider_unavailable"],
  ]) {
    fakeProvider.setMode(mode);
    const failure = await requestBrowser(server, {
      body: { goal: "Disposable assignment practice" },
      cookie: studentCookie,
      path: "/api/practice/sessions/title",
    }, fixtures, fakeProvider);
    assert(failure.status === 500 && failure.json?.code === expectedCode, `safe_${mode}_classification_failed`);
  }
  fakeProvider.setMode("malformed_sse");
  const malformed = await requestBrowser(server, {
    body: {
      attempts: [{ answer: "2", hintCount: 1, questionId: fixtures.assignedPrivateQuestionId, result: grade.json.results[0] }],
      goal: "Disposable assignment practice",
      recommendations: start.json.recommendation.recommendations,
      roundId: assignmentRoundId,
      sessionId: start.json.session.id,
    },
    cookie: studentCookie,
    headers: { accept: "text/event-stream" },
    path: "/api/practice/review",
  }, fixtures, fakeProvider);
  assert(malformed.status === 200 && parseSseEvents(malformed.text).some((event) => event.event === "result"), "malformed_provider_sse_not_safely_contained");
  fakeProvider.setMode("success");

  await assertRlsIsolation(fixtures);
  await assertProviderManagementDenied(fixtures);
  fakeProvider.assertCredentialSelection();
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

async function cleanupFixtures(fixtures) {
  const failures = [];
  async function clean(category, operation) {
    try {
      await operation();
    } catch {
      failures.push(category);
    }
  }
  const service = fixtures.service;
  await clean("practice_preference_merge_jobs", () => deleteExact(service, "practice_preference_merge_jobs", "id", fixtures.preferenceJobIds, "cleanup_preference_jobs_failed"));
  await clean("practice_hint_events", () => deleteExact(service, "practice_hint_events", "session_id", fixtures.practiceSessionIds, "cleanup_hint_events_failed"));
  await clean("practice_reflection_records", () => deleteExact(service, "practice_reflection_records", "session_id", fixtures.practiceSessionIds, "cleanup_reflection_records_failed"));
  await clean("practice_weakness_links", () => deleteExact(service, "practice_weakness_links", "session_id", fixtures.practiceSessionIds, "cleanup_weakness_links_failed"));
  await clean("practice_wrong_questions", () => deleteExact(service, "practice_wrong_questions", "user_id", [fixtures.student?.id].filter(Boolean), "cleanup_wrong_questions_failed"));
  await clean("practice_attempts", () => deleteExact(service, "practice_attempts", "session_id", fixtures.practiceSessionIds, "cleanup_attempts_failed"));
  await clean("practice_round_questions", () => deleteExact(service, "practice_round_questions", "session_id", fixtures.practiceSessionIds, "cleanup_round_questions_failed"));
  await clean("practice_agent_episodes", () => deleteExact(service, "practice_agent_episodes", "session_id", fixtures.practiceSessionIds, "cleanup_episodes_failed"));
  await clean("practice_rounds", () => deleteExact(service, "practice_rounds", "session_id", fixtures.practiceSessionIds, "cleanup_rounds_failed"));
  await clean("assignment_practice_sessions", () => deleteExact(service, "assignment_practice_sessions", "assignment_id", [fixtures.assignmentId].filter(Boolean), "cleanup_assignment_session_links_failed"));
  await clean("student_assignment_progress", () => deleteExact(service, "student_assignment_progress", "assignment_id", [fixtures.assignmentId].filter(Boolean), "cleanup_assignment_progress_failed"));
  await clean("practice_sessions", () => deleteExact(service, "practice_sessions", "id", fixtures.practiceSessionIds, "cleanup_practice_sessions_failed"));
  await clean("user_practice_preferences", () => deleteExact(service, "user_practice_preferences", "user_id", [fixtures.student?.id].filter(Boolean), "cleanup_preferences_failed"));
  await clean("assignment_items", () => deleteExact(service, "assignment_items", "assignment_id", [fixtures.assignmentId].filter(Boolean), "cleanup_assignment_items_failed"));
  await clean("assignments", () => deleteExact(service, "assignments", "id", [fixtures.assignmentId].filter(Boolean), "cleanup_assignment_failed"));
  await clean("review_draft_items", () => deleteExact(service, "review_draft_items", "id", [fixtures.reviewItemId].filter(Boolean), "cleanup_review_item_failed"));
  await clean("review_batches", () => deleteExact(service, "review_batches", "id", [fixtures.reviewBatchId].filter(Boolean), "cleanup_review_batch_failed"));
  await clean("question_blueprints", () => deleteExact(service, "question_blueprints", "id", [fixtures.blueprintId].filter(Boolean), "cleanup_blueprint_failed"));
  await clean("bank_questions", () => deleteExact(service, "bank_questions", "id", fixtures.bankQuestionIds, "cleanup_bank_questions_failed"));
  await clean("questions", () => deleteExact(service, "questions", "id", fixtures.questionIds, "cleanup_questions_failed"));
  await clean("bank_members", () => deleteExact(service, "bank_members", "bank_id", [fixtures.bankId].filter(Boolean), "cleanup_bank_members_failed"));
  await clean("question_banks", () => deleteExact(service, "question_banks", "id", [fixtures.bankId].filter(Boolean), "cleanup_bank_failed"));
  await clean("classroom_join_codes", () => deleteExact(service, "classroom_join_codes", "classroom_id", [fixtures.classroomId].filter(Boolean), "cleanup_join_codes_failed"));
  await clean("classroom_members", () => deleteExact(service, "classroom_members", "classroom_id", [fixtures.classroomId].filter(Boolean), "cleanup_classroom_members_failed"));
  await clean("classrooms", () => deleteExact(service, "classrooms", "id", [fixtures.classroomId].filter(Boolean), "cleanup_classroom_failed"));
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
  await clean("cleanup_verification", async () => {
    await verifyAbsent(service, "practice_sessions", "id", fixtures.practiceSessionIds, "cleanup_practice_session_verification_failed");
    await verifyAbsent(service, "questions", "id", fixtures.questionIds, "cleanup_question_verification_failed");
    await verifyAbsent(service, "question_banks", "id", [fixtures.bankId].filter(Boolean), "cleanup_bank_verification_failed");
    await verifyAbsent(service, "classrooms", "id", [fixtures.classroomId].filter(Boolean), "cleanup_classroom_verification_failed");
    await verifyAbsent(service, "ai_provider_profiles", "id", fixtures.providerProfileIds, "cleanup_provider_verification_failed");
    await verifyAbsent(service, "profiles", "id", fixtures.userIds, "cleanup_profile_verification_failed");
  });
  if (failures.length) throw new HarnessError(`cleanup_incomplete:${failures.join(",")}`);
}

async function main() {
  const config = requireApprovedProcessEnvironment();
  const service = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fixtures = {
    assignmentId: null,
    assignmentTitle: "",
    assignedPrivateQuestionId: null,
    bankId: null,
    bankQuestionIds: [],
    blueprintId: null,
    classroomId: null,
    organizationId: null,
    organizationMemberIds: [],
    preferenceJobIds: [],
    projectRef: config.projectRef,
    providerProfileIds: [],
    questionIds: [],
    reviewBatchId: null,
    reviewItemId: null,
    runId: opaqueRunId(),
    service,
    student: null,
    teacher: null,
    unrelatedStudent: null,
    unassignedPrivateQuestionId: null,
    userIds: [],
  };
  let fakeProvider = null;
  let nextServer = null;
  let failure = null;
  try {
    await createFixtureOrganization(service, fixtures);
    fixtures.teacher = await createFixtureUser({ ...config, fixtures, role: "teacher", service });
    fixtures.student = await createFixtureUser({ ...config, fixtures, role: "student", service });
    fixtures.unrelatedStudent = await createFixtureUser({ ...config, fixtures, role: "student", service });
    await createFixtureClassroom(fixtures);
    await createFixtureBank(fixtures);
    fixtures.assignedPrivateQuestionId = await insertQuestion({ bankId: fixtures.bankId, fixtures, suffix: "assigned" });
    fixtures.unassignedPrivateQuestionId = await insertQuestion({ bankId: fixtures.bankId, fixtures, suffix: "unassigned" });
    const publicQuestionId = await insertQuestion({ bankId: null, fixtures, published: true, suffix: "public" });
    const assignedBankQuestionId = await createBankQuestion(fixtures, fixtures.assignedPrivateQuestionId);
    await createBankQuestion(fixtures, fixtures.unassignedPrivateQuestionId);
    await createPrivateReviewAndBlueprint(fixtures);
    await createFixtureAssignment(fixtures, assignedBankQuestionId);
    await ensureNoExistingCompatibleDefault(fixtures);
    fakeProvider = await startLocalFakeProvider();
    fakeProvider.setPublicQuestionId(publicQuestionId);
    await createFixtureProviderProfiles({ fakeProvider, fixtures, encryptionKey: config.encryptionKey });
    nextServer = await startNextServer(config);
    await validateJourney({ fakeProvider, fixtures, server: nextServer });
  } catch (error) {
    failure = error;
  } finally {
    if (nextServer) await nextServer.close().catch(() => undefined);
    if (fakeProvider) await fakeProvider.close().catch(() => undefined);
    try {
      await cleanupFixtures(fixtures);
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
  }
  if (failure) throw failure;
  console.log("PASS disposable Student Assignment/Practice E2E completed with exact cleanup");
}

try {
  await main();
} catch (error) {
  console.error(`FAIL Student Assignment/Practice live E2E (${error?.category ?? "unexpected_failure"})`);
  process.exitCode = 1;
}
