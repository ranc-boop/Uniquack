#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");
const bulkOnly = process.argv.includes("--bulk-only");
const confirmation = "DISPOSABLE_CLEAN_SUPABASE";
const fixtureKind = "teacher_focus_workspace_live_e2e";
const expectProductionHeaders =
  process.env.TEACHER_FOCUS_EXPECT_PRODUCTION_HEADERS === "1";

for (const candidate of [
  resolve(root, ".env.local"),
  resolve(root, "..", "..", "..", ".env.local"),
]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate, override: false });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoError(result, message) {
  if (result.error) {
    throw new Error(
      `${message}:${result.error.code ?? "unknown"}:${result.error.message}`,
    );
  }
  return result.data;
}

function randomPassword() {
  return `TeacherFocus!${randomBytes(24).toString("base64url")}`;
}

function localBaseUrl() {
  const value =
    process.env.TEACHER_FOCUS_BASE_URL?.trim() || "http://localhost:3000";
  const parsed = new URL(value);
  assert(
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1",
    "teacher_focus_e2e_requires_localhost",
  );
  return parsed.origin;
}

function createFixtureState(service) {
  return {
    authUserIds: [],
    bankIds: [],
    bankMemberIds: [],
    bankQuestionIds: [],
    importBatchIds: [],
    importBatchItemIds: [],
    organizationIds: [],
    organizationMemberIds: [],
    profileIds: [],
    questionAssetIds: [],
    questionAssetPaths: [],
    questionIds: [],
    reviewBatchIds: [],
    reviewItemIds: [],
    service,
    sourceFileIds: [],
  };
}

async function insertOne(query, message) {
  const row = assertNoError(await query.select("id").single(), message);
  assert(row?.id, message);
  return row.id;
}

async function createOrganization(fixtures, runId, suffix) {
  const id = await insertOne(
    fixtures.service.from("organizations").insert({
      name: `Teacher focus ${suffix} ${runId}`,
      slug: `teacher-focus-${suffix}-${runId}`,
      status: "active",
    }),
    "organization_fixture_create_failed",
  );
  fixtures.organizationIds.push(id);
  return id;
}

async function createActor({
  fixtures,
  label,
  organizationId,
  organizationRole,
  profileRole,
  runId,
}) {
  const username = `teacher-focus-${runId}-${label}`;
  const email = `${username}@local.app`;
  const password = randomPassword();
  const authResult = await fixtures.service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: fixtureKind, fixture_run: runId },
  });
  assert(
    !authResult.error && authResult.data.user?.id,
    "auth_fixture_create_failed",
  );
  const id = authResult.data.user.id;
  fixtures.authUserIds.push(id);
  fixtures.profileIds.push(id);

  assertNoError(
    await fixtures.service.from("profiles").upsert(
      {
        default_organization_id: organizationId,
        display_name: `Teacher focus ${label}`,
        email,
        id,
        role: profileRole,
        status: "active",
        username,
      },
      { onConflict: "id" },
    ),
    "profile_fixture_create_failed",
  );

  const organizationMemberId = await insertOne(
    fixtures.service.from("organization_members").insert({
      organization_id: organizationId,
      role: organizationRole,
      status: "active",
      user_id: id,
    }),
    "organization_member_fixture_create_failed",
  );
  fixtures.organizationMemberIds.push(organizationMemberId);

  return { email, id, password, profileRole, username };
}

async function createBank({
  fixtures,
  name,
  organizationId,
  ownerId,
  visibility,
}) {
  const id = await insertOne(
    fixtures.service.from("question_banks").insert({
      created_by: ownerId,
      description: "Disposable focused-preview validation only.",
      metadata: { fixture_kind: fixtureKind },
      name,
      organization_id: organizationId,
      owner_id: ownerId,
      status: "active",
      updated_by: ownerId,
      visibility,
    }),
    "bank_fixture_create_failed",
  );
  fixtures.bankIds.push(id);
  return id;
}

async function addBankMember(fixtures, bankId, actorId, role, status) {
  const id = await insertOne(
    fixtures.service.from("bank_members").insert({
      bank_id: bankId,
      invited_by: null,
      joined_at: status === "active" ? new Date().toISOString() : null,
      role,
      status,
      user_id: actorId,
    }),
    "bank_member_fixture_create_failed",
  );
  fixtures.bankMemberIds.push(id);
}

async function createQuestion({
  canaries,
  code,
  fixtures,
  organizationId,
  ownerBankId,
  ownerId,
  sourceReviewItemId = null,
  status = "review",
  title,
  visibility,
  withLongMathContent = false,
}) {
  const longMathContent = withLongMathContent
    ? "Explain each transformation, preserve the domain restrictions, and compare the result with the original model before choosing an answer. ".repeat(
        10,
      )
    : "What is 1 + 1?";
  const contentHtml = withLongMathContent
    ? `<p>${longMathContent}</p><p>Evaluate \\(\\frac{x^2-1}{x-1}\\) for \\(x\\ne1\\), then justify the limiting value.</p>`
    : "<p>What is 1 + 1?</p>";
  const id = await insertOne(
    fixtures.service.from("questions").insert({
      answer_spec: {
        correct_option_ids: ["A"],
        kind: "mcq",
        private_evidence: canaries?.evidence,
      },
      content_html: contentHtml,
      content_source: longMathContent,
      content_source_format: "plain_text",
      created_by: ownerId,
      difficulty_rating: 200,
      options: [
        {
          content_html: "2",
          id: "A",
          label: "A",
          private_path: canaries?.path,
        },
        { content_html: "3", id: "B", label: "B" },
      ],
      organization_id: organizationId,
      owner_bank_id: ownerBankId,
      published_at: null,
      question_code: code,
      question_type: "mcq",
      solution_html: "<p>Add the two ones.</p>",
      solution_source: "Add the two ones.",
      solution_source_format: "plain_text",
      source: "teacher_focus_fixture",
      source_kind: sourceReviewItemId ? "review_draft" : "manual",
      source_review_item_id: sourceReviewItemId,
      status,
      title,
      updated_by: ownerId,
      visibility,
    }),
    "question_fixture_create_failed",
  );
  fixtures.questionIds.push(id);
  return id;
}

async function addQuestionImageFixture(
  fixtures,
  questionId,
  ownerId,
  runId,
  label,
) {
  const storagePath = `teacher-focus/${runId}/${questionId}.png`;
  fixtures.questionAssetPaths.push(storagePath);
  assertNoError(
    await fixtures.service.storage
      .from("question-assets")
      .upload(
        storagePath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
        { contentType: "image/png", upsert: false },
      ),
    "question_asset_storage_fixture_create_failed",
  );
  const id = await insertOne(
    fixtures.service.from("question_assets").insert({
      alt_text: label,
      asset_kind: "image",
      created_by: ownerId,
      display_on_detail: true,
      display_order: 0,
      label,
      question_id: questionId,
      storage_bucket: "question-assets",
      storage_path: storagePath,
    }),
    "question_asset_fixture_create_failed",
  );
  fixtures.questionAssetIds.push(id);
  return id;
}

async function addBankQuestion(fixtures, bankId, questionId, actorId) {
  const id = await insertOne(
    fixtures.service.from("bank_questions").insert({
      added_by: actorId,
      bank_id: bankId,
      metadata: { fixture_kind: fixtureKind },
      question_id: questionId,
      source_kind: "manual",
      status: "active",
    }),
    "bank_question_fixture_create_failed",
  );
  fixtures.bankQuestionIds.push(id);
  return id;
}

