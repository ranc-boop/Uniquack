# Storage URL Backfill — Legacy `question-assets` Public URLs

Status: Commit 1 of the `security/p0-storage-private-access` plan. Prepares an idempotent backfill only. Does **not** change bucket visibility, Storage policies, or Question RLS, and has **not** been run against production or any live environment as part of this change.

## Fields and URL formats found

### Audited columns

Every column in the schema whose name or evident purpose suggested it could hold rendered HTML was checked against `supabase/clean-migrations/*.sql`. Five plain-text HTML columns can embed question-asset URLs:

| Table | Column | Nullable | Notes |
|---|---|---|---|
| `questions` | `content_html` | not null | Primary question body. |
| `questions` | `solution_html` | nullable | Worked solution. |
| `question_rubric_steps` | `content_html` | not null | Per-step rubric text. |
| `practice_round_questions` | `content_html` | not null, default `''` | Snapshot of a question's `content_html` taken when a practice round is generated (preserves what the student actually saw). |
| `practice_attempts` | `solution_html` | nullable | Snapshot of a question's `solution_html` at attempt time. |

`explanation_html` does not exist anywhere in the schema — it was not found and is not included. No other `*_html` column exists in `supabase/clean-migrations/`.

### JSONB columns identified but intentionally excluded from this pass

The following columns are JSONB blobs that may contain a serialized copy of a question's HTML (including embedded asset URLs) as a nested string value, not as a plain-text column:

- `practice_round_questions.question_snapshot`
- `practice_attempts.question_snapshot`
- `practice_wrong_questions.question_snapshot`
- `review_draft_items.draft_payload`

These are excluded from Commit 1 deliberately: a blind regex substitution against a `jsonb::text` cast risks corrupting JSON structure (quoting/escaping is not guaranteed to round-trip identically) or missing occurrences nested under keys that don't match a naive scan. Rewriting these safely requires JSON-aware traversal (parse → walk known HTML-bearing keys → rewrite → re-serialize), which is a larger, separate piece of work with its own review. They are called out here so they aren't silently forgotten, not because they're out of scope forever — see "Future migration recommendation" in the prior report and treat this as a backlog item for a follow-up commit, not part of `security/p0-storage-private-access` Commit 1.

### Legacy public URL format

Supabase Storage's `getPublicUrl()` (the call this backfill replaces, per the prior PR) produces:

```
{SUPABASE_URL}/storage/v1/object/public/question-assets/{storage_path}
```

where `{storage_path}` is exactly the value stored in `question_assets.storage_path` (e.g. `questions/{questionId}/{assetId}.png`). Only one bucket name (`question-assets`) and one path convention were found anywhere in the codebase or migration history — there is no evidence of a prior bucket rename or an alternate historical URL shape.

The matching pattern used throughout this backfill is deliberately host-agnostic (no hardcoded project ref or scheme), since `SUPABASE_URL` differs across local/staging/production environments and the same regex must work unmodified against any of them:

```
https?://[^\s"'<>]+/storage/v1/object/public/question-assets/([^\s"'<>]+)
```

(implemented in [scripts/lib/question-asset-url-rewrite.mjs](../scripts/lib/question-asset-url-rewrite.mjs) as `LEGACY_QUESTION_ASSET_URL_PATTERN`)

## Mapping strategy

1. **Scan** every target column for rows whose value contains the literal substring `/storage/v1/object/public/question-assets/` (cheap `ilike` prefilter before any regex work).
2. **Extract** every legacy URL occurrence per row via the pattern above, capturing the `storage_path` suffix.
3. **Resolve**, in bulk, each distinct `storage_path` to a `question_assets.id` via `select id, storage_path from question_assets where storage_path in (...)`. The asset ID is looked up by exact `storage_path` match against the real table — it is not parsed or guessed from the filename, so the mapping is correct even if a historical path convention ever differed from today's `questions/{questionId}/{assetId}.{ext}` shape.
4. **Rewrite**: each resolved occurrence is replaced with `/api/question-assets/{assetId}` (the authorized route introduced in the prior PR). Everything else in the field — surrounding markup, attributes, whitespace, unrelated text — is left byte-for-byte identical, since only the matched URL substrings are touched.
5. **Write** only rows whose content actually changed (`result.changed === true`); rows with nothing to do are never sent an `UPDATE`.

