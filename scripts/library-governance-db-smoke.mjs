import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { createGoogleAccountLinksPostgresHarness } from "./google-account-links-embedded-postgres.mjs";
import { loadCanonicalMigrationPlan } from "./lib/canonical-migration-plan.mjs";
import { splitSql } from "./sql-split.mjs";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const plan = await loadCanonicalMigrationPlan({ root });
const harness = await createGoogleAccountLinksPostgresHarness("library-governance");
const { connection, instance } = harness;
let client;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await instance.initialise();
  await instance.start();
  await instance.createDatabase("library_governance_test").catch(() => {});
  client = new pg.Client({ ...connection, database: "library_governance_test" });
  await client.connect();
  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text unique,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      password_set boolean not null default false,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text
      language sql stable
      as $$ select current_setting('request.jwt.claim.role', true) $$;
    create or replace function auth.jwt() returns jsonb
      language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create schema if not exists storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz not null default now()
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  for (const filename of plan.executableMigrationNames) {
    const sql = readFileSync(join(plan.cleanDirectory, filename), "utf8");
    await client.query("begin");
    try {
      for (const statement of splitSql(sql)) await client.query(statement);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`${filename}: ${error.message}`);
    }
  }
  await client.query(
    "grant select, insert, update, delete on all tables in schema public to authenticated",
  );
  await client.query("grant usage on schema public to anon, authenticated");
  await client.query("grant select on all tables in schema public to anon");

  const ids = {
    org: "10000000-0000-4000-8000-000000000055",
    otherOrg: "11000000-0000-4000-8000-000000000055",
    teacher: "20000000-0000-4000-8000-000000000055",
    superAdmin: "30000000-0000-4000-8000-000000000055",
    viewer: "40000000-0000-4000-8000-000000000055",
    ordinaryAdmin: "41000000-0000-4000-8000-000000000055",
    unrelatedTeacher: "42000000-0000-4000-8000-000000000055",
    student: "43000000-0000-4000-8000-000000000055",
    bank: "50000000-0000-4000-8000-000000000055",
    sourceQuestion: "60000000-0000-4000-8000-000000000055",
    sourceBankQuestion: "70000000-0000-4000-8000-000000000055",
    draftAsset: "71000000-0000-4000-8000-000000000055",
    draftRubric: "72000000-0000-4000-8000-000000000055",
    draftSourceFile: "73000000-0000-4000-8000-000000000055",
    sourceReference: "74000000-0000-4000-8000-000000000055",
    questionSourceReference: "75000000-0000-4000-8000-000000000055",
    draftStatusEvent: "76000000-0000-4000-8000-000000000055",
    draftStorageObject: "77000000-0000-4000-8000-000000000055",
  };

  await client.query(
    "select set_config('request.jwt.claim.role', 'service_role', false)",
  );
  await client.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
      ($1, 'library-teacher@example.invalid', '{"role":"teacher"}'),
      ($2, 'library-super@example.invalid', '{"role":"super_admin"}'),
      ($3, 'library-viewer@example.invalid', '{"role":"teacher"}'),
      ($4, 'library-admin@example.invalid', '{"role":"admin"}'),
      ($5, 'library-unrelated@example.invalid', '{"role":"teacher"}'),
      ($6, 'library-student@example.invalid', '{"role":"student"}')`,
    [
      ids.teacher,
      ids.superAdmin,
      ids.viewer,
      ids.ordinaryAdmin,
      ids.unrelatedTeacher,
      ids.student,
    ],
  );
  await client.query(
    `insert into public.organizations (id, name, slug)
       values
         ($1, 'Library Governance Smoke', 'library-governance-smoke'),
         ($2, 'Unrelated Organization', 'library-governance-other')`,
    [ids.org, ids.otherOrg],
  );
  await client.query(
    `insert into public.profiles (
       id, email, role, status, default_organization_id
     ) values
       ($1, 'library-teacher@example.invalid', 'teacher', 'active', $4),
       ($2, 'library-super@example.invalid', 'super_admin', 'active', $4),
       ($3, 'library-viewer@example.invalid', 'teacher', 'active', $4),
       ($5, 'library-admin@example.invalid', 'admin', 'active', $4),
       ($6, 'library-unrelated@example.invalid', 'teacher', 'active', $7),
       ($8, 'library-student@example.invalid', 'student', 'active', $7)
     on conflict (id) do update set
       role = excluded.role,
       status = excluded.status,
       default_organization_id = excluded.default_organization_id`,
    [
      ids.teacher,
      ids.superAdmin,
      ids.viewer,
      ids.org,
      ids.ordinaryAdmin,
      ids.unrelatedTeacher,
      ids.otherOrg,
      ids.student,
    ],
  );
  await client.query(
    `update public.profiles
       set role = case
         when id = $3 then 'super_admin'
         when id = $5 then 'admin'
         when id = $7 then 'student'
         else 'teacher'
       end,
           status = 'active',
           default_organization_id = case
             when id in ($6, $7) then $2::uuid
             else $1::uuid
           end
       where id in ($4, $3, $8, $5, $6, $7)`,
    [
      ids.org,
      ids.otherOrg,
      ids.superAdmin,
      ids.teacher,
      ids.ordinaryAdmin,
      ids.unrelatedTeacher,
      ids.student,
      ids.viewer,
    ],
  );
  await client.query(
    `insert into public.organization_members (organization_id, user_id, role, status)
       values
         ($1, $2, 'teacher', 'active'),
         ($1, $3, 'teacher', 'active'),
         ($1, $4, 'admin', 'active'),
         ($5, $6, 'teacher', 'active'),
         ($5, $7, 'student', 'active')`,
    [
      ids.org,
      ids.teacher,
      ids.viewer,
      ids.ordinaryAdmin,
      ids.otherOrg,
      ids.unrelatedTeacher,
      ids.student,
    ],
  );
  await client.query(
    `insert into public.question_banks (
       id, organization_id, owner_id, name, visibility, status, created_by, updated_by
     ) values ($1, $2, $3, 'Teacher Library', 'private', 'active', $3, $3)`,
    [ids.bank, ids.org, ids.teacher],
  );
  await client.query(
    `insert into public.bank_members (bank_id, user_id, role, status, joined_at)
       values ($1, $2, 'owner', 'active', now()), ($1, $3, 'viewer', 'active', now())`,
    [ids.bank, ids.teacher, ids.viewer],
  );
  await client.query(
    `insert into public.questions (
       id, organization_id, question_code, title, question_type, content_html,
       solution_html, difficulty_rating, status, source_kind, owner_bank_id,
       visibility, created_by, updated_by, reviewed_by
     ) values (
       $1, $2, 'LIB-REV-001', 'Original assignment question', 'frq',
       '<p>Original</p>', '<p>Solution</p>', 500, 'review', 'manual',
       $3, 'private', $4, $4, $4
     )`,
    [ids.sourceQuestion, ids.org, ids.bank, ids.teacher],
  );
  await client.query(
    `insert into public.bank_questions (
       id, bank_id, question_id, status, source_kind, added_by
     ) values ($1, $2, $3, 'active', 'manual', $4)`,
    [ids.sourceBankQuestion, ids.bank, ids.sourceQuestion, ids.teacher],
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.viewer],
  );
  let viewerDenied = false;
  try {
    await client.query(
      "select public.create_bank_manual_question_draft($1, 'VIEWER-001', 'Denied viewer draft')",
      [ids.bank],
    );
  } catch {
    viewerDenied = true;
  }
  assert(viewerDenied, "Viewer must not create a manual Library draft.");

  await client.query(
    "select set_config('request.jwt.claim.role', 'service_role', false)",
  );
  viewerDenied = false;
  try {
    await client.query(
      "select public.create_bank_question_revision_draft($1, $2, '[]'::jsonb, $3)",
      [ids.bank, ids.sourceQuestion, ids.viewer],
    );
  } catch {
    viewerDenied = true;
  }
  assert(viewerDenied, "Viewer must not create a revision draft.");

  await client.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [ids.teacher],
  );
  const manualDraftResult = await client.query(
    "select public.create_bank_manual_question_draft($1, 'MANUAL-001', 'Manual Library draft') as id",
    [ids.bank],
  );
  const manualDraftId = manualDraftResult.rows[0]?.id;
  const manualDraftLineage = await client.query(
    `select q.owner_bank_id, q.status, q.visibility, q.source_review_item_id,
            item.target_bank_id, item.created_question_id
       from public.questions q
       join public.review_draft_items item on item.id = q.source_review_item_id
      where q.id = $1`,
    [manualDraftId],
  );
  assert(
    manualDraftLineage.rows[0]?.owner_bank_id === ids.bank &&
      manualDraftLineage.rows[0]?.status === "draft" &&
      manualDraftLineage.rows[0]?.visibility === "private" &&
      manualDraftLineage.rows[0]?.target_bank_id === ids.bank &&
      manualDraftLineage.rows[0]?.created_question_id === manualDraftId,
    "Manual draft RPC must atomically create a private bank-scoped Review Draft.",
  );

  await client.query("begin");
  await client.query("set constraints all deferred");
  await client.query(
    `insert into public.taxonomy_nodes (
       tag_id, node_kind, label, is_assignable, status, created_by, updated_by
     ) values (
       'subject:library-governance', 'subject', 'Library Governance',
       false, 'active', $1, $1
     ) on conflict (tag_id) do nothing`,
    [ids.teacher],
  );
  await client.query(
    `insert into public.taxonomy_nodes (
       tag_id, node_kind, subject_tag_id, facet_key, label, is_assignable,
       status, created_by, updated_by
     ) values (
       'facet:library-governance:concept', 'facet_root',
       'subject:library-governance', 'library-governance-concept',
       'Library Governance Concept', false, 'active', $1, $1
     ) on conflict (tag_id) do nothing`,
    [ids.teacher],
  );
  await client.query(
    `insert into public.taxonomy_facets (
       facet_key, subject_tag_id, root_tag_id, label, status, created_by, updated_by
     ) values (
       'library-governance-concept', 'subject:library-governance',
       'facet:library-governance:concept', 'Concept', 'active', $1, $1
     ) on conflict (facet_key) do nothing`,
    [ids.teacher],
  );
  await client.query(
    `insert into public.taxonomy_nodes (
       tag_id, node_kind, subject_tag_id, facet_key, label, is_assignable, status,
       created_by, updated_by
     ) values (
       'library-governance:viewer-read-only', 'tag',
       'subject:library-governance', 'library-governance-concept',
       'Viewer read-only', true, 'active', $1, $1
     ) on conflict (tag_id) do nothing`,
    [ids.teacher],
  );
  await client.query("commit");
  const taxonomyTag = await client.query(
    `select tag_id
       from public.taxonomy_nodes
      where tag_id = 'library-governance:viewer-read-only'
      order by tag_id
      limit 1`,
  );
  const taxonomyTagId = taxonomyTag.rows[0]?.tag_id;
  assert(taxonomyTagId, "The clean migration chain must seed an assignable taxonomy tag.");
  await client.query(
    `insert into public.question_rubric_steps (
       id, question_id, step_order, label, content_html
     ) values ($1, $2, 1, 'Viewer read-only rubric', '<p>Rubric</p>')`,
    [ids.draftRubric, manualDraftId],
  );
  await client.query(
    `insert into public.question_assets (
       id, question_id, asset_kind, storage_bucket, storage_path, label, created_by
     ) values (
       $1, $2, 'image', 'question-assets', 'viewer-read-only/asset.png',
       'Draft image', $3
     )`,
    [ids.draftAsset, manualDraftId, ids.teacher],
  );
  await client.query(
    `insert into public.question_source_files (
       id, question_id, object_path, original_filename, mime_type, size_bytes,
       status, created_by
     ) values (
       $1, $2, 'viewer-read-only/source.pdf', 'source.pdf', 'application/pdf',
       1024, 'ready', $3
     )`,
    [ids.draftSourceFile, manualDraftId, ids.teacher],
  );
  await client.query(
    `insert into public.source_references (
       id, organization_id, ref_kind, bounded_text, bounded_text_char_count, created_by
     ) values ($1, $2, 'text_span', 'Evidence', 8, $3)`,
    [ids.sourceReference, ids.org, ids.teacher],
  );
  await client.query(
    `insert into public.question_source_references (
       id, question_id, source_reference_id, evidence_role
     ) values ($1, $2, $3, 'supporting')`,
    [ids.questionSourceReference, manualDraftId, ids.sourceReference],
  );
  await client.query(
    `insert into public.question_status_events (
       id, question_id, from_status, to_status, reason, actor_id
     ) values ($1, $2, null, 'draft', 'Draft created', $3)`,
    [ids.draftStatusEvent, manualDraftId, ids.teacher],
  );
  await client.query(
    `insert into public.question_taxonomy_assignments (
       question_id, tag_id, source, review_status, evidence, created_by, updated_by
     ) values ($1, $2, 'manual', 'pending_review', '{}'::jsonb, $3, $3)`,
    [manualDraftId, taxonomyTagId, ids.teacher],
  );
  await client.query(
    `insert into storage.objects (
       id, bucket_id, name, owner, metadata
     ) values (
       $1, 'question-assets', 'viewer-read-only/asset.png', $2, '{}'::jsonb
     )`,
    [ids.draftStorageObject, ids.teacher],
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.viewer],
  );
  await client.query("set role authenticated");
  const viewerDraftRows = await client.query(
    "select id from public.questions where id = $1",
    [manualDraftId],
  );
  const viewerReviewSearch = await client.query(
    `select question_id
       from public.search_bank_review_question_ids($1, null, null, 0, 25)`,
    [ids.bank],
  );
  const viewerReviewCount = await client.query(
    "select public.count_bank_review_questions($1, null, null) as count",
    [ids.bank],
  );
  const viewerChildRows = await client.query(
    `select
       (select count(*)::integer from public.question_rubric_steps where question_id = $1) as rubric_count,
       (select count(*)::integer from public.question_assets where question_id = $1) as asset_count,
       (select count(*)::integer from public.question_source_files where question_id = $1) as source_file_count,
       (select count(*)::integer from public.question_source_references where question_id = $1) as source_ref_count,
       (select count(*)::integer from public.question_status_events where question_id = $1) as event_count,
       (select count(*)::integer from public.question_taxonomy_assignments where question_id = $1) as taxonomy_count,
       public.can_read_question_asset($2) as can_read_asset,
       private.can_read_question_asset_storage_object(
         'question-assets', 'viewer-read-only/asset.png'
       ) as can_read_storage,
       private.can_write_question_asset_storage_object(
         'question-assets', 'viewer-read-only/asset.png'
       ) as can_write_storage`,
    [manualDraftId, ids.draftAsset],
  );
  let viewerDirectEditDenied = false;
  try {
    const viewerEditResult = await client.query(
      "update public.questions set title = 'Denied viewer edit' where id = $1",
      [manualDraftId],
    );
    viewerDirectEditDenied = viewerEditResult.rowCount === 0;
  } catch {
    viewerDirectEditDenied = true;
  }
  const viewerRubricUpdate = await client.query(
    "update public.question_rubric_steps set label = 'Denied' where id = $1",
    [ids.draftRubric],
  );
  const viewerAssetUpdate = await client.query(
    "update public.question_assets set label = 'Denied' where id = $1",
    [ids.draftAsset],
  );
  const viewerSourceFileDelete = await client.query(
    "delete from public.question_source_files where id = $1",
    [ids.draftSourceFile],
  );
  const viewerSourceRefDelete = await client.query(
    "delete from public.question_source_references where id = $1",
    [ids.questionSourceReference],
  );
  const viewerTaxonomyUpdate = await client.query(
    `update public.question_taxonomy_assignments
        set evidence = '{"viewer":"denied"}'::jsonb
      where question_id = $1 and tag_id = $2`,
    [manualDraftId, taxonomyTagId],
  );
  let viewerStatusInsertDenied = false;
  try {
    await client.query(
      `insert into public.question_status_events (
         question_id, from_status, to_status, reason, actor_id
       ) values ($1, 'draft', 'review', 'Denied viewer event', $2)`,
      [manualDraftId, ids.viewer],
    );
  } catch {
    viewerStatusInsertDenied = true;
  }
  await client.query("reset role");
  assert(
    viewerDraftRows.rowCount === 1 &&
      viewerReviewSearch.rows.some((row) => row.question_id === manualDraftId) &&
      Number(viewerReviewCount.rows[0]?.count ?? 0) === 1,
    "Viewer must be able to read the Library Review queue and its exact count.",
  );
  assert(
    viewerChildRows.rows[0]?.rubric_count === 1 &&
      viewerChildRows.rows[0]?.asset_count === 1 &&
      viewerChildRows.rows[0]?.source_file_count === 1 &&
      viewerChildRows.rows[0]?.source_ref_count === 1 &&
      viewerChildRows.rows[0]?.event_count === 1 &&
      viewerChildRows.rows[0]?.taxonomy_count === 1 &&
      viewerChildRows.rows[0]?.can_read_asset === true &&
      viewerChildRows.rows[0]?.can_read_storage === true &&
      viewerChildRows.rows[0]?.can_write_storage === false,
    "Viewer must read all Library Draft child metadata without Storage write access.",
  );
  assert(
    viewerDirectEditDenied &&
      viewerRubricUpdate.rowCount === 0 &&
      viewerAssetUpdate.rowCount === 0 &&
      viewerSourceFileDelete.rowCount === 0 &&
      viewerSourceRefDelete.rowCount === 0 &&
      viewerTaxonomyUpdate.rowCount === 0 &&
      viewerStatusInsertDenied,
    "Viewer must not mutate a Library Review Draft or any question child table.",
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.teacher],
  );
  await client.query("set role authenticated");
  const allowedDraftEdit = await client.query(
    "update public.questions set title = 'Manual Library draft edited' where id = $1 returning id",
    [manualDraftId],
  );
  assert(
    allowedDraftEdit.rowCount === 1,
    "Owner must retain ordinary private-draft editing through RLS.",
  );
  let directBankEscalationDenied = false;
  try {
    await client.query(
      "update public.questions set status = 'review' where id = $1",
      [manualDraftId],
    );
  } catch {
    directBankEscalationDenied = true;
  }
  await client.query("reset role");
  assert(
    directBankEscalationDenied,
    "A Library manager must not bypass Review by changing draft status directly.",
  );

  await client.query("set role authenticated");
  let directBankActivationDenied = false;
  try {
    await client.query(
      `insert into public.bank_questions (
         bank_id, question_id, status, source_kind, added_by
       ) values ($1, $2, 'active', 'manual', $3)`,
      [ids.bank, manualDraftId, ids.teacher],
    );
  } catch {
    directBankActivationDenied = true;
  }
  await client.query("reset role");
  assert(
    directBankActivationDenied,
    "A Library manager must not activate bank_questions outside Review RPC.",
  );

  await client.query("set role authenticated");
  let directGlobalPublishDenied = false;
  try {
    await client.query(
      `insert into public.questions (
         organization_id, question_code, title, question_type, content_html,
         difficulty_rating, status, visibility, created_by, updated_by
       ) values ($1, 'TEACHER-PUBLIC-001', 'Denied public question', 'frq',
         '<p>Denied</p>', 500, 'published', 'public', $2, $2)`,
      [ids.org, ids.teacher],
    );
  } catch {
    directGlobalPublishDenied = true;
  }
  await client.query("reset role");
  assert(
    directGlobalPublishDenied,
    "A teacher must not insert a global published/public question.",
  );

  let teacherGlobalPublishRpcDenied = false;
  try {
    await client.query(
      "select * from public.publish_review_draft_questions(array[$1]::uuid[])",
      [manualDraftId],
    );
  } catch {
    teacherGlobalPublishRpcDenied = true;
  }
  assert(
    teacherGlobalPublishRpcDenied,
    "A teacher must not call the global publish RPC.",
  );

  await client.query(
    "select set_config('request.jwt.claim.role', 'service_role', false)",
  );
  const revisionResult = await client.query(
    "select public.create_bank_question_revision_draft($1, $2, '[]'::jsonb, $3) as id",
    [ids.bank, ids.sourceQuestion, ids.teacher],
  );
  const revisionId = revisionResult.rows[0]?.id;
  assert(revisionId, "Owner revision RPC must return a draft ID.");
  const revisionLineage = await client.query(
    `select q.status, q.revision_of_question_id, q.source_review_item_id,
            item.created_question_id
       from public.questions q
       join public.review_draft_items item on item.id = q.source_review_item_id
      where q.id = $1`,
    [revisionId],
  );
  assert(
    revisionLineage.rows[0]?.status === "draft" &&
      revisionLineage.rows[0]?.revision_of_question_id === ids.sourceQuestion &&
      revisionLineage.rows[0]?.created_question_id === revisionId,
    "Revision question and Review Draft lineage must be mutually linked after FK-safe creation.",
  );

  const approval = await client.query(
    `select * from public.approve_bank_review_question($1, $2)`,
    [revisionId, ids.bank],
  );
  const newBankQuestionId = approval.rows[0]?.bank_question_id;
  const activeRows = await client.query(
    `select id, question_id, status from public.bank_questions
      where bank_id = $1 order by added_at`,
    [ids.bank],
  );
  assert(
    activeRows.rows.some(
      (row) =>
        row.id === ids.sourceBankQuestion &&
        row.question_id === ids.sourceQuestion &&
        row.status === "archived",
    ) &&
      activeRows.rows.some(
        (row) =>
          row.id === newBankQuestionId &&
          row.question_id === revisionId &&
          row.status === "active",
      ),
    "Revision approval must archive only the old bank row and activate the new question.",
  );

  const submissionResult = await client.query(
    `select * from public.submit_bank_questions_to_public_review(array[$1]::uuid[], true)`,
    [newBankQuestionId],
  );
  const submissionId = submissionResult.rows[0]?.submission_id;
  assert(submissionId, "Assignment-ready revision must create a public submission.");
  await client.query(
    "update public.questions set title = 'Teacher edited after submit' where id = $1",
    [revisionId],
  );
  const immutableSnapshot = await client.query(
    `select submitted_snapshot->>'title' as title
       from public.public_question_submissions where id = $1`,
    [submissionId],
  );
  assert(
    immutableSnapshot.rows[0]?.title !== "Teacher edited after submit",
    "Submission snapshot must not track later source edits.",
  );

  for (const [actorLabel, actorId] of [
    ["viewer", ids.viewer],
    ["unrelated teacher", ids.unrelatedTeacher],
    ["student", ids.student],
    ["ordinary Admin", ids.ordinaryAdmin],
  ]) {
    await client.query(
      `select set_config('request.jwt.claim.role', 'authenticated', false),
              set_config('request.jwt.claim.sub', $1, false)`,
      [actorId],
    );
    await client.query("set role authenticated");
    const hiddenSubmissions = await client.query(
      "select count(*)::integer as count from public.public_question_submissions where id = $1",
      [submissionId],
    );
    await client.query("reset role");
    assert(
      hiddenSubmissions.rows[0]?.count === 0,
      `${actorLabel} must not enumerate a teacher's public submission.`,
    );
  }

  await client.query(
    `select set_config('request.jwt.claim.role', 'anon', false),
            set_config('request.jwt.claim.sub', '', false)`,
  );
  await client.query("set role anon");
  let anonymousSubmissionCount = 0;
  let anonymousSubmissionDenied = false;
  try {
    const anonymousSubmissions = await client.query(
      "select count(*)::integer as count from public.public_question_submissions where id = $1",
      [submissionId],
    );
    anonymousSubmissionCount = anonymousSubmissions.rows[0]?.count ?? 0;
  } catch {
    anonymousSubmissionDenied = true;
  }
  await client.query("reset role");
  assert(
    anonymousSubmissionDenied || anonymousSubmissionCount === 0,
    "Anonymous users must not enumerate public submissions.",
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.ordinaryAdmin],
  );
  await client.query("set role authenticated");
  let ordinaryAdminReviewDenied = false;
  try {
    await client.query(
      "select public.review_public_question_submission($1, 'reject', 'Denied ordinary Admin review', '[]'::jsonb)",
      [submissionId],
    );
  } catch {
    ordinaryAdminReviewDenied = true;
  }
  await client.query("reset role");
  assert(
    ordinaryAdminReviewDenied,
    "Ordinary Admin must not review public submissions.",
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.superAdmin],
  );
  const publicApproval = await client.query(
    `select public.review_public_question_submission($1, 'approve', null, '[]'::jsonb) as id`,
    [submissionId],
  );
  const publicQuestionId = publicApproval.rows[0]?.id;
  const publicQuestion = await client.query(
    `select owner_bank_id, status, visibility, public_submission_id
       from public.questions where id = $1`,
    [publicQuestionId],
  );
  assert(
    publicQuestion.rows[0]?.owner_bank_id === null &&
      publicQuestion.rows[0]?.status === "published" &&
      publicQuestion.rows[0]?.visibility === "public" &&
      publicQuestion.rows[0]?.public_submission_id === submissionId,
    "Super Admin approval must create an independent global public question.",
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.student],
  );
  await client.query("set role authenticated");
  const studentQuestionScope = await client.query(
    `select
       count(*) filter (where id = $1)::integer as public_count,
       count(*) filter (where id in ($2, $3))::integer as teacher_private_count
     from public.questions
     where id in ($1, $2, $3)`,
    [publicQuestionId, ids.sourceQuestion, revisionId],
  );
  const studentBankRows = await client.query(
    "select count(*)::integer as count from public.bank_questions where bank_id = $1",
    [ids.bank],
  );
  await client.query("reset role");
  assert(
    studentQuestionScope.rows[0]?.public_count === 1 &&
      studentQuestionScope.rows[0]?.teacher_private_count === 0 &&
      studentBankRows.rows[0]?.count === 0,
    "Student must see the Central Public Library copy without browsing the teacher Library.",
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.teacher],
  );
  let directPullDenied = false;
  try {
    await client.query(
      `select public.pull_public_question_to_bank($1, $2, '[]'::jsonb, $3)`,
      [ids.bank, publicQuestionId, ids.teacher],
    );
  } catch {
    directPullDenied = true;
  }
  assert(directPullDenied, "Authenticated clients must not finalize asset-copy manifests.");

  await client.query(
    "select set_config('request.jwt.claim.role', 'service_role', false)",
  );
  const pull = await client.query(
    `select public.pull_public_question_to_bank($1, $2, '[]'::jsonb, $3) as id`,
    [ids.bank, publicQuestionId, ids.teacher],
  );
  const pulledQuestionId = pull.rows[0]?.id;
  const pulledQuestion = await client.query(
    `select q.owner_bank_id, q.status, q.source, bq.source_kind
       from public.questions q
       join public.bank_questions bq on bq.question_id = q.id
      where q.id = $1`,
    [pulledQuestionId],
  );
  assert(
    pulledQuestion.rows[0]?.owner_bank_id === ids.bank &&
      pulledQuestion.rows[0]?.status === "review" &&
      pulledQuestion.rows[0]?.source_kind === "public_pull" &&
      pulledQuestion.rows[0]?.source === `public_question:${publicQuestionId}`,
    "Public pull must create an independent assignment-ready Library copy with lineage.",
  );

  console.log("PASS viewer cannot create Library drafts or revisions");
  console.log("PASS owner manual draft is private and bank-scoped");
  console.log("PASS direct bank activation and global publication bypasses are denied");
  console.log("PASS revision FK lineage and atomic active-row swap");
  console.log("PASS immutable submission and independent Super Admin public copy");
  console.log("PASS viewer read-only Review blocks every question child and Storage mutation");
  console.log("PASS unrelated teacher, ordinary Admin, student, and anon submission isolation");
  console.log("PASS student sees public copy without teacher Library enumeration");
  console.log("PASS independent public pull lineage");
  console.log("PASS public pull asset finalization is server-only");
} finally {
  if (client) await client.end().catch(() => {});
  await harness.cleanup();
}