async function createReviewFixture({
  canaries,
  fixtures,
  organizationId,
  ownerBankId,
  ownerId,
  runId,
}) {
  const questionId = await createQuestion({
    canaries,
    code: `TEACHER-FOCUS-REVIEW-${runId}`,
    fixtures,
    organizationId,
    ownerBankId,
    ownerId,
    status: "draft",
    title: "Focused Review Draft fixture",
    visibility: "private",
    withLongMathContent: true,
  });
  await addQuestionImageFixture(
    fixtures,
    questionId,
    ownerId,
    runId,
    "Focused Review image",
  );
  const reviewBatchId = await insertOne(
    fixtures.service.from("review_batches").insert({
      created_by: ownerId,
      organization_id: organizationId,
      source_kind: "manual",
      status: "pending_review",
      summary: {
        privateEvidence: canaries.evidence,
        privateSourcePath: canaries.path,
      },
      target_bank_id: ownerBankId,
      title: "Focused Review Draft fixture",
    }),
    "review_batch_fixture_create_failed",
  );
  fixtures.reviewBatchIds.push(reviewBatchId);
  const reviewItemId = await insertOne(
    fixtures.service.from("review_draft_items").insert({
      created_question_id: questionId,
      draft_payload: {
        privateEvidence: canaries.evidence,
        privateFilename: canaries.filename,
        privateLineage: canaries.lineage,
        privateSourcePath: canaries.path,
      },
      item_kind: "question",
      review_batch_id: reviewBatchId,
      status: "pending_review",
      target_bank_id: ownerBankId,
      validation_warnings: [
        `source_path:${canaries.path}`,
        `private_filename:${canaries.filename}`,
      ],
    }),
    "review_item_fixture_create_failed",
  );
  fixtures.reviewItemIds.push(reviewItemId);
  assertNoError(
    await fixtures.service
      .from("questions")
      .update({
        source_kind: "review_draft",
        source_review_item_id: reviewItemId,
      })
      .eq("id", questionId),
    "review_question_lineage_fixture_update_failed",
  );
  const sourceFileId = await insertOne(
    fixtures.service.from("question_source_files").insert({
      created_by: ownerId,
      mime_type: "application/pdf",
      object_path: canaries.path,
      original_filename: canaries.filename,
      question_id: questionId,
      size_bytes: 128,
      status: "ready",
    }),
    "source_file_fixture_create_failed",
  );
  fixtures.sourceFileIds.push(sourceFileId);
  return { questionId, reviewItemId };
}

async function createMismatchReviewFixture({
  fixtures,
  organizationId,
  ownerBankId,
  ownerId,
  runId,
}) {
  const mismatchQuestionId = await createQuestion({
    code: `TEACHER-FOCUS-MISMATCH-${runId}`,
    fixtures,
    organizationId,
    ownerBankId,
    ownerId,
    status: "draft",
    title: "Mismatched lineage fixture",
    visibility: "private",
  });
  const decoyQuestionId = await createQuestion({
    code: `TEACHER-FOCUS-DECOY-${runId}`,
    fixtures,
    organizationId,
    ownerBankId,
    ownerId,
    status: "archived",
    title: "Lineage decoy fixture",
    visibility: "private",
  });
  const reviewBatchId = await insertOne(
    fixtures.service.from("review_batches").insert({
      created_by: ownerId,
      organization_id: organizationId,
      source_kind: "manual",
      status: "pending_review",
      summary: { fixture_kind: fixtureKind },
      target_bank_id: ownerBankId,
      title: "Mismatched lineage fixture",
    }),
    "mismatch_review_batch_fixture_create_failed",
  );
  fixtures.reviewBatchIds.push(reviewBatchId);
  const mismatchReviewItemId = await insertOne(
    fixtures.service.from("review_draft_items").insert({
      created_question_id: decoyQuestionId,
      draft_payload: { fixture_kind: fixtureKind },
      item_kind: "question",
      review_batch_id: reviewBatchId,
      status: "pending_review",
      target_bank_id: ownerBankId,
      validation_warnings: [],
    }),
    "mismatch_review_item_fixture_create_failed",
  );
  fixtures.reviewItemIds.push(mismatchReviewItemId);
  assertNoError(
    await fixtures.service
      .from("questions")
      .update({
        source_kind: "review_draft",
        source_review_item_id: mismatchReviewItemId,
      })
      .eq("id", mismatchQuestionId),
    "mismatch_review_lineage_fixture_update_failed",
  );
  return { mismatchQuestionId, mismatchReviewItemId };
}

async function createMissingImportLineageFixture({
  fixtures,
  organizationId,
  ownerBankId,
  ownerId,
  runId,
}) {
  const questionId = await createQuestion({
    code: `TEACHER-FOCUS-MISSING-LINEAGE-${runId}`,
    fixtures,
    organizationId,
    ownerBankId,
    ownerId,
    status: "draft",
    title: "Missing import lineage fixture",
    visibility: "private",
  });
  const importBatchId = await insertOne(
    fixtures.service.from("import_batches").insert({
      created_by: ownerId,
      organization_id: organizationId,
      source_type: "manual_json",
      status: "imported",
      summary: { fixture_kind: fixtureKind },
      target_bank_id: ownerBankId,
    }),
    "missing_lineage_import_batch_fixture_create_failed",
  );
  fixtures.importBatchIds.push(importBatchId);
  const importBatchItemId = await insertOne(
    fixtures.service.from("import_batch_items").insert({
      batch_id: importBatchId,
      created_question_id: questionId,
      item_index: 0,
      normalized_question_json: { fixture_kind: fixtureKind },
      raw_payload: { fixture_kind: fixtureKind },
      status: "imported",
      validation_errors: [],
    }),
    "missing_lineage_import_item_fixture_create_failed",
  );
  fixtures.importBatchItemIds.push(importBatchItemId);
  return { questionId };
}

