# Storage URL Backfill — Legacy `question-assets` Public URLs

Status: Commits 1 and 2 of the `security/p0-storage-private-access` plan. Both prepare idempotent backfills only. Neither changes bucket visibility, Storage policies, Question RLS, or application rendering code, and neither has been run against production or any live environment as part of these changes.

- **Commit 1** ([scripts/backfill-question-asset-urls.mjs](../scripts/backfill-question-asset-urls.mjs)): plain-text HTML columns.
- **Commit 2** ([scripts/backfill-question-asset-urls-jsonb.mjs](../scripts/backfill-question-asset-urls-jsonb.mjs)): JSONB columns, covering the four columns Commit 1 identified but deliberately left out (see "JSONB columns" below, now covered rather than excluded).

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

### JSONB columns (Commit 1: excluded; Commit 2: covered)

The following columns are JSONB blobs that may contain a serialized copy of a question's HTML (including embedded asset URLs) as a nested string value, not as a plain-text column:

- `practice_round_questions.question_snapshot`
- `practice_attempts.question_snapshot`
- `practice_wrong_questions.question_snapshot`
- `review_draft_items.draft_payload`

Commit 1 deliberately excluded these: a blind regex substitution against a `jsonb::text` cast risks corrupting JSON structure (quoting/escaping is not guaranteed to round-trip identically) or missing occurrences nested under keys that don't match a naive scan. Commit 2 covers all four with a JSON-aware recursive traversal instead of a text-cast regex — see "Commit 2: JSONB-Aware Backfill" below.

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

## Production deployment steps (Commit 1: plain-text HTML columns)

This section documents the intended procedure for a future, separate deployment action. **No part of this has been executed in this commit.**

1. Take a database snapshot/backup immediately before running with `--apply` (required for rollback per above).
2. Run `node scripts/backfill-question-asset-urls.mjs --report ./tmp/backfill-prod-dry-run.json` (dry run) against production and review the summary and unmapped list with a human before proceeding.
3. Triage every unmapped entry: confirm each is either genuinely orphaned (acceptable to leave as a legacy public URL for now) or fix the underlying `question_assets` data and re-run the dry run until the unmapped list is understood and accepted.
4. Run `node scripts/backfill-question-asset-urls.mjs --apply --report ./tmp/backfill-prod-apply.json`.
5. Run the verification queries in [scripts/question-asset-url-backfill-verify.sql](../scripts/question-asset-url-backfill-verify.sql) against production and compare against the apply report's totals.
6. Keep the bucket public and do not touch Storage policies or Question RLS as part of this deployment — those are separate, later commits in this plan, gated on confirming (via query 1 above, repeated periodically) that no new legacy URLs are being written by any remaining code path.

---

## Commit 2: JSONB-Aware Backfill

Covers the four JSONB columns identified but excluded above: `practice_round_questions.question_snapshot`, `practice_attempts.question_snapshot`, `practice_wrong_questions.question_snapshot`, `review_draft_items.draft_payload`.

### Recursive traversal strategy

[scripts/lib/question-asset-json-rewrite.mjs](../scripts/lib/question-asset-json-rewrite.mjs) reuses the exact same URL-matching/replacement logic as Commit 1 (`LEGACY_QUESTION_ASSET_URL_PATTERN`, `rewriteQuestionAssetUrls`, imported unchanged from [scripts/lib/question-asset-url-rewrite.mjs](../scripts/lib/question-asset-url-rewrite.mjs)) — the two backfills cannot disagree about what counts as a legacy URL or how it's rewritten, because they share the same string-level primitive.

The JSONB value is never cast to text and regex-replaced as a whole. supabase-js already returns a JSONB column as a parsed JS value (object, array, string, number, boolean, or `null`); `rewriteQuestionAssetUrlsInJson(value, assetIdByStoragePath)` walks that value recursively:

- **string**: passed through the Commit 1 string-level rewriter unchanged; only matched URL substrings inside the string are replaced, everything else in the string is preserved exactly.
- **array**: every element is processed recursively in order; a new array is built preserving element order and length.
- **plain object**: every `[key, value]` pair is processed recursively via `Object.entries` (which iterates in insertion order); a new object is built inserting keys in the same order, so key order is preserved.
- **number / boolean / null / undefined**: returned as-is, untouched — these can never contain a URL, so no traversal is needed into them.

