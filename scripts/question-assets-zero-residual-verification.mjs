#!/usr/bin/env node

// Read-only aggregate execution of the existing HTML and JSONB verification contracts.
// It intentionally does not run their sample-content queries or load dotenv files.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), "..");
const sourceOnly = !process.argv.includes("--live") || process.argv.includes("--source-only");
const ENVIRONMENT_CONFIRMATION = "DISPOSABLE_QUESTION_ASSETS_READONLY";
const READ_ONLY_CONFIRMATION = "RUN_READONLY_QUESTION_ASSETS_VERIFY";
let Client;

class VerificationError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new VerificationError(category);
}

function safeErrorCategory(error) {
  const candidate = String(error?.code ?? error?.name ?? "query_failed");
  return /^[A-Za-z0-9_:-]{1,80}$/.test(candidate) ? candidate : "query_failed";
}

const HTML_RESIDUAL_COUNTS_SQL = `
  select 'questions.content_html' as target, count(*)::integer as rows_with_legacy_url
  from public.questions
  where content_html ilike '%/storage/v1/object/public/question-assets/%'
  union all
  select 'questions.solution_html', count(*)::integer
  from public.questions
  where solution_html ilike '%/storage/v1/object/public/question-assets/%'
  union all
  select 'question_rubric_steps.content_html', count(*)::integer
  from public.question_rubric_steps
  where content_html ilike '%/storage/v1/object/public/question-assets/%'
  union all
  select 'practice_round_questions.content_html', count(*)::integer
  from public.practice_round_questions
  where content_html ilike '%/storage/v1/object/public/question-assets/%'
  union all
  select 'practice_attempts.solution_html', count(*)::integer
  from public.practice_attempts
  where solution_html ilike '%/storage/v1/object/public/question-assets/%';
`;

const JSONB_RESIDUAL_COUNTS_SQL = `
  select 'practice_round_questions.question_snapshot' as target, count(*)::integer as rows_with_legacy_url
  from public.practice_round_questions
  where question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
  union all
  select 'practice_attempts.question_snapshot', count(*)::integer
  from public.practice_attempts
  where question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
  union all
  select 'practice_wrong_questions.question_snapshot', count(*)::integer
  from public.practice_wrong_questions
  where question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
  union all
  select 'review_draft_items.draft_payload', count(*)::integer
  from public.review_draft_items
  where draft_payload::text ilike '%/storage/v1/object/public/question-assets/%';
`;

const PRIVATE_BUCKET_STATE_SQL = `
  select
    count(*)::integer as matching_bucket_count,
    coalesce(bool_and(public = false), false) as all_matching_buckets_private
  from storage.buckets
  where id = 'question-assets';
`;

function requireApprovedProcessEnvironment() {
  const required = [
    "QUESTION_ASSETS_VERIFY_PROJECT_REF",
    "QUESTION_ASSETS_VERIFY_DB_PASSWORD",
    "QUESTION_ASSETS_VERIFY_ENVIRONMENT",
    "QUESTION_ASSETS_VERIFY_CONFIRM_READONLY",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new VerificationError(`missing_process_environment:${missing.join(",")}`);
  }
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new VerificationError("production_environment_refused");
  }
  if (process.env.QUESTION_ASSETS_VERIFY_ENVIRONMENT !== ENVIRONMENT_CONFIRMATION) {
    throw new VerificationError("disposable_environment_acknowledgement_required");
  }
  if (process.env.QUESTION_ASSETS_VERIFY_CONFIRM_READONLY !== READ_ONLY_CONFIRMATION) {
    throw new VerificationError("read_only_acknowledgement_required");
  }

  const projectRef = process.env.QUESTION_ASSETS_VERIFY_PROJECT_REF.trim().toLowerCase();
  if (!/^[a-z0-9]{8,64}$/.test(projectRef)) {
    throw new VerificationError("project_reference_format_invalid");
  }
  return { password: process.env.QUESTION_ASSETS_VERIFY_DB_PASSWORD, projectRef };
}