async function createFixtures(fixtures) {
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const canaries = {
    evidence: `PRIVATE_EVIDENCE_${runId}`,
    filename: `PRIVATE_FILENAME_${runId}.pdf`,
    lineage: `PRIVATE_LINEAGE_${runId}`,
    path: `private/source/${runId}/PRIVATE_PATH_${runId}.pdf`,
  };
  const primaryOrganizationId = await createOrganization(
    fixtures,
    runId,
    "primary",
  );
  const outsideOrganizationId = await createOrganization(
    fixtures,
    runId,
    "outside",
  );
  const owner = await createActor({
    fixtures,
    label: "owner",
    organizationId: primaryOrganizationId,
    organizationRole: "teacher",
    profileRole: "teacher",
    runId,
  });
  const editor = await createActor({
    fixtures,
    label: "editor",
    organizationId: primaryOrganizationId,
    organizationRole: "teacher",
    profileRole: "teacher",
    runId,
  });
  const viewer = await createActor({
    fixtures,
    label: "viewer",
    organizationId: primaryOrganizationId,
    organizationRole: "teacher",
    profileRole: "teacher",
    runId,
  });
  const inactive = await createActor({
    fixtures,
    label: "inactive",
    organizationId: primaryOrganizationId,
    organizationRole: "teacher",
    profileRole: "teacher",
    runId,
  });
  const organizationReader = await createActor({
    fixtures,
    label: "organization-reader",
    organizationId: primaryOrganizationId,
    organizationRole: "teacher",
    profileRole: "teacher",
    runId,
  });
  const organizationAdmin = await createActor({
    fixtures,
    label: "organization-admin",
    organizationId: primaryOrganizationId,
    organizationRole: "admin",
    profileRole: "admin",
    runId,
  });
  const platformAdmin = await createActor({
    fixtures,
    label: "platform-admin",
    organizationId: primaryOrganizationId,
    organizationRole: "admin",
    profileRole: "super_admin",
    runId,
  });
  const outsider = await createActor({
    fixtures,
    label: "outsider",
    organizationId: outsideOrganizationId,
    organizationRole: "teacher",
    profileRole: "teacher",
    runId,
  });
  const student = await createActor({
    fixtures,
    label: "student",
    organizationId: primaryOrganizationId,
    organizationRole: "student",
    profileRole: "student",
    runId,
  });

  const privateBankId = await createBank({
    fixtures,
    name: `Teacher focus private ${runId}`,
    organizationId: primaryOrganizationId,
    ownerId: owner.id,
    visibility: "private",
  });
  const organizationBankId = await createBank({
    fixtures,
    name: `Teacher focus organization ${runId}`,
    organizationId: primaryOrganizationId,
    ownerId: owner.id,
    visibility: "organization",
  });
  await addBankMember(fixtures, privateBankId, owner.id, "owner", "active");
  await addBankMember(fixtures, privateBankId, editor.id, "editor", "active");
  await addBankMember(fixtures, privateBankId, viewer.id, "viewer", "active");
  await addBankMember(fixtures, privateBankId, inactive.id, "editor", "removed");
  await addBankMember(
    fixtures,
    organizationBankId,
    owner.id,
    "owner",
    "active",
  );

  const privateQuestionId = await createQuestion({
    canaries,
    code: `TEACHER-FOCUS-${runId}`,
    fixtures,
    organizationId: primaryOrganizationId,
    ownerBankId: privateBankId,
    ownerId: owner.id,
    title: "Focused Question fixture",
    visibility: "private",
    withLongMathContent: true,
  });
  await addQuestionImageFixture(
    fixtures,
    privateQuestionId,
    owner.id,
    runId,
    "Focused Question image",
  );
  const privateBankQuestionId = await addBankQuestion(
    fixtures,
    privateBankId,
    privateQuestionId,
    owner.id,
  );
  const nextQuestionId = await createQuestion({
    code: `TEACHER-FOCUS-NEXT-${runId}`,
    fixtures,
    organizationId: primaryOrganizationId,
    ownerBankId: privateBankId,
    ownerId: owner.id,
    title: "Focused Next Question fixture",
    visibility: "private",
  });
  const nextBankQuestionId = await addBankQuestion(
    fixtures,
    privateBankId,
    nextQuestionId,
    owner.id,
  );
  const organizationQuestionId = await createQuestion({
    code: `TEACHER-FOCUS-ORG-${runId}`,
    fixtures,
    organizationId: primaryOrganizationId,
    ownerBankId: organizationBankId,
    ownerId: owner.id,
    title: "Organization Question fixture",
    visibility: "organization",
  });
  const organizationBankQuestionId = await addBankQuestion(
    fixtures,
    organizationBankId,
    organizationQuestionId,
    owner.id,
  );
  const review = await createReviewFixture({
    canaries,
    fixtures,
    organizationId: primaryOrganizationId,
    ownerBankId: privateBankId,
    ownerId: owner.id,
    runId,
  });
  const mismatchReview = await createMismatchReviewFixture({
    fixtures,
    organizationId: primaryOrganizationId,
    ownerBankId: privateBankId,
    ownerId: owner.id,
    runId,
  });
  const missingImportLineage = await createMissingImportLineageFixture({
    fixtures,
    organizationId: primaryOrganizationId,
    ownerBankId: privateBankId,
    ownerId: owner.id,
    runId,
  });

  return {
    actors: {
      editor,
      inactive,
      organizationAdmin,
      organizationReader,
      outsider,
      owner,
      platformAdmin,
      student,
      viewer,
    },
    canaries,
    fixtures,
    organizationBankId,
    organizationBankQuestionId,
    mismatchQuestionId: mismatchReview.mismatchQuestionId,
    mismatchReviewItemId: mismatchReview.mismatchReviewItemId,
    missingImportLineageQuestionId: missingImportLineage.questionId,
    nextBankQuestionId,
    nextQuestionId,
    privateMarkers: [
      `TEACHER-FOCUS-${runId}`,
      `Teacher focus private ${runId}`,
      "Focused Question fixture",
      "Focused Review Draft fixture",
      "What is 1 + 1?",
      "Add the two ones.",
    ],
    privateBankId,
    privateBankQuestionId,
    reviewItemId: review.reviewItemId,
    reviewQuestionId: review.questionId,
  };
}

