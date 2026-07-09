# AI PDF Provider Enablement Readiness Report

Date: 2026-07-08

Branch: `codex/ai-pdf-provider-readiness`

## Executive Summary

The Teacher AI PDF flow is code-ready for provider-backed validation, but the
current known environment blocker remains:

```text
enabled AI PDF provider profiles = 0
```

Until one shared site/org AI PDF-capable provider profile is enabled, a real
teacher PDF upload cannot reach the provider-backed import path.

This task did not create provider profiles, change credentials, edit
`.env.local`, add migrations, or run provider calls.

## Provider Source Of Truth

Provider profiles are configured through the admin provider gateway flow:

- Admin UI: `/admin/ai-settings`
- Page: `src/app/admin/ai-settings/page.tsx`
- Actions: `src/app/admin/ai-settings/actions.ts`
- Runtime helpers: `src/lib/ai-providers/profiles.ts`
- AI PDF routing helpers: `src/lib/ai-providers/adapters.ts`
- Teacher profile abstraction: `src/lib/ai-pdf-import/teacher-parsing-profiles.ts`

The clean schema source of truth is:

- Table: `public.ai_provider_profiles`
- Gateway hash table: `private.ai_provider_gateway_token_hashes`
- Safe listing RPC: `public.list_ai_provider_profiles_for_gateway`
- Enabled listing RPC: `public.list_enabled_ai_provider_profiles_for_gateway`
- Full profile RPC: `public.get_ai_provider_profile_for_gateway`
- Create/update/delete RPCs:
  - `public.create_ai_provider_profile_for_gateway`
  - `public.update_ai_provider_profile_for_gateway`
  - `public.delete_ai_provider_profile_for_gateway`

Relevant profile columns:

- `provider`
- `base_url`
- `model`
- `enabled`
- `is_default`
- `supports_pdf_input`
- `supports_vision_images`
- encrypted API key fields
- `api_key_last4`
- `deleted_at`

Enabled provider discovery requires an enabled, non-deleted profile with stored
key metadata. The gateway RPC only returns safe profile metadata, not raw keys.

## AI PDF-Capable Profiles

AI PDF capability is resolved by `describeAiPdfProviderInput(...)`.

Supported implemented AI PDF strategies are:

- `gemini_native_pdf`
- `page_images`
- `openai_file`
- `mock`

Practical MVP provider setup:

- Gemini Native full PDF:
  - provider mode: `gemini_native`
  - `supports_pdf_input = true`
  - suitable for full PDF import through the Gemini native path
- Gemini OpenAI-compatible page images:
  - provider mode: `gemini_openai`
  - `supports_vision_images = true`
  - suitable for page-image extraction
- Generic OpenAI-compatible full PDF:
  - `supports_pdf_input = true`
  - only if the backend actually supports file/PDF input
- Mock provider:
  - `mock://ai-pdf-import`
  - local/testing only when mock providers are explicitly allowed

DeepSeek text/json profiles are not the primary AI PDF parser unless a verified
image/PDF route is explicitly enabled. They are better treated as text/json or
blueprint-analysis providers.

## Current Blocker

The most recent provider E2E validation report found:

```text
enabled provider profile count: 0
usable AI PDF provider profile count: 0
```

Because of that, `/teacher/banks/[bankId]/imports` correctly shows the disabled
state:

```text
AI PDF parsing is not enabled for this site or organization yet.
```

This is expected until a platform admin enables a shared provider profile.

## Teacher UI Behavior

Teachers do not configure provider names, model IDs, base URLs, API keys, or
vendor settings.

Teacher pages use `listTeacherAIPdfParsingProfileState(...)` and
`resolveTeacherAIPdfProviderProfile(...)`.

Current behavior:

- zero usable profiles:
  - show the disabled alert
  - disable AI PDF import
- one usable profile:
  - auto-use `standard`
  - hide provider/model selector
  - show neutral enabled status
- multiple teacher-visible profiles:
  - show friendly profile labels only
  - allowed labels are `Fast`, `Standard / Recommended`, and
    `Advanced / Limited`

The current implementation exposes only `Standard / Recommended` until the
backend safely maps additional profile routes.

The teacher action rejects raw client-submitted provider configuration fields,
including provider profile IDs, model IDs, vendor names, base URLs, and API key
fields.

## Admin Setup Path

Provider setup belongs in:

```text
Admin / AI Settings
```

Admin setup should be done by a super-admin/platform admin using the existing
safe UI flow:

1. Sign in as a super-admin.
2. Open `/admin/ai-settings`.
3. Create or edit one shared AI PDF-capable provider profile.
4. Choose the correct provider mode:
   - `Gemini Native - Full PDF input` for Gemini native PDF import, or
   - `Gemini OpenAI-compatible - Page images only` for page-image import.
