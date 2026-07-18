#!/usr/bin/env node

// Live-only, exact-ID validation for the 0045 asset authorization wrapper.
// It deliberately has no dotenv support and refuses production-looking runs.

import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), "..");
const sourceOnly = !process.argv.includes("--live") || process.argv.includes("--source-only");
let createClient;
let createServerClient;

const ENVIRONMENT_CONFIRMATION = "DISPOSABLE_QUESTION_ASSETS_MATRIX";
const FIXTURE_CONFIRMATION = "CREATE_QUESTION_ASSET_MATRIX_FIXTURES";
const CLEANUP_CONFIRMATION = "CLEANUP_QUESTION_ASSET_MATRIX_FIXTURES";
const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "QUESTION_ASSETS_MATRIX_ENVIRONMENT",
  "QUESTION_ASSETS_MATRIX_EXPECTED_PROJECT_REF",
  "QUESTION_ASSETS_MATRIX_CONFIRM_FIXTURES",
  "QUESTION_ASSETS_MATRIX_CONFIRM_CLEANUP",
];

class MatrixError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new MatrixError(category);
}

function safeErrorCategory(error) {
  const candidate = String(error?.code ?? error?.status ?? "request_failed");
  return /^[A-Za-z0-9_:-]{1,80}$/.test(candidate) ? candidate : "request_failed";
}

function assertNoError(result, category) {
  if (result?.error) {
    throw new MatrixError(`${category}:${safeErrorCategory(result.error)}`);
  }
  return result?.data;
}

function projectRefFromSupabaseUrl(value) {
  try {
    const parsed = new URL(value);
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function requireApprovedProcessEnvironment() {
  const missing = REQUIRED_ENVIRONMENT.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new MatrixError(`missing_process_environment:${missing.join(",")}`);
  }

  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new MatrixError("production_environment_refused");
  }
  if (process.env.QUESTION_ASSETS_MATRIX_ENVIRONMENT !== ENVIRONMENT_CONFIRMATION) {
    throw new MatrixError("disposable_environment_acknowledgement_required");
  }
  if (process.env.QUESTION_ASSETS_MATRIX_CONFIRM_FIXTURES !== FIXTURE_CONFIRMATION) {
    throw new MatrixError("fixture_creation_acknowledgement_required");
  }
  if (process.env.QUESTION_ASSETS_MATRIX_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    throw new MatrixError("fixture_cleanup_acknowledgement_required");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const actualProjectRef = projectRefFromSupabaseUrl(url);
  const expectedProjectRef = process.env.QUESTION_ASSETS_MATRIX_EXPECTED_PROJECT_REF.trim().toLowerCase();
  if (!actualProjectRef || actualProjectRef !== expectedProjectRef) {
    throw new MatrixError("expected_project_identity_mismatch");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (!siteUrl) {
    throw new MatrixError("missing_process_environment:NEXT_PUBLIC_SITE_URL_or_SITE_URL");
  }

  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    siteUrl,
    url,
  };
}

function createAnonClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createRouteSessionClient(url, anonKey) {
  const cookieMap = new Map();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return [...cookieMap.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const { name, value } of cookies) cookieMap.set(name, value);
      },
    },
  });

  return {
    client,
    cookieHeader() {
      return [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
  };
}

function randomPassword() {
  return `QuestionAssetsMatrix!${randomBytes(24).toString("base64url")}`;
}

function opaqueRunId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

async function createRoleFixture({ anonKey, fixtures, organizationId, role, runId, service, url }) {
  const index = fixtures.userIds.length + 1;
  const password = randomPassword();
  const email = `question-assets-matrix-${runId}-${role}-${index}@fixture.invalid`;
  const authResult = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: "question_assets_precutover_matrix", fixture_run: runId },
  });
  assert(!authResult.error && authResult.data.user?.id, "fixture_auth_user_create_failed");
  const userId = authResult.data.user.id;
  fixtures.userIds.push(userId);

  const profileResult = await service.from("profiles").upsert(
    {
      default_organization_id: organizationId,
      display_name: `Question assets matrix ${role} ${index}`,
      email,
      id: userId,
      role,
      status: "active",
      username: `question-assets-matrix-${runId}-${role}-${index}`,
    },
    { onConflict: "id" },
  );
  assertNoError(profileResult, "fixture_profile_create_failed");

  const membershipResult = await service
    .from("organization_members")
    .insert({ organization_id: organizationId, role, status: "active", user_id: userId })
    .select("id")
    .single();
  const membership = assertNoError(membershipResult, "fixture_organization_member_create_failed");
  assert(membership?.id, "fixture_organization_member_id_missing");
  fixtures.organizationMemberIds.push(membership.id);

  const session = createRouteSessionClient(url, anonKey);
  const signInResult = await session.client.auth.signInWithPassword({ email, password });
  assert(!signInResult.error && signInResult.data.user?.id === userId, "fixture_sign_in_failed");
  assert(session.cookieHeader().length > 0, "fixture_route_cookie_missing");
  return { client: session.client, cookieHeader: session.cookieHeader, id: userId };
}