async function signIn(page, baseUrl, actor, next = "/teacher") {
  await page.goto(
    `${baseUrl}/auth/login?next=${encodeURIComponent(next)}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.getByLabel("Username", { exact: true }).fill(actor.username);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/auth/login")),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

async function waitForValue(readValue, predicate, message, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await readValue();
    if (predicate(value)) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(message);
}

function previewUrl(baseUrl, bankId, bankQuestionId) {
  return `${baseUrl}/teacher/banks/${bankId}/questions/${bankQuestionId}/preview`;
}

async function assertRolePreview({
  actor,
  bankId,
  bankQuestionId,
  baseUrl,
  browser,
  expectedAccess,
  expectedCapability,
}) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, baseUrl, actor);
    const response = await page.goto(
      previewUrl(baseUrl, bankId, bankQuestionId),
      { waitUntil: "domcontentloaded" },
    );
    assert(response?.status() === 200, "authorized_teacher_preview_failed");
    await page.getByRole("heading", {
      name: /Question fixture/,
    }).waitFor();
    await page.getByText(expectedAccess, { exact: true }).waitFor();
    await page.getByText(expectedCapability, { exact: true }).waitFor();
  } finally {
    await context.close();
  }
}

async function assertDeniedPreview({
  actor,
  bankId,
  bankQuestionId,
  baseUrl,
  browser,
  contract,
  expected,
}) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, baseUrl, actor);
    const questionUrl = previewUrl(baseUrl, bankId, bankQuestionId);
    const reviewUrl = `${baseUrl}/teacher/banks/${bankId}/review/${contract.reviewItemId}`;
    await assertDeniedResponseBoundary({
      context,
      contract,
      url: questionUrl,
    });
    await assertDeniedResponseBoundary({
      context,
      contract,
      url: reviewUrl,
    });
    const response = await page.goto(questionUrl, {
      waitUntil: "domcontentloaded",
    });
    if (expected === "student") {
      await page
        .waitForURL((url) => url.pathname === "/unauthorized", {
          timeout: 5000,
        })
        .catch(() => {});
      assert(
        new URL(page.url()).pathname === "/unauthorized",
        "student_teacher_route_not_denied",
      );
    } else {
      await page
        .waitForFunction(
          () =>
            document.body.innerText.includes("404") ||
            document.body.innerText.includes("This page could not be found"),
          undefined,
          { timeout: 5000 },
        )
        .catch(() => {});
      const body = await page.content();
      const visibleText = await page.locator("body").innerText();
      const streamedNotFound =
        visibleText.includes("404") &&
        visibleText.includes("This page could not be found");
      const serializedNotFound =
        body.includes("NEXT_HTTP_ERROR_FALLBACK;404") ||
        (body.includes("404") &&
          body.includes("This page could not be found"));
      assertNoPrivatePayload(body, contract, "denied_body_leaked");
      assert(
        response?.status() === 404 || streamedNotFound || serializedNotFound,
        "private_bank_actor_not_hidden",
      );
    }
  } finally {
    await context.close();
  }
}

async function assertLineageGates({
  anonKey,
  baseUrl,
  browser,
  contract,
  supabaseUrl,
}) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, baseUrl, contract.actors.owner);
    await page.goto(
      `${baseUrl}/teacher/banks/${contract.privateBankId}/review?q=Mismatched`,
      { waitUntil: "domcontentloaded" },
    );
    const draft = page.locator("article").filter({
      hasText: "Mismatched lineage fixture",
    });
    await draft
      .getByText("Lineage repair required", { exact: true })
      .waitFor();
    await draft
      .getByText("More review actions and supporting details", { exact: true })
      .click();
    await draft
      .getByText(/Approval is blocked until this draft is relinked/)
      .waitFor();
    assert(
      (await draft
        .getByRole("button", { name: "Approve into Library", exact: true })
        .count()) === 0,
      "mismatched_lineage_approval_button_exposed",
    );
  } finally {
    await context.close();
  }

  const ownerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signInResult = await ownerClient.auth.signInWithPassword({
    email: contract.actors.owner.email,
    password: contract.actors.owner.password,
  });
  assert(!signInResult.error, "mismatch_rpc_actor_signin_failed");
  try {
    const { data, error } = await ownerClient.rpc(
      "approve_bank_review_question",
      {
        p_target_bank_id: contract.privateBankId,
        p_target_question_id: contract.mismatchQuestionId,
      },
    );
    assert(
      Boolean(error) && !data?.[0]?.bank_question_id,
      "mismatched_lineage_rpc_not_blocked",
    );
    const missingResult = await ownerClient.rpc(
      "approve_bank_review_question",
      {
        p_target_bank_id: contract.privateBankId,
        p_target_question_id: contract.missingImportLineageQuestionId,
      },
    );
    assert(
      Boolean(missingResult.error) &&
        !missingResult.data?.[0]?.bank_question_id,
      "missing_import_lineage_rpc_not_blocked",
    );
    const { count, error: countError } = await ownerClient
      .from("bank_questions")
      .select("id", { count: "exact", head: true })
      .eq("bank_id", contract.privateBankId)
      .in("question_id", [
        contract.mismatchQuestionId,
        contract.missingImportLineageQuestionId,
      ]);
    assert(!countError && count === 0, "blocked_lineage_wrote_bank_question");
  } finally {
    await ownerClient.auth.signOut().catch(() => {});
  }
}

async function assertValidLineageApproval({
  anonKey,
  contract,
  supabaseUrl,
}) {
  const ownerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signInResult = await ownerClient.auth.signInWithPassword({
    email: contract.actors.owner.email,
    password: contract.actors.owner.password,
  });
  assert(!signInResult.error, "valid_lineage_rpc_actor_signin_failed");
  try {
    const { data, error } = await ownerClient.rpc(
      "approve_bank_review_question",
      {
        p_target_bank_id: contract.privateBankId,
        p_target_question_id: contract.reviewQuestionId,
      },
    );
    assert(
      !error &&
        data?.length === 1 &&
        data[0].bank_question_id &&
        data[0].source_review_item_id === contract.reviewItemId,
      "valid_bidirectional_lineage_approval_failed",
    );
    const { data: approvedQuestion, error: approvedQuestionError } =
      await ownerClient
        .from("questions")
        .select("id, owner_bank_id, source_review_item_id, status, published_at")
        .eq("id", contract.reviewQuestionId)
        .single();
    assert(
      !approvedQuestionError &&
        approvedQuestion.owner_bank_id === contract.privateBankId &&
        approvedQuestion.source_review_item_id === contract.reviewItemId &&
        approvedQuestion.status !== "published" &&
        !approvedQuestion.published_at,
      "valid_lineage_approval_broke_private_review_contract",
    );
  } finally {
    await ownerClient.auth.signOut().catch(() => {});
  }
}

function assertNoCanaries(text, canaries, message) {
  for (const canary of Object.values(canaries)) {
    assert(!text.includes(canary), message);
  }
}

function assertNoPrivatePayload(text, contract, message) {
  assertNoCanaries(text, contract.canaries, message);
  for (const marker of contract.privateMarkers) {
    assert(!text.includes(marker), message);
  }
}

function assertSafeFocusHeaders(headers) {
  const cacheControl = headers["cache-control"] ?? "";
  assert(
    expectProductionHeaders
      ? cacheControl.includes("no-store")
      : cacheControl.includes("no-store") ||
          cacheControl === "no-cache, must-revalidate",
    "focus_route_cache_header_missing",
  );
  assert(
    headers["referrer-policy"] === "no-referrer",
    "focus_route_referrer_header_missing",
  );
  assert(
    headers["x-robots-tag"]?.includes("noindex"),
    "focus_route_robots_header_missing",
  );
}

async function assertResponseBoundary({
  canaries,
  context,
  expectedStatus = 200,
  url,
}) {
  const response = await context.request.get(url, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  assert(response.status() === expectedStatus, "route_response_status_invalid");
  if (expectedStatus === 200) {
    assertSafeFocusHeaders(response.headers());
  }
  assertNoCanaries(
    await response.text(),
    canaries,
    "focus_route_response_canary_leak",
  );

  if (expectedStatus === 200) {
    const flightResponse = await context.request.get(url, {
      failOnStatusCode: false,
      headers: { RSC: "1" },
      maxRedirects: 0,
    });
    assert(
      flightResponse.status() === expectedStatus,
      "focus_route_flight_status_invalid",
    );
    assertNoCanaries(
      await flightResponse.text(),
      canaries,
      "focus_route_flight_canary_leak",
    );
  }
}

async function assertDeniedResponseBoundary({ context, contract, url }) {
  for (const headers of [{}, { RSC: "1" }]) {
    const response = await context.request.get(url, {
      failOnStatusCode: false,
      headers,
      maxRedirects: 0,
    });
    assert(
      [200, 307, 308, 404].includes(response.status()),
      "denied_focus_route_status_invalid",
    );
    assertSafeFocusHeaders(response.headers());
    assertNoPrivatePayload(
      await response.text(),
      contract,
      "denied_focus_route_payload_leak",
    );
  }
}

function pathAndSearch(value) {
  const parsed = new URL(value);
  return `${parsed.pathname}${parsed.search}`;
}

async function runSameTabSurfaceJourney({
  baseUrl,
  context,
  contract,
  page,
  surface,
}) {
  const isReview = surface === "review";
  const listPath =
    `/teacher/banks/${contract.privateBankId}/${isReview ? "review" : "questions"}` +
    "?q=Focused";
  const triggerId = isReview
    ? `review-preview-${contract.reviewItemId}`
    : `question-preview-${contract.privateBankQuestionId}`;
  const expectedPreviewPath = isReview
    ? `/teacher/banks/${contract.privateBankId}/review/${contract.reviewItemId}`
    : `/teacher/banks/${contract.privateBankId}/questions/${contract.privateBankQuestionId}/preview`;
  const selectedItemName = isReview
    ? /Select .*Focused Review Draft fixture/
    : /Select .*Focused Question fixture/;
  const headingName = isReview
    ? "Focused Review Draft fixture"
    : "Focused Question fixture";
  const returnLabel = isReview
    ? "Back to Review list"
    : "Back to Library list";

  await page.goto(`${baseUrl}${listPath}`, {
    waitUntil: "domcontentloaded",
  });
  const selectedItem = page.getByRole("checkbox", {
    name: selectedItemName,
  });
  await selectedItem.check();
  const bulkBar = page.getByRole("region", { name: "Bulk actions" });
  await bulkBar.getByText(/1 selected on this page/).waitFor();

  const trigger = page.locator(`#${triggerId}`);
  assert((await trigger.count()) === 1, `${surface}_preview_trigger_missing`);
  assert(
    (await trigger.getAttribute("target")) === null &&
      !`${(await trigger.getAttribute("aria-label")) ?? ""} ${(await trigger.textContent()) ?? ""}`
        .toLowerCase()
        .includes("new tab"),
    `${surface}_primary_preview_must_stay_in_current_tab`,
  );
  await trigger.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "auto" }),
  );
  await trigger.focus();
  const scrollBeforePreview = await page.evaluate(() => window.scrollY);
  const pageCountBeforePreview = context
    .pages()
    .filter((candidate) => !candidate.isClosed()).length;

  await Promise.all([
    page.waitForURL(
      (url) => url.pathname === expectedPreviewPath,
      { timeout: 15_000 },
    ),
    trigger.click(),
  ]);
  assert(
    context.pages().filter((candidate) => !candidate.isClosed()).length ===
      pageCountBeforePreview,
    `${surface}_primary_preview_opened_another_tab`,
  );
  const previewLocation = new URL(page.url());
  assert(
    previewLocation.pathname === expectedPreviewPath &&
      !previewLocation.searchParams.has("q") &&
      previewLocation.searchParams.get("returnTo") === listPath,
    `${surface}_same_tab_preview_return_state_invalid`,
  );
  assertNoCanaries(
    await page.content(),
    contract.canaries,
    `${surface}_preview_html_canary_leak`,
  );
  await page.getByRole("heading", { name: headingName, exact: true }).waitFor();
  await page.getByText("Read-only preview", { exact: true }).waitFor();
  await waitForValue(
    () => page.evaluate(() => document.activeElement?.id ?? ""),
    (value) => value === "focus-workspace-main",
    `${surface}_preview_main_focus_missing`,
  );

  const storedUiState = await page.evaluate(() =>
    Object.entries(sessionStorage),
  );
  assertNoPrivatePayload(
    JSON.stringify(storedUiState),
    contract,
    `${surface}_private_content_persisted_in_session_storage`,
  );

  await Promise.all([
    page.waitForURL(
      (url) => `${url.pathname}${url.search}` === listPath,
      { timeout: 15_000 },
    ),
    page.getByRole("link", { name: returnLabel, exact: true }).click(),
  ]);
  assert(
    pathAndSearch(page.url()) === listPath,
    `${surface}_return_url_not_restored`,
  );
  await waitForValue(
    () => selectedItem.isChecked(),
    (checked) => checked,
    `${surface}_selection_not_restored`,
  );
  await page
    .getByRole("region", { name: "Bulk actions" })
    .getByText(/1 selected on this page/)
    .waitFor({ timeout: 8_000 });
  await waitForValue(
    () => page.evaluate(() => document.activeElement?.id ?? ""),
    (value) => value === triggerId,
    `${surface}_return_focus_not_restored`,
  );
  await waitForValue(
    () => page.evaluate(() => window.scrollY),
    (scrollY) => Math.abs(scrollY - scrollBeforePreview) <= 96,
    `${surface}_return_scroll_not_restored`,
  );

  console.log(
    `PASS Chromium ${surface} same-tab preview, exact URL, selection, scroll, and focus restore`,
  );
}

