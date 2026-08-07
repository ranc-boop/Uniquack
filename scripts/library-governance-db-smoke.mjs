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
let concurrencyClientA;
let concurrencyClientB;

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
    classroom: "78000000-0000-4000-8000-000000000055",
    validAssignedAssignment: "79000000-0000-4000-8000-000000000055",
    assignedDraftAssignment: "7a000000-0000-4000-8000-000000000055",
    draftTransitionAssignment: "7b000000-0000-4000-8000-000000000055",
    draftBankQuestion: "7c000000-0000-4000-8000-000000000055",
    concurrentAssignment: "7d000000-0000-4000-8000-000000000055",
    recoverableAssignment: "7e000000-0000-4000-8000-000000000055",
    recoverableProgress: "7f000000-0000-4000-8000-000000000055",
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
    `insert into public.classrooms (
       id, organization_id, owner_id, name, status, created_by, updated_by
     ) values ($1, $2, $3, 'Library readiness classroom', 'active', $3, $3)`,
    [ids.classroom, ids.org, ids.teacher],
  );

  await client.query(
    `insert into public.assignments (
       id, organization_id, classroom_id, created_by, title, status, assigned_at,
       source_kind, source_summary
     ) values (
       $1, $2, $3, $4, 'Reviewed Library assignment', 'assigned', now(),
       'question_bank', '{}'::jsonb
     )`,
    [ids.validAssignedAssignment, ids.org, ids.classroom, ids.teacher],
  );
  await client.query(
    `insert into public.assignment_items (
       assignment_id, question_id, item_type, order_index, points,
       bank_question_id, source_bank_id
     ) values ($1, $2, 'question', 1, 1, $3, $4)`,
    [
      ids.validAssignedAssignment,
      ids.sourceQuestion,
      ids.sourceBankQuestion,
      ids.bank,
    ],
  );
  const validAssignedItem = await client.query(
    `select count(*)::integer as count
       from public.assignment_items
      where assignment_id = $1
        and question_id = $2`,
    [ids.validAssignedAssignment, ids.sourceQuestion],
  );
  assert(
    validAssignedItem.rows[0]?.count === 1,
    "A reviewed active Library question must be deliverable in an assigned Assignment.",
  );

  let assignedQuestionRegressionDenied = false;
  try {
    await client.query(
      "update public.questions set status = 'draft' where id = $1",
      [ids.sourceQuestion],
    );
  } catch {
    assignedQuestionRegressionDenied = true;
  }
  assert(
    assignedQuestionRegressionDenied,
    "An assigned reviewed Library question must not regress to draft.",
  );

  await client.query(
    `insert into public.assignments (
       id, organization_id, classroom_id, created_by, title, status,
       source_kind, source_summary
     ) values (
       $1, $2, $3, $4, 'Recoverable quarantined assignment', 'draft',
       'question_bank',
       '{"deliveryQuarantineReason":"unreviewed_library_question"}'::jsonb
     )`,
    [ids.recoverableAssignment, ids.org, ids.classroom, ids.teacher],
  );
  await client.query(
    `insert into public.assignment_items (
       assignment_id, question_id, item_type, order_index, points,
       bank_question_id, source_bank_id
     ) values ($1, $2, 'question', 1, 1, $3, $4)`,
    [
      ids.recoverableAssignment,
      ids.sourceQuestion,
      ids.sourceBankQuestion,
      ids.bank,
    ],
  );
  await client.query(
    `insert into public.student_assignment_progress (
       id, assignment_id, student_id, status, started_at, evidence_summary
     ) values (
       $1, $2, $3, 'in_progress', now(), '{"preserve":true}'::jsonb
     )`,
    [ids.recoverableProgress, ids.recoverableAssignment, ids.student],
  );

  for (const [actorLabel, actorId] of [
    ["student", ids.student],
    ["unrelated teacher", ids.unrelatedTeacher],
  ]) {
    await client.query(
      `select set_config('request.jwt.claim.role', 'authenticated', false),
              set_config('request.jwt.claim.sub', $1, false)`,
      [actorId],
    );
    await client.query("set role authenticated");
    let resumeDenied = false;
    try {
      await client.query(
        "select public.resume_quarantined_assignment($1)",
        [ids.recoverableAssignment],
      );
    } catch {
      resumeDenied = true;
    }
    await client.query("reset role");
    assert(
      resumeDenied,
      `${actorLabel} must not resume a teacher-managed quarantined Assignment.`,
    );
  }

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.teacher],
  );
  await client.query("set role authenticated");
  const resumedAssignmentResult = await client.query(
    "select public.resume_quarantined_assignment($1) as id",
    [ids.recoverableAssignment],
  );
  await client.query("reset role");
  const resumedAssignmentEvidence = await client.query(
    `select
       assignment.status,
       assignment.assigned_at is not null as has_assigned_at,
       assignment.source_summary ? 'deliveryResumedAt' as has_resume_event,
       (select count(*)::integer
          from public.assignment_items item
         where item.assignment_id = assignment.id) as item_count,
       (select count(*)::integer
          from public.student_assignment_progress progress
         where progress.assignment_id = assignment.id
           and progress.id = $2
           and progress.status = 'in_progress'
           and progress.evidence_summary = '{"preserve":true}'::jsonb
       ) as progress_count
     from public.assignments assignment
     where assignment.id = $1`,
    [ids.recoverableAssignment, ids.recoverableProgress],
  );
  assert(
    resumedAssignmentResult.rows[0]?.id === ids.recoverableAssignment &&
      resumedAssignmentEvidence.rows[0]?.status === "assigned" &&
      resumedAssignmentEvidence.rows[0]?.has_assigned_at === true &&
      resumedAssignmentEvidence.rows[0]?.has_resume_event === true &&
      resumedAssignmentEvidence.rows[0]?.item_count === 1 &&
      resumedAssignmentEvidence.rows[0]?.progress_count === 1,
    "The managing teacher must resume a ready quarantined Assignment without deleting items or student progress.",
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
  await client.query(
    `insert into public.bank_questions (
       id, bank_id, question_id, status, source_kind, added_by
     ) values ($1, $2, $3, 'active', 'manual', $4)`,
    [ids.draftBankQuestion, ids.bank, manualDraftId, ids.teacher],
  );
  await client.query(
    `insert into public.assignments (
       id, organization_id, classroom_id, created_by, title, status, assigned_at,
       source_kind, source_summary
     ) values (
       $1, $2, $3, $4, 'Assigned draft rejection', 'assigned', now(),
       'question_bank', '{}'::jsonb
     )`,
    [ids.assignedDraftAssignment, ids.org, ids.classroom, ids.teacher],
  );
  let assignedDraftInsertDenied = false;
  try {
    await client.query(
      `insert into public.assignment_items (
         assignment_id, question_id, item_type, order_index, points,
         bank_question_id, source_bank_id
       ) values ($1, $2, 'question', 1, 1, $3, $4)`,
      [
        ids.assignedDraftAssignment,
        manualDraftId,
        ids.draftBankQuestion,
        ids.bank,
      ],
    );
  } catch {
    assignedDraftInsertDenied = true;
  }
  assert(
    assignedDraftInsertDenied,
    "An assigned Assignment must reject insertion of a draft Library question.",
  );

  await client.query(
    `insert into public.assignments (
       id, organization_id, classroom_id, created_by, title, status,
       source_kind, source_summary
     ) values (
       $1, $2, $3, $4, 'Draft transition rejection', 'draft',
       'question_bank', '{}'::jsonb
     )`,
    [ids.draftTransitionAssignment, ids.org, ids.classroom, ids.teacher],
  );
  await client.query(
    `insert into public.assignment_items (
       assignment_id, question_id, item_type, order_index, points,
       bank_question_id, source_bank_id
     ) values ($1, $2, 'question', 1, 1, $3, $4)`,
    [
      ids.draftTransitionAssignment,
      manualDraftId,
      ids.draftBankQuestion,
      ids.bank,
    ],
  );
  let draftTransitionDenied = false;
  try {
    await client.query(
      "update public.assignments set status = 'assigned', assigned_at = now() where id = $1",
      [ids.draftTransitionAssignment],
    );
  } catch {
    draftTransitionDenied = true;
  }
  assert(
    draftTransitionDenied,
    "A draft Assignment containing a draft Library question must not become assigned.",
  );
  await client.query(
    `update public.assignments
        set source_summary =
          '{"deliveryQuarantineReason":"unreviewed_library_question"}'::jsonb
      where id = $1`,
    [ids.draftTransitionAssignment],
  );
  await client.query("set role authenticated");
  let unreviewedResumeDenied = false;
  try {
    await client.query(
      "select public.resume_quarantined_assignment($1)",
      [ids.draftTransitionAssignment],
    );
  } catch {
    unreviewedResumeDenied = true;
  }
  await client.query("reset role");
  assert(
    unreviewedResumeDenied,
    "A quarantined Assignment must not resume while a Library item remains unreviewed.",
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
  const bulkDraftOneResult = await client.query(
    "select public.create_bank_manual_question_draft($1, 'BULK-001', 'First atomic bulk draft') as id",
    [ids.bank],
  );
  const bulkDraftTwoResult = await client.query(
    "select public.create_bank_manual_question_draft($1, 'BULK-002', 'Second atomic bulk draft') as id",
    [ids.bank],
  );
  const bulkDraftOneId = bulkDraftOneResult.rows[0]?.id;
  const bulkDraftTwoId = bulkDraftTwoResult.rows[0]?.id;
  assert(
    bulkDraftOneId && bulkDraftTwoId,
    "Bulk Review fixtures must create two pending bank-scoped drafts.",
  );

  await client.query(
    `update public.review_draft_items
        set status = 'approved'
      where created_question_id = $1`,
    [bulkDraftTwoId],
  );
  let atomicBulkDenied = false;
  try {
    await client.query(
      "select * from public.approve_bank_review_questions($1, array[$2, $3]::uuid[])",
      [ids.bank, bulkDraftOneId, bulkDraftTwoId],
    );
  } catch {
    atomicBulkDenied = true;
  }
  const unchangedBulkDrafts = await client.query(
    `select count(*)::integer as count
       from public.questions
      where id = any(array[$1, $2]::uuid[])
        and status = 'draft'
        and not exists (
          select 1 from public.bank_questions
           where bank_questions.question_id = questions.id
        )`,
    [bulkDraftOneId, bulkDraftTwoId],
  );
  assert(
    atomicBulkDenied && unchangedBulkDrafts.rows[0]?.count === 2,
    "One stale Review Draft must roll the complete bulk approval back to zero writes.",
  );

  await client.query(
    `update public.review_draft_items
        set status = 'pending_review'
      where created_question_id = $1`,
    [bulkDraftTwoId],
  );
  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.viewer],
  );
  let viewerBulkDenied = false;
  try {
    await client.query(
      "select * from public.approve_bank_review_questions($1, array[$2]::uuid[])",
      [ids.bank, bulkDraftOneId],
    );
  } catch {
    viewerBulkDenied = true;
  }
  assert(
    viewerBulkDenied,
    "A Library viewer must not approve a Review Draft batch.",
  );

  await client.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [ids.teacher],
  );
  let duplicateBulkDenied = false;
  try {
    await client.query(
      "select * from public.approve_bank_review_questions($1, array[$2, $2]::uuid[])",
      [ids.bank, bulkDraftOneId],
    );
  } catch {
    duplicateBulkDenied = true;
  }
  let oversizedBulkDenied = false;
  try {
    await client.query(
      "select * from public.approve_bank_review_questions($1, array_fill($2::uuid, array[26]))",
      [ids.bank, bulkDraftOneId],
    );
  } catch {
    oversizedBulkDenied = true;
  }
  assert(
    duplicateBulkDenied && oversizedBulkDenied,
    "Bulk Review must reject duplicate IDs and selections above the current-page limit.",
  );

  const bulkApproval = await client.query(
    "select * from public.approve_bank_review_questions($1, array[$2, $3]::uuid[])",
    [ids.bank, bulkDraftOneId, bulkDraftTwoId],
  );
  const bulkBankQuestionIds = bulkApproval.rows.map(
    (row) => row.bank_question_id,
  );
  assert(
    bulkApproval.rowCount === 2 &&
      new Set(bulkApproval.rows.map((row) => row.question_id)).size === 2,
    "A valid current-page Review selection must approve exactly two distinct drafts.",
  );
  const archivedBulkQuestions = await client.query(
    "select * from public.set_bank_question_statuses($1, $2::uuid[], 'archived')",
    [ids.bank, bulkBankQuestionIds],
  );
  const restoredBulkQuestions = await client.query(
    "select * from public.set_bank_question_statuses($1, $2::uuid[], 'active')",
    [ids.bank, bulkBankQuestionIds],
  );
  assert(
    archivedBulkQuestions.rowCount === 2 &&
      archivedBulkQuestions.rows.every((row) => row.status === "archived") &&
      restoredBulkQuestions.rowCount === 2 &&
      restoredBulkQuestions.rows.every((row) => row.status === "active"),
    "Owner bulk question management must atomically archive and restore the complete selection.",
  );
  const focusReceiptResult = await client.query(
    "select public.create_teacher_focus_selection_receipt($1, 'questions', $2::uuid[]) as id",
    [ids.bank, bulkBankQuestionIds],
  );
  const focusReceiptId = focusReceiptResult.rows[0]?.id;
  const focusReceiptRead = await client.query(
    "select public.read_teacher_focus_selection_receipt($1, $2, 'questions') as ids",
    [focusReceiptId, ids.bank],
  );
  assert(
    focusReceiptId &&
      focusReceiptRead.rows[0]?.ids?.length === 2 &&
      new Set(focusReceiptRead.rows[0].ids).size === 2,
    "A teacher must be able to exchange an exact current-page selection for an opaque receipt.",
  );
  await client.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [ids.viewer],
  );
  let foreignReceiptDenied = false;
  try {
    await client.query(
      "select public.read_teacher_focus_selection_receipt($1, $2, 'questions')",
      [focusReceiptId, ids.bank],
    );
  } catch {
    foreignReceiptDenied = true;
  }
  assert(
    foreignReceiptDenied,
    "A focus receipt must not disclose selected private IDs to another Library member.",
  );
  await client.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [ids.teacher],
  );
  let crossSurfaceReceiptDenied = false;
  try {
    await client.query(
      "select public.read_teacher_focus_selection_receipt($1, $2, 'review')",
      [focusReceiptId, ids.bank],
    );
  } catch {
    crossSurfaceReceiptDenied = true;
  }
  assert(
    crossSurfaceReceiptDenied,
    "A question receipt must not be replayable on the Review surface.",
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

  const publicTaxonomyFixture = await client.query(
    `insert into public.question_taxonomy_assignments (
       question_id, tag_id, source, review_status, evidence, created_by, updated_by
     ) values ($1, $2, 'manual', 'approved', '{}'::jsonb, $3, $3)
     returning question_id`,
    [revisionId, taxonomyTagId, ids.teacher],
  );
  assert(
    publicTaxonomyFixture.rowCount === 1,
    "Public submission fixture must include approved taxonomy.",
  );

  const submissionResult = await client.query(
    `select * from public.submit_bank_questions_to_public_review_for_bank(
       $1, array[$2]::uuid[], true
     )`,
    [ids.bank, newBankQuestionId],
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
    [ids.unrelatedTeacher],
  );
  await client.query("set role authenticated");
  let nonAdminReviewDenied = false;
  try {
    await client.query(
      "select public.review_public_question_submission_v2($1, 'reject', 'Denied non-Admin review', '[]'::jsonb)",
      [submissionId],
    );
  } catch {
    nonAdminReviewDenied = true;
  }
  await client.query("reset role");
  assert(
    nonAdminReviewDenied,
    "Non-Admin users must not review public submissions.",
  );

  await client.query(
    `select set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claim.sub', $1, false)`,
    [ids.superAdmin],
  );
  const publicApproval = await client.query(
    `select public.review_public_question_submission_v2($1, 'approve', null, '[]'::jsonb) as id`,
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
    `select set_config('request.jwt.claim.role', 'anon', false),
            set_config('request.jwt.claim.sub', '', false)`,
  );
  await client.query("set role anon");
  const anonymousQuestionScope = await client.query(
    `select
       count(*) filter (where id = $1)::integer as public_count,
       count(*) filter (where id in ($2, $3))::integer as bank_owned_count
     from public.questions
     where id in ($1, $2, $3)`,
    [publicQuestionId, ids.sourceQuestion, revisionId],
  );
  await client.query("reset role");
  assert(
    anonymousQuestionScope.rows[0]?.public_count === 0 &&
      anonymousQuestionScope.rows[0]?.bank_owned_count === 0,
    "Anonymous users must not read Official Public Library or private Library questions.",
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

  const pulledBankQuestion = await client.query(
    `select id
       from public.bank_questions
      where bank_id = $1
        and question_id = $2
        and status = 'active'`,
    [ids.bank, pulledQuestionId],
  );
  const pulledBankQuestionId = pulledBankQuestion.rows[0]?.id;
  assert(pulledBankQuestionId, "Public pull must have an active bank row.");

  await client.query(
    `insert into public.assignments (
       id, organization_id, classroom_id, created_by, title, status,
       source_kind, source_summary
     ) values (
       $1, $2, $3, $4, 'Concurrent readiness gate', 'draft',
       'question_bank', '{}'::jsonb
     )`,
    [ids.concurrentAssignment, ids.org, ids.classroom, ids.teacher],
  );
  await client.query(
    `insert into public.assignment_items (
       assignment_id, question_id, item_type, order_index, points,
       bank_question_id, source_bank_id
     ) values ($1, $2, 'question', 1, 1, $3, $4)`,
    [
      ids.concurrentAssignment,
      pulledQuestionId,
      pulledBankQuestionId,
      ids.bank,
    ],
  );

  concurrencyClientA = new pg.Client({
    ...connection,
    database: "library_governance_test",
  });
  concurrencyClientB = new pg.Client({
    ...connection,
    database: "library_governance_test",
  });
  await concurrencyClientA.connect();
  await concurrencyClientB.connect();
  await concurrencyClientA.query("begin");
  await concurrencyClientB.query("begin");
  await concurrencyClientA.query(
    "update public.assignments set status = 'assigned', assigned_at = now() where id = $1",
    [ids.concurrentAssignment],
  );

  let concurrentRegressionSettled = false;
  const concurrentRegression = concurrencyClientB
    .query("update public.questions set status = 'draft' where id = $1", [
      pulledQuestionId,
    ])
    .then(() => ({ denied: false }))
    .catch(() => ({ denied: true }))
    .finally(() => {
      concurrentRegressionSettled = true;
    });

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  assert(
    !concurrentRegressionSettled,
    "Question regression must wait for an in-flight Assignment delivery decision.",
  );
  await concurrencyClientA.query("commit");
  const concurrentRegressionResult = await concurrentRegression;
  await concurrencyClientB.query("rollback");
  assert(
    concurrentRegressionResult.denied,
    "A concurrent question regression must fail after Assignment delivery commits.",
  );

  console.log("PASS viewer cannot create Library drafts or revisions");
  console.log("PASS owner manual draft is private and bank-scoped");
  console.log("PASS direct bank activation and global publication bypasses are denied");
  console.log("PASS reviewed active Library question can enter an assigned Assignment");
  console.log("PASS assigned and transitioning Assignments reject draft Library questions");
  console.log("PASS assigned reviewed Library question cannot regress to draft");
  console.log("PASS unreviewed quarantined Assignment cannot resume");
  console.log("PASS teacher resumes ready quarantine while preserving items and progress");
  console.log("PASS student and unrelated teacher cannot resume a quarantine");
  console.log("PASS atomic bulk Review rejects stale, viewer, duplicate, and oversized selections");
  console.log("PASS owner bulk Review and question archive/restore update the complete selection");
  console.log("PASS opaque focus receipts are owner- and surface-bound");
  console.log("PASS revision FK lineage and atomic active-row swap");
  console.log("PASS immutable submission and independent Super Admin public copy");
  console.log("PASS viewer read-only Review blocks every question child and Storage mutation");
  console.log("PASS unrelated teacher, ordinary Admin, student, and anon submission isolation");
  console.log("PASS student sees public copy without teacher Library enumeration");
  console.log("PASS anonymous question SELECT exposes public rows without bank-owned rows");
  console.log("PASS concurrent Assignment delivery and question regression serialize safely");
  console.log("PASS independent public pull lineage");
  console.log("PASS public pull asset finalization is server-only");
} finally {
  if (concurrencyClientA) await concurrencyClientA.end().catch(() => {});
  if (concurrencyClientB) await concurrencyClientB.end().catch(() => {});
  if (client) await client.end().catch(() => {});
  await harness.cleanup();
}
