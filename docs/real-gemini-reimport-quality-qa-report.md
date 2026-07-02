# Real Gemini Reimport Quality QA

Date: 2026-07-02

## Executive summary

The AI PDF import draft quality fixes are present on latest `main`, including source metadata, organization context, MCQ normalization, missing-solution warnings, and clean `question_assets` storage fields.

A fresh real Gemini reimport was attempted for this QA pass, but it was blocked before any provider call or import batch creation. Safe provider metadata shows an enabled Gemini Native PDF provider exists in the clean Supabase database, but the provider gateway RPC used by the import runtime returned no enabled providers from the non-interactive QA runner. The runner could not establish an authenticated clean Supabase admin session using the local smoke credentials, and service-role table access is not equivalent to the app gateway path because the gateway RPC also checks admin context.

No provider API key, gateway token, encryption key, anon key, service-role key, raw provider response, or full prompt was printed or committed.

## Main fix presence

Confirmed in latest `main`:

- AI PDF organization context is wired into import batch creation.
- AI PDF source metadata fields are populated for generated draft questions.
- Draft quality fixes are merged.
- `supabase/clean-migrations/0015_question_assets_storage_bucket.sql` exists.
- Batch import smoke includes clean-schema answer spec handling.

## Import summary

- Provider selected: Gemini Native PDF provider metadata was found safely in the clean database.
- Model: `gemini-2.5-flash`.
- Fresh reimport status: blocked before import batch creation.
- Provider call result: not executed.
- Source file: synthetic PDF fixture was prepared but not uploaded because provider loading was blocked.
- Drafts created: 0 in this QA run.
- Reached Review Drafts: no new Review Draft batch was created in this QA run.

## Blocking detail

The clean database contains enabled Gemini provider metadata, but:

- `list_enabled_ai_provider_profiles_for_gateway` returned an empty provider list in the QA runner.
- Re-running the safe gateway hash setup helper updated the existing gateway token hash row and confirmed raw token material was not stored.
- The gateway RPC still returned no enabled provider rows afterward.
- The QA runner could not sign in as the clean admin using the local smoke env credentials, so it could not reproduce the browser's authenticated admin context.

This blocks automated real-provider reimport verification without weakening gateway checks or bypassing the app provider path.

## Solution/explanation quality check

Not exercised with a new real import in this run because provider loading was blocked before import creation.

Expected post-fix behavior remains:

- Missing solution/explanation fields should create review warnings instead of silently producing complete-looking drafts.
- Prompt rules request real solution fields without inventing answers.

## MCQ answer_spec check

Not exercised with a new real import in this run because provider loading was blocked before import creation.

Expected post-fix behavior remains:

- MCQ drafts with options should not retain `answer_spec.kind = "frq"`.
- MCQ normalization should produce a non-FRQ answer spec when options are present.

## Asset/crop attachment check

Not exercised with a new real import in this run because no new draft assets were created.

Confirmed code and migration support the clean fields:

- `asset_kind`
- `storage_bucket`
- `storage_path`
- `label`
- `alt_text`

## Review Draft / no-auto-publish confirmation

No new generated drafts were created in this QA run.

Safety status:

- No drafts were approved.
- No drafts were rejected.
- No questions were published.
- No auto-publish path was exercised or enabled.

## Source/provenance metadata confirmation

Not exercised with a new real import in this run because no new import batch was created.

The merged source metadata fix is present in code and should populate the clean schema source fields on the next successful import.

## Organization alignment confirmation

Not exercised with a new real import in this run because no new import batch was created.

The merged organization context fix is present in code and should align import rows with the active `edustruct-clean-mvp` organization context on the next successful import.

## Taxonomy pending_review confirmation

Not exercised with a new real import in this run because no new draft rows were created.

No official taxonomy assignments were written by this QA run.

## Provider log safety confirmation

No real provider call was made in this QA run, so no new provider operation log was created.

Safety checks observed:

- No raw provider key material was printed.
- No raw provider response was printed.
- No full prompt was printed.
- Only safe provider metadata was inspected.

## Tests run

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `node scripts/security-smoke.mjs` passed.
- `node scripts/supabase-rls-smoke.mjs` passed after rerun with network access.
- `node scripts/route-smoke.mjs` passed.
- `npm.cmd run smoke` passed after rerun with network access.

Initial sandboxed RLS/network attempts hit `fetch failed`; the same checks passed when allowed network access to the clean Supabase project.

## Remaining blockers before manual approval

1. A real fresh Gemini reimport still needs to be run from an authenticated clean admin browser session, or the QA runner needs a valid authenticated clean admin session.
2. The provider gateway visibility mismatch should be investigated: safe direct metadata shows the enabled Gemini provider, while the gateway list RPC returned no enabled providers in the non-interactive QA runner.
3. Once a fresh import succeeds, inspect the newly created Review Draft batch for solution fields, MCQ answer specs, asset rows, source/provenance metadata, organization alignment, and pending taxonomy state before manual approval.

## Recommended next task

Fix or document the clean Supabase provider gateway QA execution path so automated real-provider import QA can run with the same authenticated admin context as the browser app. Then rerun this QA against a fresh Gemini import and inspect the newly generated Review Draft batch.