async function runBrowserJourney(browser, contract, baseUrl) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 900, width: 1024 },
  });
  const page = await context.newPage();
  const requestedUrls = [];
  context.on("request", (request) => {
    requestedUrls.push(request.url());
  });
  try {
    await signIn(page, baseUrl, contract.actors.owner);
    for (const surface of ["question", "review"]) {
      await runSameTabSurfaceJourney({
        baseUrl,
        context,
        contract,
        page,
        surface,
      });
    }

    await assertResponseBoundary({
      canaries: contract.canaries,
      context,
      url: previewUrl(
        baseUrl,
        contract.privateBankId,
        contract.privateBankQuestionId,
      ),
    });
    await assertResponseBoundary({
      canaries: contract.canaries,
      context,
      url: `${baseUrl}/teacher/banks/${contract.privateBankId}/review/${contract.reviewItemId}`,
    });
    assertNoCanaries(
      requestedUrls.join("\n"),
      contract.canaries,
      "focus_route_network_url_canary_leak",
    );
  } finally {
    await context.close();
  }
}

async function runResponsiveLayoutJourney({ baseUrl, browser, contract }) {
  const viewports = [
    { height: 812, width: 375 },
    { height: 900, width: 768 },
    { height: 900, width: 1024 },
    { height: 1000, width: 1440 },
  ];
  const surfaces = [
    {
      heading: "Focused Question fixture",
      returnLabel: "Back to Library list",
      url: previewUrl(
        baseUrl,
        contract.privateBankId,
        contract.privateBankQuestionId,
      ),
    },
    {
      heading: "Focused Review Draft fixture",
      returnLabel: "Back to Review list",
      url: `${baseUrl}/teacher/banks/${contract.privateBankId}/review/${contract.reviewItemId}`,
    },
  ];
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: viewports[0],
  });
  const page = await context.newPage();

  try {
    await signIn(page, baseUrl, contract.actors.owner);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const surface of surfaces) {
        await page.goto(surface.url, { waitUntil: "domcontentloaded" });
        await page
          .getByRole("heading", { name: surface.heading, exact: true })
          .waitFor();
        await waitForValue(
          () => page.evaluate(() => document.activeElement?.id ?? ""),
          (value) => value === "focus-workspace-main",
          `${viewport.width}_${surface.heading}_main_focus_missing`,
        );
        const backLink = page.getByRole("link", {
          name: surface.returnLabel,
          exact: true,
        });
        await backLink.waitFor();
        const layout = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        const backLinkBox = await backLink.boundingBox();
        assert(
          layout.scrollWidth <= layout.clientWidth + 1,
          `${viewport.width}_${surface.heading}_horizontal_overflow`,
        );
        assert(
          backLinkBox &&
            backLinkBox.width >= 44 &&
            backLinkBox.height >= 44 &&
            backLinkBox.x >= -1 &&
            backLinkBox.x + backLinkBox.width <= viewport.width + 1,
          `${viewport.width}_${surface.heading}_return_control_clipped_${JSON.stringify(backLinkBox)}`,
        );
      }
      console.log(
        `PASS Chromium ${viewport.width}px question/review preview reflow`,
      );
    }
  } finally {
    await context.close();
  }
}