function assertZeroCounts(rows, expectedTargets, category) {
  assert(rows.length === expectedTargets.length, `${category}_target_count_invalid`);
  const returnedTargets = new Set(rows.map((row) => row.target));
  for (const target of expectedTargets) {
    assert(returnedTargets.has(target), `${category}_target_missing`);
  }
  const nonzero = rows.filter((row) => Number(row.rows_with_legacy_url) !== 0);
  assert(nonzero.length === 0, `${category}_residual_legacy_urls`);
  return rows.map((row) => ({ target: row.target, count: Number(row.rows_with_legacy_url) }));
}

async function runSourceOnly() {
  const [htmlContract, jsonbContract] = await Promise.all([
    readFile(resolve(root, "scripts/question-asset-url-backfill-verify.sql"), "utf8"),
    readFile(resolve(root, "scripts/question-asset-url-backfill-jsonb-verify.sql"), "utf8"),
  ]);
  for (const target of [
    "questions.content_html",
    "questions.solution_html",
    "question_rubric_steps.content_html",
    "practice_round_questions.content_html",
    "practice_attempts.solution_html",
  ]) {
    assert(htmlContract.includes(target), "html_verification_contract_incomplete");
  }
  for (const target of [
    "practice_round_questions.question_snapshot",
    "practice_attempts.question_snapshot",
    "practice_wrong_questions.question_snapshot",
    "review_draft_items.draft_payload",
  ]) {
    assert(jsonbContract.includes(target), "jsonb_verification_contract_incomplete");
  }
  console.log("PASS question-assets zero-residual verification source contract");
}

async function runLive() {
  const { password, projectRef } = requireApprovedProcessEnvironment();
  const verifyPostCutoverBucket = process.argv.includes("--post-cutover");
  ({ Client } = await import("pg"));
  const client = new Client({
    database: "postgres",
    host: `db.${projectRef}.supabase.co`,
    password,
    port: 5432,
    ssl: { rejectUnauthorized: false },
    user: "postgres",
  });
  try {
    await client.connect();
    await client.query("begin read only");
    const html = await client.query(HTML_RESIDUAL_COUNTS_SQL);
    const jsonb = await client.query(JSONB_RESIDUAL_COUNTS_SQL);
    const htmlCounts = assertZeroCounts(
      html.rows,
      [
        "questions.content_html",
        "questions.solution_html",
        "question_rubric_steps.content_html",
        "practice_round_questions.content_html",
        "practice_attempts.solution_html",
      ],
      "html",
    );
    const jsonbCounts = assertZeroCounts(
      jsonb.rows,
      [
        "practice_round_questions.question_snapshot",
        "practice_attempts.question_snapshot",
        "practice_wrong_questions.question_snapshot",
        "review_draft_items.draft_payload",
      ],
      "jsonb",
    );
    if (verifyPostCutoverBucket) {
      const bucket = await client.query(PRIVATE_BUCKET_STATE_SQL);
      const state = bucket.rows[0];
      assert(state?.matching_bucket_count === 1, "question_assets_bucket_count_invalid");
      assert(state?.all_matching_buckets_private === true, "question_assets_bucket_not_private");
      console.log("PASS question-assets bucket count=1 and private=true");
    }
    await client.query("rollback");
    console.log(`PASS HTML residual counts: ${htmlCounts.map((row) => `${row.target}=0`).join(", ")}`);
    console.log(`PASS JSONB residual counts: ${jsonbCounts.map((row) => `${row.target}=0`).join(", ")}`);
    console.log("PASS no residual legacy URLs across all nine verification targets");
  } finally {
    try {
      await client.query("rollback");
    } catch {
      // A disconnected client or completed rollback has no remaining transaction to close.
    }
    await client.end().catch(() => undefined);
  }
}

try {
  if (sourceOnly) {
    await runSourceOnly();
  } else {
    await runLive();
  }
} catch (error) {
  const category = error instanceof VerificationError ? error.category : safeErrorCategory(error);
  console.error(`FAIL question-assets-zero-residual-verification:${category}`);
  process.exitCode = 1;
}