async function createOrganization(service, fixtures, runId) {
  const result = await service
    .from("organizations")
    .insert({
      name: `Question assets matrix ${runId}`,
      slug: `question-assets-matrix-${runId}`,
      status: "active",
    })
    .select("id")
    .single();
  const row = assertNoError(result, "fixture_organization_create_failed");
  assert(row?.id, "fixture_organization_id_missing");
  fixtures.organizationIds.push(row.id);
  return row.id;
}

async function createClassroom(service, fixtures, organizationId, ownerId, runId) {
  const result = await service
    .from("classrooms")
    .insert({
      created_by: ownerId,
      name: `Question assets matrix ${runId}`,
      organization_id: organizationId,
      owner_id: ownerId,
      status: "active",
      subject: "Authorization validation",
      updated_by: ownerId,
    })
    .select("id")
    .single();
  const row = assertNoError(result, "fixture_classroom_create_failed");
  assert(row?.id, "fixture_classroom_id_missing");
  fixtures.classroomIds.push(row.id);
  return row.id;
}

async function addClassroomStudent(service, fixtures, classroomId, studentId) {
  const result = await service
    .from("classroom_members")
    .insert({
      classroom_id: classroomId,
      joined_at: new Date().toISOString(),
      role: "student",
      status: "active",
      user_id: studentId,
    })
    .select("id")
    .single();
  const row = assertNoError(result, "fixture_classroom_member_create_failed");
  assert(row?.id, "fixture_classroom_member_id_missing");
  fixtures.classroomMemberIds.push(row.id);
}

async function createPrivateBank(service, fixtures, organizationId, ownerId, managerId, runId) {
  const bankResult = await service
    .from("question_banks")
    .insert({
      created_by: ownerId,
      description: "Disposable authorization validation only.",
      name: `Question assets matrix ${runId}`,
      organization_id: organizationId,
      owner_id: ownerId,
      status: "active",
      updated_by: ownerId,
      visibility: "private",
    })
    .select("id")
    .single();
  const bank = assertNoError(bankResult, "fixture_bank_create_failed");
  assert(bank?.id, "fixture_bank_id_missing");
  fixtures.bankIds.push(bank.id);

  const memberResult = await service.from("bank_members").insert([
    { bank_id: bank.id, user_id: ownerId, role: "owner", status: "active", invited_by: ownerId, joined_at: new Date().toISOString() },
    { bank_id: bank.id, user_id: managerId, role: "editor", status: "active", invited_by: ownerId, joined_at: new Date().toISOString() },
  ]).select("id");
  const members = assertNoError(memberResult, "fixture_bank_member_create_failed");
  assert(Array.isArray(members) && members.length === 2, "fixture_bank_member_count_invalid");
  fixtures.bankMemberIds.push(...members.map((member) => member.id));
  return bank.id;
}