async function runNewTabSafetySmoke({ baseUrl, browser, contract }) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 900, width: 1024 },
  });
  const page = await context.newPage();
  const listPath =
    `/teacher/banks/${contract.privateBankId}/questions?q=Focused`;

  try {
    await signIn(page, baseUrl, contract.actors.owner);
    await page.goto(`${baseUrl}${listPath}`, {
      waitUntil: "domcontentloaded",
    });
    const trigger = page.locator(
      `#question-preview-${contract.privateBankQuestionId}`,
    );
    const row = page.locator("tr").filter({ has: trigger });
    await row.getByText("More", { exact: true }).click();
    const newTabLink = row.getByRole("link", {
      name: "Open preview in new tab",
      exact: true,
    });
    assert(
      (await newTabLink.getAttribute("target")) === "_blank" &&
        (await newTabLink.getAttribute("rel")) === "noopener noreferrer" &&
        (await newTabLink.getAttribute("referrerpolicy")) === "no-referrer",
      "secondary_new_tab_security_attributes_missing",
    );
    const parentUrl = page.url();
    const parentScrollY = await page.evaluate(() => window.scrollY);
    const [child] = await Promise.all([
      page.waitForEvent("popup"),
      newTabLink.click(),
    ]);
    await child.waitForLoadState("domcontentloaded");
    const childLocation = new URL(child.url());
    assert(
      childLocation.pathname ===
        `/teacher/banks/${contract.privateBankId}/questions/${contract.privateBankQuestionId}/preview` &&
        childLocation.searchParams.get("returnTo") === listPath &&
        !childLocation.searchParams.has("q") &&
        (await child.evaluate(() => window.opener === null)) &&
        (await child.evaluate(() => document.referrer)) === "",
      "secondary_new_tab_security_boundary_failed",
    );
    assertNoCanaries(
      child.url(),
      contract.canaries,
      "secondary_new_tab_url_canary_leak",
    );
    assert(
      page.url() === parentUrl &&
        (await page.evaluate(() => window.scrollY)) === parentScrollY,
      "secondary_new_tab_changed_parent_state",
    );
    await child.close();
    assert(
      context.pages().filter((candidate) => !candidate.isClosed()).length === 1,
      "secondary_new_tab_did_not_close_cleanly",
    );
    console.log(
      "PASS Chromium 1024px secondary new-tab noopener, no-referrer, and parent-state safety",
    );
  } finally {
    await context.close();
  }
}

async function runBulkInteractionJourney({
  baseUrl,
  browser,
  contract,
  engineName,
}) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 812, width: 375 },
  });
  const page = await context.newPage();
  let capturedFocusPost = null;
  let actionRequestSawInvalidBank = false;
  context.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (
      request.method() === "POST" &&
      requestUrl.pathname === "/api/teacher/focus-selections"
    ) {
      const form = new URLSearchParams(request.postData() ?? "");
      capturedFocusPost = {
        destination: form.get("destination"),
        method: request.method(),
        selectedIds: form.getAll("selectedId"),
        url: request.url(),
      };
    }
    if (
      request.method() === "POST" &&
      request.postData()?.includes("invalid-bank-id")
    ) {
      actionRequestSawInvalidBank = true;
    }
  });
  const readQuestionStatuses = async () => {
    const { data, error } = await contract.fixtures.service
      .from("bank_questions")
      .select("id,status")
      .in("id", [
        contract.privateBankQuestionId,
        contract.nextBankQuestionId,
      ]);
    assert(!error, `${engineName}_bulk_status_probe_failed`);
    return (data ?? [])
      .map((row) => ({ id: row.id, status: row.status }))
      .sort((left, right) => left.id.localeCompare(right.id));
  };

  try {
    await signIn(page, baseUrl, contract.actors.owner);
    const statusesBeforeFailure = await readQuestionStatuses();
    const listPath =
      `/teacher/banks/${contract.privateBankId}/questions?q=Focused`;
    await page.goto(`${baseUrl}${listPath}`, {
      waitUntil: "domcontentloaded",
    });

    const results = page.locator("#library-question-results-focus");
    await results.waitFor();
    assert(
      await results.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
      `${engineName}_bulk_questions_horizontal_overflow`,
    );

    const firstQuestion = page.getByRole("checkbox", {
      name: /Select .*Focused Question fixture/,
    });
    const secondQuestion = page.getByRole("checkbox", {
      name: /Select .*Focused Next Question fixture/,
    });
    const selectAll = page.getByRole("checkbox", {
      name: /Select all 2 eligible questions on this page/,
    });
    await firstQuestion.check();
    assert(
      (await selectAll.getAttribute("aria-checked")) === "mixed" &&
        (await selectAll.evaluate((element) => element.indeterminate)) === true,
      `${engineName}_bulk_select_all_not_mixed`,
    );
    await selectAll.check();
    assert(
      (await firstQuestion.isChecked()) && (await secondQuestion.isChecked()),
      `${engineName}_bulk_select_all_did_not_select_current_page`,
    );

    for (const control of [firstQuestion, secondQuestion, selectAll]) {
      const labelBox = await control.locator("xpath=..").boundingBox();
      assert(
        labelBox && labelBox.width >= 44 && labelBox.height >= 44,
        `${engineName}_bulk_checkbox_target_below_44px`,
      );
    }

    const bulkBar = page.getByRole("region", { name: "Bulk actions" });
    await bulkBar.waitFor();
    const reserve = await bulkBar.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        marginBottom: Number.parseFloat(style.marginBottom),
      };
    });
    assert(
      reserve.marginBottom >= reserve.height,
      `${engineName}_bulk_bar_bottom_reserve_too_small`,
    );

    const archiveTrigger = bulkBar.getByRole("button", {
      name: "Archive",
      exact: true,
    });
    await archiveTrigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    assert(
      (await page.evaluate(() => document.activeElement?.textContent?.trim())) ===
        "Cancel",
      `${engineName}_bulk_dialog_cancel_not_initial_focus`,
    );
    const cancelBox = await cancel.boundingBox();
    const closeBox = await dialog
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox();
    assert(
      cancelBox &&
        cancelBox.height >= 44 &&
        closeBox &&
        closeBox.width >= 44 &&
        closeBox.height >= 44,
      `${engineName}_bulk_dialog_targets_below_44px_${JSON.stringify({
        cancelBox,
        closeBox,
      })}`,
    );

    const archiveConfirm = dialog.getByRole("button", {
      name: "Archive 2 questions",
      exact: true,
    });
    await page.evaluate(() => {
      const bankId = document.querySelector(
        '#question-bulk-management-form input[name="bankId"]',
      );
      if (bankId instanceof HTMLInputElement) {
        bankId.value = "invalid-bank-id";
      }
    });
    assert(
      (await page
        .locator('#question-bulk-management-form input[name="bankId"]')
        .inputValue()) === "invalid-bank-id",
      `${engineName}_bulk_invalid_bank_fixture_not_applied`,
    );
    await archiveConfirm.click();
    const resultId = "question-bulk-management-form-result";
    try {
      await page.locator(`#${resultId}`).waitFor({ timeout: 15_000 });
    } catch {
      const statuses = await contract.fixtures.service
        .from("bank_questions")
        .select("status")
        .in("id", [
          contract.privateBankQuestionId,
          contract.nextBankQuestionId,
        ]);
      throw new Error(
        `${engineName}_bulk_action_result_missing_${JSON.stringify({
          actionRequestSawInvalidBank,
          checked: [
            await firstQuestion.isChecked(),
            await secondQuestion.isChecked(),
          ],
          dialogCount: await page.getByRole("dialog").count(),
          resultCount: await page.locator(`#${resultId}`).count(),
          statuses: statuses.data?.map((row) => row.status),
          url: page.url(),
        })}`,
      );
    }
    await page.waitForFunction(
      (id) => document.activeElement?.id === id,
      resultId,
      { timeout: 8_000 },
    );
    const failureState = {
      dialogCount: await page.getByRole("dialog").count(),
      firstChecked: await firstQuestion.isChecked(),
      secondChecked: await secondQuestion.isChecked(),
    };
    assert(
      failureState.dialogCount === 0 &&
        failureState.firstChecked &&
        failureState.secondChecked,
      `${engineName}_bulk_failure_must_close_dialog_and_preserve_selection_${JSON.stringify(failureState)}`,
    );
    assert(
      await page.locator(`#${resultId}`).evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight;
      }),
      `${engineName}_bulk_failure_result_not_scrolled_into_view`,
    );
    const statusesAfterFailure = await readQuestionStatuses();
    assert(
      JSON.stringify(statusesAfterFailure) ===
        JSON.stringify(statusesBeforeFailure),
      `${engineName}_bulk_failure_changed_database_state`,
    );
    await page
      .locator('#question-bulk-management-form input[name="bankId"]')
      .evaluate((element, bankId) => {
        if (element instanceof HTMLInputElement) element.value = bankId;
      }, contract.privateBankId);

    const previewTrigger = page.locator("#question-bulk-preview");
    await waitForValue(
      () => previewTrigger.isEnabled(),
      (enabled) => enabled,
      `${engineName}_bulk_preview_not_enabled`,
    );
    await previewTrigger.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "auto" }),
    );
    await previewTrigger.focus();
    const scrollBeforePreview = await page.evaluate(() => window.scrollY);
    const pageCountBeforePreview = context
      .pages()
      .filter((candidate) => !candidate.isClosed()).length;
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.pathname ===
          `/teacher/banks/${contract.privateBankId}/questions/preview`,
        { timeout: 15_000 },
      ),
      previewTrigger.click(),
    ]);
    assert(
      context.pages().filter((candidate) => !candidate.isClosed()).length ===
        pageCountBeforePreview,
      `${engineName}_bulk_preview_opened_another_tab`,
    );
    await page
      .getByRole("heading", { name: "Preview 2 selected questions" })
      .waitFor({ timeout: 15_000 });
    const previewLocation = new URL(page.url());
    const receiptId = previewLocation.searchParams.get("selection");
    assert(
      capturedFocusPost?.method === "POST" &&
        capturedFocusPost.destination === "question_preview" &&
        capturedFocusPost.selectedIds.length === 2 &&
        capturedFocusPost.selectedIds.includes(
          contract.privateBankQuestionId,
        ) &&
        capturedFocusPost.selectedIds.includes(contract.nextBankQuestionId) &&
        !capturedFocusPost.url.includes(contract.privateBankQuestionId) &&
        !capturedFocusPost.url.includes(contract.nextBankQuestionId) &&
        previewLocation.pathname ===
          `/teacher/banks/${contract.privateBankId}/questions/preview` &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          receiptId ?? "",
        ) &&
        previewLocation.searchParams.get("returnTo") === listPath &&
        !previewLocation.searchParams.has("selected") &&
        !page.url().includes(contract.privateBankQuestionId) &&
        !page.url().includes(contract.nextBankQuestionId),
      `${engineName}_bulk_preview_did_not_use_opaque_post_receipt`,
    );
    await page
      .getByText("Question 1 of 2", { exact: true })
      .waitFor({ timeout: 8_000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByText("Question 2 of 2", { exact: true })
      .waitFor({ timeout: 8_000 });
    await page.locator("#preview-queue-jump").selectOption("0");
    await page
      .getByText("Question 1 of 2", { exact: true })
      .waitFor({ timeout: 8_000 });
    await Promise.all([
      page.waitForURL(
        (url) => `${url.pathname}${url.search}` === listPath,
        { timeout: 15_000 },
      ),
      page
        .getByRole("link", {
          name: "Back to Library list",
          exact: true,
        })
        .click(),
    ]);
    assert(
      pathAndSearch(page.url()) === listPath,
      `${engineName}_bulk_return_url_not_restored`,
    );
    await waitForValue(
      async () => ({
        first: await firstQuestion.isChecked(),
        second: await secondQuestion.isChecked(),
      }),
      (selection) => selection.first && selection.second,
      `${engineName}_bulk_selection_not_restored`,
    );
    await page
      .getByRole("region", { name: "Bulk actions" })
      .getByText(/2 selected on this page/)
      .waitFor({ timeout: 8_000 });
    await waitForValue(
      () => page.evaluate(() => document.activeElement?.id ?? ""),
      (value) => value === "question-bulk-preview",
      `${engineName}_bulk_preview_focus_not_restored`,
    );
    await waitForValue(
      () => page.evaluate(() => window.scrollY),
      (scrollY) => Math.abs(scrollY - scrollBeforePreview) <= 96,
      `${engineName}_bulk_preview_scroll_not_restored`,
    );

    console.log(
      `PASS ${engineName} bulk 375px selection, zero-write failure, same-tab receipt queue, URL, scroll, and focus restore`,
    );
  } finally {
    await context.close();
  }
}

