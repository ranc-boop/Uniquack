#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");
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
  if (result.error) throw new Error(message);
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

async function runBrowserJourney(browser, contract, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const searchCanary = "Focused";
  const requestedUrls = [];
  context.on("request", (request) => {
    requestedUrls.push(request.url());
  });
  try {
    await signIn(page, baseUrl, contract.actors.owner);
    const parentUrl =
      `${baseUrl}/teacher/banks/${contract.privateBankId}/questions` +
      `?q=${encodeURIComponent(searchCanary)}`;
    await page.goto(parentUrl, { waitUntil: "domcontentloaded" });
    const triggerId = `question-preview-${contract.privateBankQuestionId}`;
    const trigger = page.locator(`#${triggerId}`);
    assert((await trigger.count()) === 1, "preview_trigger_missing");
    await page.waitForFunction(
      (id) =>
        document
          .getElementById(id)
          ?.matches('[data-focus-launch-ready="true"]') === true,
      triggerId,
      { timeout: 8000 },
    );
    assert(
      (await trigger.getAttribute("data-focus-launch-ready")) === "true",
      "preview_trigger_coordination_not_ready",
    );
    const accessibleName = await trigger.getAttribute("aria-label");
    const visibleText = (await trigger.textContent()) ?? "";
    assert(
      `${accessibleName ?? ""} ${visibleText}`.includes("Opens in new tab"),
      "new_tab_warning_not_accessible",
    );
    assert(
      (await trigger.getAttribute("target")) === "_blank" &&
        (await trigger.getAttribute("rel")) === "noopener noreferrer" &&
        (await trigger.getAttribute("referrerpolicy")) === "no-referrer",
      "new_tab_security_attributes_missing",
    );

    const [child] = await Promise.all([
      page.waitForEvent("popup"),
      trigger.click(),
    ]);
    await child.waitForLoadState("domcontentloaded");
    assert(
      new URL(child.url()).searchParams.has("launchId"),
      "coordinated_child_launch_id_missing",
    );
    assert(!child.url().includes(searchCanary), "search_query_leaked_to_child");
    assert(
      (await child.evaluate(() => document.referrer)) === "",
      "child_referrer_not_empty",
    );
    assertNoCanaries(
      await child.content(),
      contract.canaries,
      "question_preview_html_canary_leak",
    );
    await child.getByRole("heading", {
      name: "Focused Question fixture",
      exact: true,
    }).waitFor();
    await child.getByText("Read-only preview", { exact: true }).waitFor();
    await child
      .getByText(/original Library list is connected/)
      .waitFor({ timeout: 8000 });
    const parentStorage = await page.evaluate(() =>
      Object.entries(sessionStorage),
    );
    assert(
      !JSON.stringify(parentStorage).includes(searchCanary),
      "search_query_persisted_in_session_storage",
    );

    await Promise.all([
      child.waitForEvent("close"),
      child.getByRole("button", {
        name: "Close and return",
        exact: true,
      }).click(),
    ]);
    await page.bringToFront();
    await waitForValue(
      () => page.evaluate(() => document.activeElement?.id ?? ""),
      (value) => value === triggerId,
      "launch_trigger_focus_not_restored",
    );

    const [fallbackChild] = await Promise.all([
      page.waitForEvent("popup"),
      trigger.click(),
    ]);
    await fallbackChild.waitForLoadState("domcontentloaded");
    await fallbackChild
      .getByText(/original Library list is connected/)
      .waitFor({ timeout: 8000 });
    await page.evaluate((id) => document.getElementById(id)?.remove(), triggerId);
    await Promise.all([
      fallbackChild.waitForEvent("close"),
      fallbackChild.getByRole("button", {
        name: "Close and return",
        exact: true,
      }).click(),
    ]);
    await page.bringToFront();
    await waitForValue(
      () => page.evaluate(() => document.activeElement?.id ?? ""),
      (value) =>
        value === `question-preview-${contract.nextBankQuestionId}`,
      "fallback_available_task_focus_not_restored",
    );
    const availableTaskAnnouncement = await page
      .getByRole("status")
      .filter({ hasText: "focus moved to another available task" })
      .textContent();
    assert(
      availableTaskAnnouncement?.includes(
        "focus moved to another available task",
      ),
      "fallback_available_task_status_inaccurate",
    );

    await page.goto(parentUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (id) =>
        document
          .getElementById(id)
          ?.matches('[data-focus-launch-ready="true"]') === true,
      triggerId,
      { timeout: 8000 },
    );
    const [resultsFallbackChild] = await Promise.all([
      page.waitForEvent("popup"),
      page.locator(`#${triggerId}`).click(),
    ]);
    await resultsFallbackChild.waitForLoadState("domcontentloaded");
    await resultsFallbackChild
      .getByText(/original Library list is connected/)
      .waitFor({ timeout: 8000 });
    await page.evaluate(() => {
      document
        .querySelectorAll('[data-focus-task-kind="question-preview"]')
        .forEach((candidate) => candidate.remove());
    });
    await Promise.all([
      resultsFallbackChild.waitForEvent("close"),
      resultsFallbackChild.getByRole("button", {
        name: "Close and return",
        exact: true,
      }).click(),
    ]);
    await page.bringToFront();
    await waitForValue(
      () => page.evaluate(() => document.activeElement?.id ?? ""),
      (value) => value === "library-question-results-focus",
      "fallback_results_focus_not_restored",
    );
    const fallbackAnnouncement = await page
      .getByRole("status")
      .filter({ hasText: "focus moved to the results" })
      .textContent();
    assert(
      fallbackAnnouncement?.includes("focus moved to the results"),
      "fallback_results_status_inaccurate",
    );

    await page.goto(parentUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (id) =>
        document
          .getElementById(id)
          ?.matches('[data-focus-launch-ready="true"]') === true,
      triggerId,
      { timeout: 8000 },
    );
    const originalRow = page
      .locator("tr")
      .filter({ has: page.locator(`#${triggerId}`) });
    const sameTabLink = originalRow.getByRole("link", {
      name: "Open in current tab",
      exact: true,
    });
    assert((await sameTabLink.count()) === 1, "same_tab_fallback_missing");
    await Promise.all([
      page.waitForURL(/\/preview\?/),
      sameTabLink.click(),
    ]);
    assert(
      page.url().includes("/preview") && !page.url().includes(searchCanary),
      "same_tab_fallback_navigation_invalid",
    );

    const copiedPage = await context.newPage();
    await copiedPage.goto(
      previewUrl(
        baseUrl,
        contract.privateBankId,
        contract.privateBankQuestionId,
      ),
      { waitUntil: "domcontentloaded" },
    );
    await copiedPage
      .getByText("The original list is unavailable. This tab will stay open.", {
        exact: true,
      })
      .waitFor();
    await copiedPage.getByRole("link", {
      name: "Open original list in this tab",
      exact: true,
    }).waitFor();
    await copiedPage.close();

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

async function runCrossBrowserSurfaceJourney({
  baseUrl,
  browser,
  contract,
  engineName,
  pixelScalePercent,
  surface,
}) {
  const isReview = surface === "review";
  const viewport = {
    height: 812,
    width: 375,
  };
  const context = await browser.newContext({
    deviceScaleFactor: pixelScalePercent === 200 ? 2 : 1,
    reducedMotion: "reduce",
    viewport,
  });
  const page = await context.newPage();
  try {
    await signIn(page, baseUrl, contract.actors.owner);
    const listPath = isReview
      ? `/teacher/banks/${contract.privateBankId}/review?q=Focused`
      : `/teacher/banks/${contract.privateBankId}/questions?q=Focused`;
    await page.goto(
      `${baseUrl}${listPath}`,
      { waitUntil: "domcontentloaded" },
    );
    const triggerId = isReview
      ? `review-preview-${contract.reviewItemId}`
      : `question-preview-${contract.privateBankQuestionId}`;
    const trigger = page.locator(`#${triggerId}`);
    await page.waitForFunction(
      (id) =>
        document
          .getElementById(id)
          ?.matches('[data-focus-launch-ready="true"]') === true,
      triggerId,
      { timeout: 8000 },
    );
    assert(await trigger.isVisible(), `${engineName}_preview_trigger_hidden`);

    const [child] = await Promise.all([
      page.waitForEvent("popup"),
      trigger.click(),
    ]);
    await child.waitForLoadState("domcontentloaded");
    await child
      .getByText(/original Library list is connected/)
      .waitFor({ timeout: 8000 });
    await child.getByText(/Evaluate/, { exact: false }).first().waitFor();
    await child.locator(".katex").first().waitFor();
    assert(
      await child.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      `${engineName}_reduced_motion_not_emulated`,
    );
    const viewportEvidence = await child.evaluate(() => ({
      computedZoom: getComputedStyle(document.documentElement).zoom,
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      visualViewportWidth: window.visualViewport?.width ?? window.innerWidth,
    }));
    if (pixelScalePercent === 200) {
      const screenshot = await child.screenshot({
        animations: "disabled",
        fullPage: false,
      });
      assert(
        viewportEvidence.innerWidth === 375 &&
          viewportEvidence.visualViewportWidth >= 374 &&
          viewportEvidence.visualViewportWidth <= 376 &&
          viewportEvidence.devicePixelRatio === 2 &&
          screenshot.readUInt32BE(16) === 750,
        `${engineName}_${surface}_observable_200_percent_pixel_scale_missing`,
      );
    } else {
      assert(
        viewportEvidence.innerWidth === 375 &&
          viewportEvidence.visualViewportWidth >= 374 &&
          viewportEvidence.visualViewportWidth <= 376 &&
          viewportEvidence.devicePixelRatio === 1 &&
          viewportEvidence.computedZoom !== "2",
        `${engineName}_${surface}_375_css_pixel_viewport_missing`,
      );
    }

    const imageButton = child.getByRole("button", {
      name: isReview
        ? "Enlarge Focused Review image"
        : "Enlarge Focused Question image",
      exact: true,
    });
    await waitForValue(
      () =>
        imageButton.locator("img").evaluate((image) => ({
          complete: image.complete,
          naturalWidth: image.naturalWidth,
        })),
      (image) => image.complete && image.naturalWidth > 0,
      `${engineName}_${surface}_${pixelScalePercent}_image_not_loaded`,
    );
    await imageButton.click();
    const imageDialog = child.getByRole("dialog");
    await imageDialog.waitFor();
    const dialogClose = imageDialog.getByRole("button", {
      name: "Close",
      exact: true,
    });
    await dialogClose.focus();
    const dialogLayout = await imageDialog.evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        rootClientWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        top: rect.top,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    assert(
      dialogLayout.rootScrollWidth <= dialogLayout.rootClientWidth + 1 &&
        dialogLayout.left >= -1 &&
        dialogLayout.right <= dialogLayout.viewportWidth + 1 &&
        dialogLayout.top >= -1 &&
        dialogLayout.bottom <= dialogLayout.viewportHeight + 1,
      `${engineName}_${surface}_${pixelScalePercent}_image_dialog_overflow`,
    );
    await dialogClose.click();

    const closeButton = child.getByRole("button", {
      name: "Close and return",
      exact: true,
    });
    await closeButton.focus();
    const layout = await child.evaluate(() => {
      const active = document.activeElement;
      const rect =
        active instanceof HTMLElement ? active.getBoundingClientRect() : null;
      return {
        activeText:
          active instanceof HTMLElement ? active.innerText.trim() : "",
        clientWidth: document.documentElement.clientWidth,
        rect: rect
          ? {
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              top: rect.top,
            }
          : null,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert(
      layout.scrollWidth <= layout.clientWidth + 1,
      `${engineName}_focus_preview_horizontal_overflow`,
    );
    assert(
      layout.activeText === "Close and return" &&
        layout.rect &&
        layout.rect.left >= 0 &&
        layout.rect.right <= layout.clientWidth &&
        layout.rect.top >= 0 &&
        layout.rect.bottom <= viewport.height,
      `${engineName}_focus_ring_control_clipped`,
    );

    await Promise.all([
      child.waitForEvent("close"),
      closeButton.click(),
    ]);
    await page.bringToFront();
    await waitForValue(
      () => page.evaluate(() => document.activeElement?.id ?? ""),
      (value) => value === triggerId,
      `${engineName}_launch_focus_not_restored`,
    );
    console.log(
      `PASS ${engineName} ${surface} DPR${pixelScalePercent / 100} focus reflow and return`,
    );
  } finally {
    await context.close();
  }
}

async function runCrossBrowserFocusJourney(args) {
  await runCrossBrowserSurfaceJourney({
    ...args,
    pixelScalePercent: 100,
    surface: "question",
  });
  await runCrossBrowserSurfaceJourney({
    ...args,
    pixelScalePercent: 200,
    surface: "review",
  });
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
const { chromium, firefox, webkit } = await import("playwright");
let compatibleFirefox = firefox;
const compatibleFirefoxDriverPath =
  process.env.PLAYWRIGHT_FIREFOX_DRIVER_PATH?.trim();
if (compatibleFirefoxDriverPath) {
  assert(
    existsSync(compatibleFirefoxDriverPath),
    "firefox_compatible_driver_missing",
  );
  const compatiblePlaywright = await import(
    pathToFileURL(compatibleFirefoxDriverPath).href
  );
  compatibleFirefox =
    compatiblePlaywright.firefox ?? compatiblePlaywright.default?.firefox;
  assert(compatibleFirefox, "firefox_compatible_driver_invalid");
}
let compatibleWebkit = webkit;
const compatibleWebkitDriverPath =
  process.env.PLAYWRIGHT_WEBKIT_DRIVER_PATH?.trim();
if (compatibleWebkitDriverPath) {
  assert(
    existsSync(compatibleWebkitDriverPath),
    "webkit_compatible_driver_missing",
  );
  const compatiblePlaywright = await import(
    pathToFileURL(compatibleWebkitDriverPath).href
  );
  compatibleWebkit =
    compatiblePlaywright.webkit ?? compatiblePlaywright.default?.webkit;
  assert(compatibleWebkit, "webkit_compatible_driver_invalid");
}
const edgePath =
  process.env.PLAYWRIGHT_EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
assert(existsSync(edgePath), "edge_executable_missing");
const browserExecutablePaths = {
  chromium: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  firefox: process.env.PLAYWRIGHT_FIREFOX_PATH,
  webkit: process.env.PLAYWRIGHT_WEBKIT_PATH,
};

let browser;
const browsers = [];
let contract;
const fixtures = createFixtureState(service);
let passed = false;
try {
  contract = await createFixtures(fixtures);
  browser = await chromium.launch({ executablePath: edgePath, headless: true });
  browsers.push(browser);
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
  await runCrossBrowserFocusJourney({
    baseUrl,
    browser,
    contract,
    engineName: "edge",
  });
  for (const [engineName, browserType] of [
    ["chromium", chromium],
    ["firefox", compatibleFirefox],
    ["webkit", compatibleWebkit],
  ]) {
    const executablePath = browserExecutablePaths[engineName];
    if (executablePath) {
      assert(
        existsSync(executablePath),
        `${engineName}_override_executable_missing`,
      );
    }
    const engineBrowser = await browserType.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    browsers.push(engineBrowser);
    await runCrossBrowserFocusJourney({
      baseUrl,
      browser: engineBrowser,
      contract,
      engineName,
    });
  }
  await assertValidLineageApproval({
    anonKey,
    contract,
    supabaseUrl,
  });
  passed = true;
} finally {
  await Promise.all(
    browsers.map((activeBrowser) => activeBrowser.close().catch(() => {})),
  );
  const cleaned = await cleanup(fixtures);
  assert(cleaned, "teacher_focus_fixture_cleanup_failed");
}

assert(passed, "teacher_focus_live_e2e_failed");
console.log(
  "PASS real teacher focus preview roles, strict lineage, denied HTML/Flight boundaries, Edge/Chromium/Firefox/WebKit new tabs, 375 CSS px and observable 750-physical-pixel DPR2 reflow, rendered math/image-dialog layout, return focus, and fallbacks",
);