async function createQuestion(service, fixtures, payload) {
  const result = await service
    .from("questions")
    .insert({
      answer_spec: { kind: "exact_text", value: "2" },
      content_html: "<p>Disposable authorization validation.</p>",
      content_source: "Disposable authorization validation.",
      content_source_format: "plain_text",
      created_by: payload.createdBy,
      difficulty_rating: 100,
      options: [],
      organization_id: payload.organizationId,
      owner_bank_id: payload.ownerBankId ?? null,
      question_code: `question-assets-matrix-${payload.runId}-${fixtures.questionIds.length + 1}`,
      question_type: "fill_blank",
      solution_html: "<p>Disposable validation solution.</p>",
      solution_source: "Disposable validation solution.",
      solution_source_format: "plain_text",
      source: "question_assets_precutover_matrix",
      source_kind: "manual",
      status: payload.status,
      title: "Question assets authorization fixture",
      updated_by: payload.createdBy,
      visibility: payload.visibility,
      published_at: payload.status === "published" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  const question = assertNoError(result, "fixture_question_create_failed");
  assert(question?.id, "fixture_question_id_missing");
  fixtures.questionIds.push(question.id);
  return question.id;
}

async function addBankQuestion(service, fixtures, bankId, questionId, userId) {
  const result = await service
    .from("bank_questions")
    .insert({
      added_by: userId,
      bank_id: bankId,
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

async function createAssignedItem(service, fixtures, classroomId, organizationId, teacherId, questionId, runId) {
  const assignmentResult = await service
    .from("assignments")
    .insert({
      assigned_at: new Date().toISOString(),
      classroom_id: classroomId,
      created_by: teacherId,
      instructions: "",
      organization_id: organizationId,
      status: "assigned",
      title: `Question assets matrix ${runId}`,
    })
    .select("id")
    .single();
  const assignment = assertNoError(assignmentResult, "fixture_assignment_create_failed");
  assert(assignment?.id, "fixture_assignment_id_missing");
  fixtures.assignmentIds.push(assignment.id);

  const itemResult = await service
    .from("assignment_items")
    .insert({ assignment_id: assignment.id, item_type: "question", order_index: 1, points: 1, question_id: questionId })
    .select("id")
    .single();
  const item = assertNoError(itemResult, "fixture_assignment_item_create_failed");
  assert(item?.id, "fixture_assignment_item_id_missing");
  fixtures.assignmentItemIds.push(item.id);
}

async function createAsset(service, fixtures, questionId) {
  const assetId = randomUUID();
  const objectPath = `questions/${questionId}/${assetId}.png`;
  const assetResult = await service
    .from("question_assets")
    .insert({
      alt_text: "Disposable authorization fixture",
      asset_kind: "image",
      created_by: fixtures.teacher.id,
      display_order: 0,
      id: assetId,
      label: "Disposable authorization fixture",
      question_id: questionId,
      storage_bucket: "question-assets",
      storage_path: objectPath,
    })
    .select("id")
    .single();
  const asset = assertNoError(assetResult, "fixture_asset_create_failed");
  assert(asset?.id, "fixture_asset_id_missing");
  fixtures.assetIds.push(asset.id);
  fixtures.objectPaths.push(objectPath);

  const uploadResult = await service.storage
    .from("question-assets")
    .upload(objectPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { contentType: "image/png" });
  assert(!uploadResult.error, "fixture_asset_upload_failed");
  return asset.id;
}

async function assertWrapper(client, assetId, expected, label) {
  const result = await client.rpc("can_read_question_asset", { p_asset_id: assetId });
  assert(!result.error && result.data === expected, `${label}_wrapper_result_invalid`);
  console.log(`PASS ${label} wrapper authorization`);
}

async function assertPrivateHelperDenied(client, questionId, label) {
  const result = await client.schema("private").rpc("can_read_question", { p_question_id: questionId });
  assert(Boolean(result.error), `${label}_private_helper_unexpectedly_executable`);
  console.log(`PASS ${label} cannot directly execute the private helper`);
}

async function requestAssetRoute(siteUrl, assetId, cookieHeader = "") {
  const headers = cookieHeader ? { Cookie: cookieHeader } : undefined;
  const response = await fetch(new URL(`/api/question-assets/${assetId}`, siteUrl), {
    headers,
    redirect: "manual",
  });
  return response;
}

async function assertRouteAuthorized(siteUrl, assetId, cookieHeader, label) {
  const response = await requestAssetRoute(siteUrl, assetId, cookieHeader);
  assert(response.status === 302, `${label}_route_not_authorized`);
  assert(Boolean(response.headers.get("location")), `${label}_route_missing_signed_redirect`);
  assert((response.headers.get("cache-control") ?? "").includes("no-store"), `${label}_route_cache_control_missing`);
  console.log(`PASS ${label} authorized route access`);
}

async function assertRouteDenied(siteUrl, assetId, cookieHeader, label) {
  const response = await requestAssetRoute(siteUrl, assetId, cookieHeader);
  assert(response.status === 404, `${label}_route_denial_status_invalid`);
  assert(!response.headers.get("location"), `${label}_route_leaked_signed_redirect`);
  assert((response.headers.get("cache-control") ?? "").includes("no-store"), `${label}_route_cache_control_missing`);
  console.log(`PASS ${label} generic route denial`);
}

async function deleteExactRows(service, table, ids, category) {
  if (!ids.length) return;
  const result = await service.from(table).delete().in("id", ids);
  assertNoError(result, category);
  const countResult = await service.from(table).select("id", { count: "exact", head: true }).in("id", ids);
  const count = assertNoError(countResult, `${category}_verification_failed`);
  assert(countResult.count === 0, `${category}_residual_rows`);
}

async function cleanupFixtures(service, fixtures) {
  const failures = [];
  const run = async (label, task) => {
    try {
      await task();
    } catch (error) {
      failures.push(`${label}:${error instanceof MatrixError ? error.category : safeErrorCategory(error)}`);
    }
  };

  await run("storage_objects", async () => {
    if (!fixtures.objectPaths.length) return;
    const result = await service.storage.from("question-assets").remove(fixtures.objectPaths);
    assert(!result.error, "fixture_storage_object_cleanup_failed");
  });
  await run("assets", () => deleteExactRows(service, "question_assets", fixtures.assetIds, "fixture_asset_cleanup_failed"));
  await run("assignments", () => deleteExactRows(service, "assignments", fixtures.assignmentIds, "fixture_assignment_cleanup_failed"));
  await run("questions", () => deleteExactRows(service, "questions", fixtures.questionIds, "fixture_question_cleanup_failed"));
  await run("banks", () => deleteExactRows(service, "question_banks", fixtures.bankIds, "fixture_bank_cleanup_failed"));
  await run("classrooms", () => deleteExactRows(service, "classrooms", fixtures.classroomIds, "fixture_classroom_cleanup_failed"));
  await run("organization_members", () => deleteExactRows(service, "organization_members", fixtures.organizationMemberIds, "fixture_organization_member_cleanup_failed"));
  await run("profiles", () => deleteExactRows(service, "profiles", fixtures.userIds, "fixture_profile_cleanup_failed"));
  await run("organizations", () => deleteExactRows(service, "organizations", fixtures.organizationIds, "fixture_organization_cleanup_failed"));
  await run("auth_users", async () => {
    for (const userId of fixtures.userIds) {
      const result = await service.auth.admin.deleteUser(userId);
      assert(!result.error, "fixture_auth_user_cleanup_failed");
    }
  });

  assert(failures.length === 0, `fixture_cleanup_failed:${failures.join(",")}`);
  console.log("PASS exact-ID fixture cleanup completed");
}

async function runLiveMatrix() {
  const config = requireApprovedProcessEnvironment();
  ({ createServerClient } = await import("@supabase/ssr"));
  ({ createClient } = await import("@supabase/supabase-js"));
  const service = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fixtures = {
    assetIds: [],
    assignmentIds: [],
    assignmentItemIds: [],
    bankIds: [],
    bankMemberIds: [],
    bankQuestionIds: [],
    classroomIds: [],
    classroomMemberIds: [],
    objectPaths: [],
    organizationIds: [],
    organizationMemberIds: [],
    questionIds: [],
    userIds: [],
  };
  const runId = opaqueRunId();

  try {
    const organizationId = await createOrganization(service, fixtures, runId);
    fixtures.teacher = await createRoleFixture({ anonKey: config.anonKey, fixtures, organizationId, role: "teacher", runId, service, url: config.url });
    fixtures.bankManager = await createRoleFixture({ anonKey: config.anonKey, fixtures, organizationId, role: "teacher", runId, service, url: config.url });
    fixtures.unrelatedTeacher = await createRoleFixture({ anonKey: config.anonKey, fixtures, organizationId, role: "teacher", runId, service, url: config.url });
    fixtures.selectedStudent = await createRoleFixture({ anonKey: config.anonKey, fixtures, organizationId, role: "student", runId, service, url: config.url });
    fixtures.classroomOnlyStudent = await createRoleFixture({ anonKey: config.anonKey, fixtures, organizationId, role: "student", runId, service, url: config.url });

    const bankId = await createPrivateBank(service, fixtures, organizationId, fixtures.teacher.id, fixtures.bankManager.id, runId);
    const assignedClassroomId = await createClassroom(service, fixtures, organizationId, fixtures.teacher.id, runId);
    const unrelatedClassroomId = await createClassroom(service, fixtures, organizationId, fixtures.teacher.id, runId);
    await addClassroomStudent(service, fixtures, assignedClassroomId, fixtures.selectedStudent.id);
    await addClassroomStudent(service, fixtures, unrelatedClassroomId, fixtures.classroomOnlyStudent.id);

    const publicQuestionId = await createQuestion(service, fixtures, { createdBy: fixtures.teacher.id, organizationId, runId, status: "published", visibility: "public" });
    const draftQuestionId = await createQuestion(service, fixtures, { createdBy: fixtures.teacher.id, organizationId, ownerBankId: bankId, runId, status: "draft", visibility: "private" });
    const selectedQuestionId = await createQuestion(service, fixtures, { createdBy: fixtures.teacher.id, organizationId, ownerBankId: bankId, runId, status: "review", visibility: "private" });
    const unselectedQuestionId = await createQuestion(service, fixtures, { createdBy: fixtures.teacher.id, organizationId, ownerBankId: bankId, runId, status: "review", visibility: "private" });
    await addBankQuestion(service, fixtures, bankId, selectedQuestionId, fixtures.teacher.id);
    await addBankQuestion(service, fixtures, bankId, unselectedQuestionId, fixtures.teacher.id);
    await createAssignedItem(service, fixtures, assignedClassroomId, organizationId, fixtures.teacher.id, selectedQuestionId, runId);

    const publicAssetId = await createAsset(service, fixtures, publicQuestionId);
    const draftAssetId = await createAsset(service, fixtures, draftQuestionId);
    const selectedAssetId = await createAsset(service, fixtures, selectedQuestionId);
    const unselectedAssetId = await createAsset(service, fixtures, unselectedQuestionId);
    const anon = createAnonClient(config.url, config.anonKey);

    await assertPrivateHelperDenied(anon, publicQuestionId, "anonymous requester");
    await assertPrivateHelperDenied(fixtures.selectedStudent.client, selectedQuestionId, "authenticated requester");

    await assertWrapper(anon, publicAssetId, true, "anonymous public asset");
    await assertWrapper(anon, draftAssetId, false, "anonymous private draft asset");
    await assertWrapper(fixtures.selectedStudent.client, selectedAssetId, true, "assignment-selected student selected asset");
    await assertWrapper(fixtures.selectedStudent.client, unselectedAssetId, false, "assignment-selected student unselected bank asset");
    await assertWrapper(fixtures.classroomOnlyStudent.client, selectedAssetId, false, "classroom-only student selected bank asset");
    await assertWrapper(fixtures.bankManager.client, selectedAssetId, true, "bank manager private bank asset");
    await assertWrapper(fixtures.unrelatedTeacher.client, selectedAssetId, false, "unrelated teacher private bank asset");
    await assertWrapper(fixtures.unrelatedTeacher.client, draftAssetId, false, "unrelated teacher private draft asset");

    await assertRouteAuthorized(config.siteUrl, publicAssetId, "", "anonymous public asset");
    await assertRouteDenied(config.siteUrl, draftAssetId, "", "anonymous private draft asset");
    await assertRouteAuthorized(config.siteUrl, selectedAssetId, fixtures.selectedStudent.cookieHeader(), "assignment-selected student selected asset");
    await assertRouteDenied(config.siteUrl, unselectedAssetId, fixtures.selectedStudent.cookieHeader(), "assignment-selected student unselected bank asset");
    await assertRouteDenied(config.siteUrl, selectedAssetId, fixtures.classroomOnlyStudent.cookieHeader(), "classroom-only student selected bank asset");
    await assertRouteAuthorized(config.siteUrl, selectedAssetId, fixtures.bankManager.cookieHeader(), "bank manager private bank asset");
    await assertRouteDenied(config.siteUrl, selectedAssetId, fixtures.unrelatedTeacher.cookieHeader(), "unrelated teacher private bank asset");
    await assertRouteDenied(config.siteUrl, draftAssetId, fixtures.unrelatedTeacher.cookieHeader(), "unrelated teacher private draft asset");
    await assertRouteDenied(config.siteUrl, randomUUID(), "", "unknown asset");

    console.log("PASS exact-ID pre-cutover authorization matrix");
  } finally {
    await cleanupFixtures(service, fixtures);
  }
}

async function runSourceOnly() {
  const [route, migration, runbook] = await Promise.all([
    readFile(resolve(root, "src/app/api/question-assets/[assetId]/route.ts"), "utf8"),
    readFile(resolve(root, "supabase/clean-migrations/0045_question_read_authorization_helper.sql"), "utf8"),
    readFile(resolve(root, "docs/security/question-assets-clean-db-rehearsal.md"), "utf8"),
  ]);
  assert(
    route.indexOf('"can_read_question_asset"') < route.indexOf('.from("question_assets")') &&
      route.includes('"Cache-Control": "private, no-store"'),
    "route_requester_first_contract_missing",
  );
  assert(
    migration.includes("revoke all on function private.can_read_question(uuid) from public, anon, authenticated") &&
      migration.includes("grant execute on function public.can_read_question_asset(uuid) to anon, authenticated"),
    "0045_browser_execute_contract_missing",
  );
  assert(
    runbook.includes("Assignment-selected Student") &&
      runbook.includes("Classroom-only Student") &&
      runbook.includes("Unrelated Teacher"),
    "runbook_authorization_matrix_missing",
  );
  console.log("PASS question-assets pre-cutover authorization matrix source contract");
}

try {
  if (sourceOnly) {
    await runSourceOnly();
  } else {
    await runLiveMatrix();
  }
} catch (error) {
  const category = error instanceof MatrixError ? error.category : safeErrorCategory(error);
  console.error(`FAIL question-assets-precutover-matrix:${category}`);
  process.exitCode = 1;
}