async function assertViewerManagementBoundaries({
  baseUrl,
  browser,
  contract,
}) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 900, width: 1280 },
  });
  const page = await context.newPage();

  try {
    await signIn(page, baseUrl, contract.actors.viewer);
    await page.goto(
      `${baseUrl}/teacher/banks/${contract.privateBankId}`,
      { waitUntil: "domcontentloaded" },
    );
    await page
      .getByRole("heading", { level: 1 })
      .waitFor({ timeout: 10_000 });
    const viewerManagementEntryCounts = {
      createAssignment: await page
        .getByRole("link", { name: "Create Assignment", exact: true })
        .count(),
      createAssignmentLower: await page
        .getByRole("link", { name: "Create assignment", exact: true })
        .count(),
      importHref: await page
        .locator(`a[href="/teacher/banks/${contract.privateBankId}/imports"]`)
        .count(),
      importMaterial: await page
        .getByRole("link", { name: "Import Material", exact: true })
        .count(),
    };
    assert(
      Object.values(viewerManagementEntryCounts).every((count) => count === 0),
      `viewer_library_exposes_management_entrypoint_${JSON.stringify(viewerManagementEntryCounts)}`,
    );

    const directImportResponse = await page.goto(
      `${baseUrl}/teacher/banks/${contract.privateBankId}/imports`,
      { waitUntil: "domcontentloaded" },
    );
    const importRendersNotFound = await page
      .getByText("This page could not be found.", { exact: true })
      .count();
    assert(
      (directImportResponse?.status() === 404 || importRendersNotFound > 0) &&
        (await page
          .getByRole("navigation", { name: "Library import modes" })
          .count()) === 0,
      "viewer_direct_import_route_must_be_not_found",
    );

    await page.goto(
      `${baseUrl}/teacher/publish?sourceBankId=${contract.privateBankId}`,
      { waitUntil: "domcontentloaded" },
    );
    await page
      .getByText("No manageable source Libraries", { exact: true })
      .waitFor({ timeout: 10_000 });
    assert(
      (await page.locator("#publish-center-form").count()) === 0 &&
        (await page.locator("#sourceBankId").count()) === 0,
      "viewer_publish_route_exposes_library_editor",
    );

    const directAssignmentResponse = await page.goto(
      `${baseUrl}/teacher/banks/${contract.privateBankId}/assignments/new`,
      { waitUntil: "domcontentloaded" },
    );
    const rendersNotFound = await page
      .getByText("This page could not be found.", { exact: true })
      .count();
    assert(
      (directAssignmentResponse?.status() === 404 || rendersNotFound > 0) &&
        (await page.locator("#bank-assignment-create-form").count()) === 0,
      "viewer_direct_assignment_route_must_be_not_found",
    );
    console.log(
      "PASS viewer Library UI, publish source filtering, and direct assignment route share one read-only boundary",
    );
  } finally {
    await context.close();
  }
}