5. Enter the provider base URL, model, and API key in the admin UI only.
6. Enable the profile.
7. Optionally mark it as the default provider.
8. Use `Test connection` for a safe connectivity check.
9. Save the profile.
10. Restart the dev server only if `.env.local` server env values were changed.
11. Return to `/teacher/banks/[bankId]/imports`.
12. Confirm the teacher page now says AI PDF parsing is enabled.
13. Re-run Teacher AI PDF Provider E2E validation.

## Secret Handling

Do not paste provider keys into chat.

Do not commit:

- provider API keys
- gateway tokens
- encryption keys
- anon keys
- service-role keys
- DB passwords
- credential-bearing URLs
- `.env.local`

Provider keys should only be entered through the existing Admin / AI Settings
flow or another ignored local environment mechanism approved for local setup.

The admin UI displays only `api_key_last4`. It does not display raw provider
keys after saving.

## Can Codex Safely Perform Setup?

Codex can safely verify the setup path and run non-secret readiness checks.

Codex should only perform actual provider setup if all of the following are
true:

- the user/admin provides secrets through the existing local UI or a local
  process-only prompt, not chat;
- no secret values are printed;
- no secret values are written to tracked files;
- the existing Admin / AI Settings flow is used;
- the target is the clean local/disposable environment, not old Supabase or
  production.

Otherwise, the user/admin should configure the provider manually through Admin /
AI Settings and then ask Codex to rerun validation.

## Mock / Seed Status

There is mock-provider support in code for local/testing only, guarded by
`ENABLE_MOCK_AI_PROVIDER` or non-production mode. This can validate plumbing but
does not prove real Gemini provider behavior.

The clean seed draft includes a disabled DeepSeek placeholder. It is not enabled
and is not AI PDF-capable. It should not be treated as a ready provider for
teacher PDF E2E validation.

## Safe Readiness Smoke

A safe provider readiness check can inspect only metadata:

- enabled provider count
- AI PDF-capable provider count
- provider mode/strategy labels
- `api_key_last4` presence
- storage bucket presence

It must not print encrypted credential fields, raw keys, gateway tokens, service
role keys, full prompts, or provider responses.

Existing related scripts/checks:

- `scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `scripts/real-gemini-import-qa.mjs`

The bridge smoke is source/static and secret-safe. Real provider QA should only
run after a shared enabled AI PDF-capable profile exists.

## Stash Audit

Inspected:

```text
stash@{0}: On codex/bank-scoped-ai-pdf-import-bridge: local follow-up fixes before teacher AI PDF E2E validation
```

Commands run:

```text
git stash show --stat stash@{0}
git stash show -p stash@{0}
```

Tracked files in the stash:

- `scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `scripts/classroom-ui-rebuild-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/teacher-workspace-shell-smoke.mjs`
- `src/app/teacher/banks/[bankId]/imports/page.tsx`
- `src/app/teacher/banks/[bankId]/review/page.tsx`
- `src/app/teacher/banks/actions.ts`
- `src/app/teacher/classrooms/[id]/people/page.tsx`
- `src/app/teacher/classrooms/actions.ts`
- `src/components/ai-pdf-import-loading-skeleton.tsx`
- `src/components/form-submit-button.tsx`
- `src/lib/ai-pdf-import/service.ts`
- `src/lib/ai-pdf-import/teacher-parsing-profiles.ts`
- `src/lib/ai-providers/profiles.ts`
- `src/lib/question-banks.ts`
- `src/lib/supabase/server.ts`

Untracked files stored in the stash's untracked parent:

- `src/app/teacher/ai-parsing/loading.tsx`
- `src/app/teacher/banks/[bankId]/imports/loading.tsx`

Audit result:

- These were necessary follow-up fixes from manual teacher testing.
- They are now already present on latest `main` through PR `#171`.
- The stash should not be applied to this readiness branch.
- Recommended action: keep the stash until the user confirms there is no need
  to recover it, then drop `stash@{0}` in a separate cleanup step.

## Next Step

Enable one shared AI PDF-capable provider profile through Admin / AI Settings.

Then rerun:

```text
Teacher private PDF
-> selected Question Bank
-> shared site/org AI provider
-> bank-scoped Review Drafts
-> approve into bank
-> publish assignment
-> student practice
-> evidence persists
```

Recommended next PR:

```text
codex/teacher-ai-pdf-provider-e2e-validation-rerun
```

or rerun the existing Teacher AI PDF Provider E2E validation task after the
provider is enabled.

## Non-goals

- No product features.
- No provider credential changes.
- No `.env.local` edits.
- No migrations.
- No old Supabase work.
- No provider calls.
- No Review Draft approval or publishing.
- No weakening of admin/provider guards.