Every rewrite call returns a brand-new value (the input is never mutated), plus `changed`, `replaced`, and `unmapped` (with a JSON-pointer-style `path`, e.g. `["items", 0, "html"]`, locating exactly where each occurrence was found — this generalizes Commit 1's flat per-row reporting to arbitrary nesting depth). A companion `findLegacyQuestionAssetUrlsInJson(value)` performs the same traversal read-only, used by the backfill script to collect every referenced `storage_path` across all rows before doing any bulk lookups, mirroring Commit 1's two-pass (collect-then-resolve-then-rewrite) structure.

### Affected columns

| Table | Column | Notes |
|---|---|---|
| `practice_round_questions` | `question_snapshot` | Snapshot of a question object (may embed `content_html`-shaped strings) taken when a practice round is generated. |
| `practice_attempts` | `question_snapshot` | Snapshot of a question object taken at attempt time. |
| `practice_wrong_questions` | `question_snapshot` | Snapshot of a question object retained for spaced-repetition/wrong-question review. |
| `review_draft_items` | `draft_payload` | Draft question payload prior to becoming a real `questions` row (AI-import/review-draft pipeline). |

No other JSONB columns matching this shape were found beyond the four identified in Commit 1's audit; no new columns were discovered while implementing Commit 2.

### Unresolved URL handling

Identical policy to Commit 1, generalized to JSON: an occurrence is unresolved when its extracted `storage_path` has no matching `question_assets.storage_path` row. Unresolved occurrences are left in the JSON exactly as found (the containing string is returned unchanged for that occurrence; the rest of the JSON tree is still rebuilt identically in shape) and are never guessed, dropped, or overwritten. Every unresolved occurrence is collected into the run summary with its table, column, row ID, JSON path (e.g. `$.items[0].html`), the original URL, and the extracted `storage_path`, both printed to stdout and — when `--report <path>` is passed — written to a JSON report file. Nothing is written back to the database for unresolved occurrences.

[scripts/question-asset-url-backfill-jsonb-verify.sql](../scripts/question-asset-url-backfill-jsonb-verify.sql) query 4 provides an independent, SQL-side cross-check using `jsonb_path_query` to walk every string leaf inside a JSONB column and anti-join against `question_assets`, for verifying the script's own unresolved report without trusting the script's arithmetic.

### Dry-run / apply procedure

```bash
# 1. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and a service-role key
#    (CLEAN_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY) pointing at the
#    target environment (start with a non-production environment).

# 2. Dry run (default mode — no writes are issued):
npm run backfill:question-asset-urls-jsonb
# or directly:
node scripts/backfill-question-asset-urls-jsonb.mjs

# 3. Dry run with a full JSON report of planned changes and unresolved cases:
node scripts/backfill-question-asset-urls-jsonb.mjs --report ./tmp/backfill-jsonb-dry-run.json

# 4. Apply (writes changes) — only after reviewing the dry-run report:
node scripts/backfill-question-asset-urls-jsonb.mjs --apply --report ./tmp/backfill-jsonb-apply.json
```

Same idempotency guarantee as Commit 1, verified by [scripts/question-asset-url-backfill-jsonb-test.mjs](../scripts/question-asset-url-backfill-jsonb-test.mjs)'s repeated-execution tests: re-running against already-migrated JSON (or JSON with no legacy URLs at all) reports `changed: false` for every row and issues zero writes.

### Rollback procedure

Same approach as Commit 1: this backfill only rewrites string values inside existing JSONB fields, in place — it does not add/remove/rename any column and does not touch `question_assets`, Storage objects, RLS, or bucket configuration.

1. **Point-in-time restore** of the affected tables (`practice_round_questions`, `practice_attempts`, `practice_wrong_questions`, `review_draft_items`) from a pre-`--apply` backup/snapshot — required, not optional, before running `--apply` in production.
2. **Report-driven identification, snapshot-driven reversal**: the `--report` output identifies exactly which rows/columns changed (table, column, row ID, replacement count) but — same limitation as Commit 1 — does not itself contain a full before/after diff sufficient to reconstruct prior values; the pre-apply snapshot is the actual rollback mechanism.
3. **Forward fix**: as with Commit 1, the new route continues to serve the same underlying asset, so in most cases the practical remedy for a bad mapping is fixing the underlying `question_assets` row and re-running the backfill, not reverting to the legacy URL format.

### Deployment order

Commit 2 depends on Commit 1 only in the sense that both write the same target route format (`/api/question-assets/{assetId}`) and share the same resolution table (`question_assets`); they operate on disjoint sets of columns and can be applied independently, but the recommended order keeps verification simple:

1. Complete Commit 1's production deployment steps (above) first, including its verification queries, so the plain-HTML columns are already clean.
2. Take a fresh database snapshot/backup (or confirm the existing one covers the JSONB target tables) before running Commit 2 with `--apply`.
3. Run `node scripts/backfill-question-asset-urls-jsonb.mjs --report ./tmp/backfill-jsonb-prod-dry-run.json` (dry run) against production; review the summary and unresolved list with a human.
4. Triage every unresolved entry the same way as Commit 1: confirm genuinely orphaned references are acceptable to leave, or fix `question_assets` data and re-run the dry run until the unresolved list is understood and accepted.
5. Run `node scripts/backfill-question-asset-urls-jsonb.mjs --apply --report ./tmp/backfill-jsonb-prod-apply.json`.
6. Run [scripts/question-asset-url-backfill-jsonb-verify.sql](../scripts/question-asset-url-backfill-jsonb-verify.sql) against production and compare against the apply report's totals.
7. Only after both Commit 1 and Commit 2 are verified clean (or all remaining legacy references are confirmed intentionally unresolved) does it become safe to consider the bucket-visibility change — which remains a separate, later commit, not part of either backfill.