No signed URL is ever read, generated, or stored by this backfill — the only value written is the stable route path `/api/question-assets/{assetId}`, which itself performs authorization and signing per-request (see the prior PR's report).

### Why idempotent

Re-running the script is always safe:
- Already-migrated occurrences (`/api/question-assets/{id}`) simply do not match the legacy pattern, so a second pass finds nothing left to replace for them — this is a property of the regex, not a special-cased check.
- Rows with zero legacy-URL matches are skipped entirely (no `UPDATE` issued), so re-running against an already-clean database is a no-op read-only scan.
- [scripts/question-asset-url-backfill-test.mjs](../scripts/question-asset-url-backfill-test.mjs) has explicit idempotency tests: running `rewriteQuestionAssetUrls` twice on the same input (feeding the first output back in) produces identical output the second time, with `changed: false` and zero further replacements.

## Unmapped-case handling

An occurrence is "unmapped" when its `storage_path` has no matching row in `question_assets` (e.g. the metadata row was deleted after the HTML was written, or a hand-authored/legacy import referenced a path that was never a real asset). Unmapped occurrences are:

- **Never guessed or dropped** — the original URL text is left exactly as-is in the field.
- **Never silently ignored** — every unmapped occurrence is collected into the run's summary (`summary.unmapped`), grouped by table/column/row ID, with the original URL and extracted `storage_path`.
- **Reported** to stdout (a warning with the total count) and, if `--report <path>` is passed, written in full to a local JSON file for manual triage. Nothing is written back to the database for these occurrences.

[scripts/question-asset-url-backfill-verify.sql](../scripts/question-asset-url-backfill-verify.sql) query 4 provides an independent, DB-side cross-check of the same unmapped set (rows with a legacy reference that has no corresponding `question_assets` row), for verifying the script's own report against the database directly.

## Dry-run procedure

```bash
# 1. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and a service-role key
#    (CLEAN_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY) pointing at the
#    target environment (start with a non-production environment).

# 2. Dry run (default mode — no writes are issued):
npm run backfill:question-asset-urls
# or directly:
node scripts/backfill-question-asset-urls.mjs

# 3. Dry run with a full JSON report of planned changes and unmapped cases:
node scripts/backfill-question-asset-urls.mjs --report ./tmp/backfill-dry-run.json
```

The dry-run prints, per target table/column, how many rows contain a legacy URL, how many distinct `storage_path` values were resolved, and totals for rows/URLs that *would* change — without writing anything. Review the console summary (and the report file, if requested) before ever passing `--apply`.

## Verification queries

[scripts/question-asset-url-backfill-verify.sql](../scripts/question-asset-url-backfill-verify.sql) contains four read-only queries, intended to be run manually before and after `--apply`:

1. Count of rows per target column still containing a legacy URL (expect this to drop to the unmapped-only count after `--apply`).
2. Count of rows per target column now containing the authorized route (`/api/question-assets/`) — a positive control that the backfill actually wrote something.
3. A sample of rows still containing a legacy URL post-`--apply`, for manual inspection.
4. An independent SQL-side reproduction of the "unmapped" set (legacy `storage_path` values with no matching `question_assets` row), to cross-check the script's own report without trusting the script's arithmetic.

None of these queries modify data.

## Rollback procedure

This backfill only rewrites URL substrings inside existing HTML fields; it does not drop or restructure any column, and it does not touch `question_assets`, Storage objects, RLS, or bucket configuration. Rollback options, in order of preference:

1. **Point-in-time restore** of the affected tables (`questions`, `question_rubric_steps`, `practice_round_questions`, `practice_attempts`) from a pre-`--apply` backup/snapshot, if the environment's normal backup process was followed before running with `--apply` (see Production Deployment Steps — a pre-apply snapshot is a required step, not optional).
2. **Report-driven manual reversal**: because `--report <path>` records, for every changed row, the table/column/row ID and replacement count (though not a full before/after diff), a reversal would need the same pre-apply snapshot to reconstruct exact prior values — the report alone is not sufficient to reverse a change byte-for-byte, only to identify which rows were touched. This is a known limitation (see below); treat the pre-apply snapshot as the actual rollback mechanism.
3. **Forward fix**: since the new route path continues to serve the same underlying asset (once the follow-up PRs land), in most cases rollback is unnecessary even if a mapping turns out to be wrong — the practical fix is correcting the `question_assets` row or re-running the backfill after fixing the underlying data, not reverting to the old public-URL format.

## Production deployment steps

This section documents the intended procedure for a future, separate deployment action. **No part of this has been executed in this commit.**

1. Take a database snapshot/backup immediately before running with `--apply` (required for rollback per above).
2. Run `node scripts/backfill-question-asset-urls.mjs --report ./tmp/backfill-prod-dry-run.json` (dry run) against production and review the summary and unmapped list with a human before proceeding.
3. Triage every unmapped entry: confirm each is either genuinely orphaned (acceptable to leave as a legacy public URL for now) or fix the underlying `question_assets` data and re-run the dry run until the unmapped list is understood and accepted.
4. Run `node scripts/backfill-question-asset-urls.mjs --apply --report ./tmp/backfill-prod-apply.json`.
5. Run the verification queries in [scripts/question-asset-url-backfill-verify.sql](../scripts/question-asset-url-backfill-verify.sql) against production and compare against the apply report's totals.
6. Keep the bucket public and do not touch Storage policies or Question RLS as part of this deployment — those are separate, later commits in this plan, gated on confirming (via query 1 above, repeated periodically) that no new legacy URLs are being written by any remaining code path.