async function cleanup(fixtures) {
  let clean = true;
  async function remove(table, ids) {
    if (!ids.length) return;
    const { error } = await fixtures.service.from(table).delete().in("id", ids);
    if (error) clean = false;
  }

  await remove("question_source_files", fixtures.sourceFileIds);
  if (fixtures.questionAssetPaths.length) {
    const { error: storageError } = await fixtures.service.storage
      .from("question-assets")
      .remove(fixtures.questionAssetPaths);
    if (storageError) clean = false;
  }
  await remove("question_assets", fixtures.questionAssetIds);
  if (fixtures.questionIds.length) {
    const { data: discoveredReviewItems, error: discoveredReviewItemsError } =
      await fixtures.service
        .from("review_draft_items")
        .select("id, review_batch_id")
        .in("created_question_id", fixtures.questionIds);
    if (discoveredReviewItemsError) clean = false;
    const discoveredReviewItemIds = (discoveredReviewItems ?? []).map(
      (item) => item.id,
    );
    const discoveredReviewBatchIds = (discoveredReviewItems ?? []).map(
      (item) => item.review_batch_id,
    );
    await remove("review_draft_items", discoveredReviewItemIds);
    fixtures.reviewBatchIds.push(...discoveredReviewBatchIds);
    const { error } = await fixtures.service
      .from("bank_questions")
      .delete()
      .in("question_id", fixtures.questionIds);
    if (error) clean = false;
  }
  await remove("bank_questions", fixtures.bankQuestionIds);
  await remove("review_draft_items", fixtures.reviewItemIds);
  if (fixtures.importBatchIds.length) {
    const { data: importReviewBatches, error: importReviewBatchError } =
      await fixtures.service
        .from("review_batches")
        .select("id")
        .in("source_record_id", fixtures.importBatchIds);
    if (importReviewBatchError) clean = false;
    fixtures.reviewBatchIds.push(
      ...(importReviewBatches ?? []).map((batch) => batch.id),
    );
  }
  await remove(
    "review_batches",
    Array.from(new Set(fixtures.reviewBatchIds)),
  );
  await remove("import_batch_items", fixtures.importBatchItemIds);
  await remove("import_batches", fixtures.importBatchIds);
  await remove("questions", fixtures.questionIds);
  await remove("bank_members", fixtures.bankMemberIds);
  await remove("question_banks", fixtures.bankIds);
  await remove("organization_members", fixtures.organizationMemberIds);
  await remove("profiles", fixtures.profileIds);
  for (const userId of fixtures.authUserIds) {
    const { error } = await fixtures.service.auth.admin.deleteUser(userId);
    if (error) clean = false;
  }
  await remove("organizations", fixtures.organizationIds);
  return clean;
}

if (!live) {
  console.log(
    "SKIP live teacher focus E2E. Run with --live against an explicitly confirmed disposable clean Supabase.",
  );
  process.exit(0);
}

assert(
  process.env.TEACHER_FOCUS_E2E_CONFIRM === confirmation,
  "disposable_clean_supabase_confirmation_required",
);
assert(process.env.NODE_ENV !== "production", "production_environment_refused");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY;
assert(supabaseUrl && anonKey && serviceRoleKey, "clean_supabase_config_missing");

const baseUrl = localBaseUrl();
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { chromium } = await import("playwright");
const edgePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  process.env.PLAYWRIGHT_EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
assert(existsSync(edgePath), "chromium_executable_missing");

let browser;
let contract;
const fixtures = createFixtureState(service);
let passed = false;
try {
  contract = await createFixtures(fixtures);
  browser = await chromium.launch({ executablePath: edgePath, headless: true });
  await assertViewerManagementBoundaries({
    baseUrl,
    browser,
    contract,
  });
  if (bulkOnly) {
    await runBulkInteractionJourney({
      baseUrl,
      browser,
      contract,
      engineName: "chromium",
    });
    passed = true;
  } else {
  assert(
    contract.actors.owner.profileRole === "teacher",
    "primary_browser_actor_must_be_teacher",
  );
  await assertRolePreview({
    actor: contract.actors.owner,
    bankId: contract.privateBankId,
    bankQuestionId: contract.privateBankQuestionId,
    baseUrl,
    browser,
    expectedAccess: "owner member",
    expectedCapability: "Can manage content",
  });
  await assertRolePreview({
    actor: contract.actors.editor,
    bankId: contract.privateBankId,
    bankQuestionId: contract.privateBankQuestionId,
    baseUrl,
    browser,
    expectedAccess: "editor member",
    expectedCapability: "Can manage content",
  });
  await assertRolePreview({
    actor: contract.actors.viewer,
    bankId: contract.privateBankId,
    bankQuestionId: contract.privateBankQuestionId,
    baseUrl,
    browser,
    expectedAccess: "viewer member",
    expectedCapability: "Read-only access",
  });
  await assertRolePreview({
    actor: contract.actors.organizationReader,
    bankId: contract.organizationBankId,
    bankQuestionId: contract.organizationBankQuestionId,
    baseUrl,
    browser,
    expectedAccess: "Organization teacher",
    expectedCapability: "Read-only access",
  });
  await assertRolePreview({
    actor: contract.actors.organizationAdmin,
    bankId: contract.organizationBankId,
    bankQuestionId: contract.organizationBankQuestionId,
    baseUrl,
    browser,
    expectedAccess: "Organization admin",
    expectedCapability: "Read-only access",
  });
  await assertRolePreview({
    actor: contract.actors.platformAdmin,
    bankId: contract.privateBankId,
    bankQuestionId: contract.privateBankQuestionId,
    baseUrl,
    browser,
    expectedAccess: "Platform administrator",
    expectedCapability: "Read-only access",
  });
  await assertDeniedPreview({
    actor: contract.actors.inactive,
    bankId: contract.privateBankId,
    bankQuestionId: contract.privateBankQuestionId,
    baseUrl,
    browser,
    contract,
    expected: "not_found",
  });
  await assertDeniedPreview({
    actor: contract.actors.outsider,
    bankId: contract.privateBankId,
    bankQuestionId: contract.privateBankQuestionId,
    baseUrl,
    browser,
    contract,
    expected: "not_found",
  });
  await assertDeniedPreview({
    actor: contract.actors.student,
    bankId: contract.privateBankId,
    bankQuestionId: contract.privateBankQuestionId,
    baseUrl,
    browser,
    contract,
    expected: "student",
  });
  await assertLineageGates({
    anonKey,
    baseUrl,
    browser,
    contract,
    supabaseUrl,
  });
  await runBrowserJourney(browser, contract, baseUrl);
  await runResponsiveLayoutJourney({
    baseUrl,
    browser,
    contract,
  });
  await runBulkInteractionJourney({
    baseUrl,
    browser,
    contract,
    engineName: "chromium",
  });
  await runNewTabSafetySmoke({ baseUrl, browser, contract });
  await assertValidLineageApproval({
    anonKey,
    contract,
    supabaseUrl,
  });
  passed = true;
  }
} finally {
  await browser?.close().catch(() => {});
  const cleaned = await cleanup(fixtures);
  assert(cleaned, "teacher_focus_fixture_cleanup_failed");
}

assert(passed, "teacher_focus_live_e2e_failed");
console.log(
  bulkOnly
    ? "PASS real Chromium bulk workflow: 375px selection, dialog failure recovery, opaque same-tab POST handoff, URL, scroll, and focus restore"
    : "PASS real teacher focus and bulk workflows: roles, strict lineage, denied HTML/Flight boundaries, Chromium same-tab Question/Review/bulk navigation, 375/768/1024/1440 reflow, exact return state, and one 1024px secondary new-tab security smoke",
);
