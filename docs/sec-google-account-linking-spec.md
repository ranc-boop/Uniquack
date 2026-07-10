# SEC-GOOGLE1 — Google Account Linking Security Spec

Status: **Design only.** No runtime code, migrations, credentials, UI, or `.env` changes accompany this document. This spec defines requirements and boundaries for a future implementation; it does not implement Google Login or Classroom integration.

## 0. Scope and current-state baseline

EduStruct today has **zero** Google/OAuth infrastructure. Auth is Supabase username/password only (`src/app/auth/actions.ts`, `src/lib/supabase/middleware.ts`). Authorization is a flat role enum on `profiles.role` (`super_admin | admin | teacher | student`, [database.ts:9](src/types/database.ts:9)) enforced by `private.is_*()` SQL helpers ([0001_foundations_identity_organizations.sql](supabase/clean-migrations/0001_foundations_identity_organizations.sql)) plus route guards ([guards.ts](src/lib/auth/guards.ts), [roles.ts](src/lib/auth/roles.ts)). This spec adds a **new, additive** identity-linking layer on top of that model — it must not change how `profiles.role` is assigned or enforced.

This spec covers: OAuth handshake integrity, token storage, the `google_account_links` schema, linking/unlinking flows, duplicate/wrong-account handling, and the boundaries between Google identity, role, Classroom access, and AI provider config. It does **not** cover: Classroom API business logic beyond the self-service boundary, org-level or teacher-on-behalf-of Classroom actions (explicitly deferred, see §11), or resolving the pre-existing 4-value `question_banks.visibility` schema gap (see §0.1).

### 0.1 Known pre-existing gap (not resolved by this spec)

`question_banks.visibility` currently allows `('private', 'shared', 'organization', 'public')` ([0025_question_banks_foundation.sql:10-11](supabase/clean-migrations/0025_question_banks_foundation.sql:10)). This spec's canonical visibility model (§9) is **Private / Shared / Public only**, per product direction. The existing `organization` value is a **known gap** between current schema and target model. Reconciling it (fold into `Shared`, or remove) is out of scope for SEC-GOOGLE1 and is listed as an implementation blocker in §14.

---

## 1. Threat Model

| # | Threat | Actor | Impact | Mitigation (this spec) |
|---|---|---|---|---|
| T1 | CSRF on OAuth callback — attacker tricks victim into linking attacker's Google account to victim's session | External attacker | Attacker gains ability to auth as victim via Google, or victim's Classroom data routes to attacker's Google identity | `state` parameter bound to session, validated on callback (§2) |
| T2 | Authorization code injection / replay | External attacker | Attacker links their own account using an intercepted code | `state`/`nonce` single-use, short TTL, bound to originating session (§2) |
| T3 | Token exfiltration via XSS or logging | External attacker, insider | Refresh token theft → persistent Classroom access as the user | Refresh tokens encrypted at rest, access tokens never leave server, never logged (§3) |
| T4 | Account takeover via re-linking | External attacker who compromises victim's Google account | Attacker relinks victim's Google identity to attacker's EduStruct profile | Duplicate-link collision blocked; requires admin-mediated unlink (§6, §7) |
| T5 | Privilege escalation via Google identity claims (e.g. spoofed `hd` domain, email claims) | Malicious or compromised Google account | Attacker gains teacher/admin role without going through admin-driven role grant | Google identity **never** writes to `profiles.role`; domain signal only feeds `trust_status`, never role (§9) |
| T6 | Classroom membership conflated with content-bank access | Malicious teacher/student, or bug | Student in a classroom gains read/write to a teacher's private question bank | Classroom membership and bank membership are enforced by fully independent RLS checks; no implicit grant either direction (§11) |
| T7 | Provider secret leakage via a linking or Classroom code path | Insider, compromised session | AI provider API keys/ciphertext exposed through an unrelated feature | `google_account_links` and Classroom endpoints must never join against or return `ai_provider_profiles` secret columns (§12) |
| T8 | Stale/orphaned Google grant after unlink | Any user who unlinked | Google-side access persists even though EduStruct forgot the link | Unlink must call Google's revoke endpoint, not just delete the local row (§8) |
| T9 | Server-side token misuse across users | Compromised server process, bug in Classroom integration code | One user's access token used to act as another user | Access tokens decrypted only inside a request scoped to the owning `profiles.id`; no cross-user token access (§3, §11) |

---

## 2. OAuth State / Nonce Validation

- **`state`**: cryptographically random (≥ 32 bytes), generated server-side per link attempt, stored server-side (session or short-lived table) keyed to the initiating `profiles.id`, single-use, TTL ≤ 10 minutes. Callback must reject if `state` is missing, expired, already consumed, or doesn't match the session that initiated the request.
- **`nonce`** (OIDC ID token replay protection): required if/when an ID token is consumed for identity claims (email, `sub`, `hd`). Generated alongside `state`, validated against the `nonce` claim in the returned ID token.
- **PKCE**: required (`code_verifier`/`code_challenge`, S256) regardless of client confidentiality, as defense in depth for the authorization code exchange.
- Both `state` and `nonce` must be invalidated (deleted or marked consumed) immediately after first use — no replay window.
- The callback handler must re-verify the initiating session is still the same authenticated `profiles.id` that started the flow before writing any link record (prevents session-fixation-style linking).

---

## 3. Token Storage Plan

### 3.1 Refresh token encryption
- Refresh tokens are encrypted at rest. Required properties (mechanism deferred to implementation, per design decision):
  - Authenticated encryption (e.g. AES-256-GCM), ciphertext + IV + auth tag stored, following the existing pattern's shape in [encryption.ts](src/lib/ai-providers/encryption.ts) — but implementation **must** use a key materially isolated from `AI_PROVIDER_ENCRYPTION_KEY` (separate secret, separate rotation lifecycle). Reusing the AI-provider key would couple two unrelated trust boundaries.
  - Decryption only ever happens server-side (`server-only` guarded module, same convention as `encryption.ts:1`), never in a client bundle, never in a log statement.
  - Key rotation story must be defined at implementation time (versioned key ID stored alongside ciphertext, or equivalent) — flagged as an implementation blocker (§14).

### 3.2 Access token — server-side only
- Google **access tokens** are never persisted long-term. They are minted on demand (server-side) from the encrypted refresh token, held in memory only for the duration of the outbound Classroom API call, and discarded.
- Access tokens must never be sent to the browser, never included in API responses to the client, never logged (including error logs / stack traces — redact on catch).
- If short-lived caching of an access token is needed for performance, it must be server-side only (e.g. in-process, not a client-readable store), with TTL no longer than the token's own expiry.

---

## 4. `google_account_links` Design

One row per linked Google identity, one link per `profiles.id` (per confirmed scope decision — a profile may have at most one active Google link).

```
google_account_links
  id                    uuid primary key
  user_id               uuid not null references profiles(id) on delete cascade, unique
  google_subject        text not null unique        -- Google 'sub' claim, stable identifier
  google_email          text not null                -- for display/audit only, not an identity key
  google_hd             text                          -- Workspace hosted-domain claim, if present
  refresh_token_ciphertext  text not null
  refresh_token_iv          text not null
  refresh_token_tag         text not null
  token_key_version      text not null                -- for future key rotation
  scopes                text[] not null                -- granted OAuth scopes, minimal set
  trust_status           text not null default 'unverified'
                          check (trust_status in ('unverified', 'domain_verified'))
  linked_at              timestamptz not null default now()
  last_verified_at       timestamptz                   -- last successful token refresh/use
  created_by             uuid references profiles(id)  -- always = user_id; self-service only (§10)
  created_at             timestamptz not null default now()
  updated_at             timestamptz not null default now()
```

Notes:
- `user_id unique` enforces "one link per profile." `google_subject unique` enforces "one profile per Google identity" — together these are what makes duplicate-link collisions detectable (§6).
- `trust_status` is **separate from and unrelated to** `profiles.role` and `question_banks.visibility` — see §9. It exists only to record "this Google identity's domain claim was verified," nothing more.
- No `role` or `permission` column exists on this table by design — linking must never carry authorization payload.
- RLS: row visible/writable only to `user_id = auth.uid()` or `private.is_super_admin()` (support/audit). No teacher/org-staff read access — this is user-private data, distinct from org-scoped content tables like `question_banks`.
- Unlinking is a hard delete of this row (§8), not a status flag — there is intentionally no `unlinked_at`/soft-delete column; the audit trail for collisions lives in a separate append-only log (§6), not on this table.

---

## 5. Account Linking Flow

1. User is already authenticated in EduStruct (existing session, either username/password or a prior Google login — see §10 for Google-as-login).
2. User initiates "Link Google Account" from their own profile settings (self-service only; no admin-initiated linking).
3. Server generates `state` + `nonce` + PKCE challenge, persists them keyed to the current `profiles.id`, redirects to Google's OAuth consent screen with the minimal Classroom scope set required.
4. Google redirects back with `code` + `state`.
5. Server validates `state`/`nonce` (§2), exchanges `code` for tokens server-side, verifies the ID token (`nonce`, issuer, audience).
6. Server checks for an existing `google_account_links` row with the same `google_subject`:
   - None found → proceed to step 7.
   - Found, belongs to the same `user_id` → idempotent no-op (already linked), refresh tokens in place.
   - Found, belongs to a **different** `user_id` → reject; do not write; enter duplicate-handling path (§6).
7. Server checks whether the current `profiles.id` already has a `google_account_links` row (unique constraint):
   - Present → reject; user must unlink existing Google account first (one-link-per-profile).
8. Server encrypts refresh token, inserts the `google_account_links` row, sets `trust_status` per §9 domain check.
9. Confirmation shown to user; no role or visibility change occurs as a side effect.

---

## 6. Duplicate Account Handling

"Duplicate" = the same `google_subject` already has an active link to a **different** `profiles.id` than the one attempting to link.

- The attempt is **blocked outright** (per confirmed decision) — no auto-merge, no silent takeover.
- The collision is written to an append-only audit log (new table or reuse of a generic security-events log if one exists at implementation time — none currently does; flagged in §14) capturing: timestamp, attempted `user_id`, existing `user_id`, `google_subject`, `google_email`.
- The user attempting to link sees a generic error ("This Google account is already linked to another EduStruct account") — must not leak which account it's linked to (avoids account enumeration).
- Resolution requires an **admin-mediated unlink**: an admin (via existing `private.is_admin()`/`private.is_super_admin()` boundary) reviews the audit entry and, if legitimate, unlinks the existing record (§8) before the new user can retry. This is a manual, logged action — no self-service override.

---

## 7. Wrong Account Linking Prevention

"Wrong account" = user intends to link Google account A but Google's consent flow authenticates a different Google account (e.g. multiple Google sessions in the browser), or a state/nonce mismatch indicates a non-consensual flow.

Controls:
- `state` bound to the initiating session (§2) prevents a link completing under a session that didn't start it.
- After token exchange, the server surfaces the resolved `google_email`/`google_subject` to the user for **explicit confirmation** before the row is committed — do not auto-commit on callback alone. (This is a UX/flow requirement for implementation, not optional.)
- Google's `prompt=select_account` (or equivalent) should be requested on the authorization URL so the user is shown an account chooser rather than silently using an already-active Google session — reduces accidental wrong-account linking when multiple Google accounts are logged into the browser.
- Duplicate check (§6) is the backstop if a wrong-account link is attempted despite the above.

---

## 8. Unlink / Revoke Flow

Per confirmed decision: **full revoke** — both Google-side revocation and local hard delete.

1. User (self-service, or admin acting on a flagged duplicate per §6) initiates unlink.
2. Server decrypts the stored refresh token server-side only, calls Google's token revocation endpoint (`https://oauth2.googleapis.com/revoke` or current equivalent).
3. Revocation call failure handling: if Google revocation fails (network error, already-revoked-upstream), still proceed to delete the local row — a missing local record with a possibly-still-valid Google grant is a lesser risk than an orphaned local record blocking re-linking. Log the revocation failure for audit.
4. Server hard-deletes the `google_account_links` row.
5. If the unlink was admin-initiated (duplicate resolution), write an audit entry distinct from the collision entry in §6 (who unlinked, when, why).
6. No `profiles.role` or `trust_status`-derived state elsewhere is touched by unlink beyond removing the link row itself — unlink must not cascade into role changes (consistent with §9).

---

## 9. Role Escalation Prevention

Non-negotiable boundary per product direction: **Google identity must never imply teacher/admin role.**

- `google_account_links` has no `role` column and no code path may write to `profiles.role` as a result of linking, unlinking, or any Google claim.
- The **only** effect a verified Google identity may have is setting `google_account_links.trust_status = 'domain_verified'` when the ID token's `hd` (hosted domain) claim matches an admin-configured allowlist of trusted school domains. This is a **trust/verification signal only**.
- `trust_status` is distinct from and must never be read as a substitute for `profiles.role`, `question_banks.visibility`, or `classroom_members.role`. Authorization checks (`private.is_admin()`, `private.is_teacher_or_admin()`, etc.) must never reference `google_account_links.trust_status`.
- Any actual role change (student → teacher, teacher → admin) continues to require the existing admin-driven flow (whatever grants `profiles.role` today) — this spec adds no new role-granting path.
- Authentication (proving who you are, via Google or password) and authorization (what `profiles.role` lets you do) are treated as fully separate concerns; linking Google identity affects only the former.

---

## 10. Google Login Boundary

Per confirmed decision, Google Sign-In is a **second, equal login path** into the same Supabase-backed account — not merely a Classroom-token-linking mechanism.

- Google Login authenticates a session; it does not, by itself, create authorization. A successful Google login must resolve to an existing `profiles` row (via `google_account_links.google_subject` → `user_id`) or go through an explicit account-creation/linking flow — it must never silently create a `profiles` row with an elevated role.
- New-account-via-Google (if enabled at implementation time) must default new profiles to the lowest-privilege role (`student`), identical to the default for username/password signup today — no exception for verified school domains (that only sets `trust_status`, per §9).
- Google Login must go through the same session/cookie mechanism already used by Supabase Auth (`src/lib/supabase/server.ts`, `middleware.ts`) — no parallel session system.
- The `state`/`nonce`/PKCE requirements in §2 apply identically whether the flow is "link Google to existing account" or "log in with Google."
- Boundary: Google Login answers "is this a legitimate returning user," never "what can this user do." The latter is answered exclusively by `profiles.role` via existing RLS helpers.

---

## 11. Classroom Boundary

Per confirmed decision, SEC-GOOGLE1 defines this boundary as **self-service only**.

- A server-side Classroom API call may only be made using the access token derived from the `google_account_links` row where `user_id = ` the currently authenticated session's `profiles.id`. No code path may decrypt or use another user's refresh token.
- **Classroom membership must never imply bank membership**, and the reverse: `classroom_members` (role: teacher/co_teacher/student, per [0018_classroom_foundation.sql:19-30](supabase/clean-migrations/0018_classroom_foundation.sql:19)) and `bank_members` (role: owner/editor/viewer, per [0025_question_banks_foundation.sql:21-34](supabase/clean-migrations/0025_question_banks_foundation.sql:21)) are independent tables with independent RLS. A Google-Classroom-linked teacher gains no implicit `bank_members` row, and no query may join `classroom_members` to authorize `question_banks`/`bank_questions` access or vice versa.
- **Explicitly out of scope for SEC-GOOGLE1** (future spec required before building): org-admin or co-teacher acting on behalf of another linked user's Classroom grant, bulk/service-account Classroom sync, and any Classroom write operation initiated by a role other than the token's own owner. This spec only establishes that the boundary exists and must remain self-service-only until a follow-up spec explicitly authorizes broader access.

---

## 12. Provider Secret Boundary

Non-negotiable boundary per product direction: **AI provider access must never expose provider configuration.**

- `google_account_links` (this spec's new table) and `ai_provider_profiles` (existing, [0002_...](supabase/clean-migrations)) are unrelated trust domains. No endpoint, RPC, or view may join them or return one's secret material via a code path that authorizes on the other.
- Encryption keys are isolated per §3.1 — the Google refresh-token encryption key must not be the same value as `AI_PROVIDER_ENCRYPTION_KEY`, and neither should be derivable from the other.
- Any API surface that returns `google_account_links` data to a client (e.g. "your linked account" UI) must explicitly select only non-secret columns (`google_email`, `trust_status`, `linked_at`) — never `refresh_token_ciphertext`/`iv`/`tag`, mirroring the existing `api_key_last4`-only-to-client pattern in [profiles.ts](src/lib/ai-providers/profiles.ts).
- Server-side Classroom token decryption (§3.2) must not share a code path, request context, or log stream with AI provider key decryption — keep the two "decrypt a secret" operations in separate modules, same convention as `encryption.ts` being scoped to `src/lib/ai-providers/`.

---

## 13. Smoke / Security Test Checklist

To be implemented as automated smoke tests (following the existing `*-security-smoke.mjs` convention referenced in [docs/ai-pdf-import-cleanup-audit.md:319](docs/ai-pdf-import-cleanup-audit.md:319)) before this feature ships:

- [ ] OAuth callback rejects missing `state`
- [ ] OAuth callback rejects mismatched/foreign `state`
- [ ] OAuth callback rejects reused (already-consumed) `state`
- [ ] OAuth callback rejects expired `state` (past TTL)
- [ ] ID token with mismatched `nonce` is rejected
- [ ] Linking attempt with a `google_subject` already linked to another user is blocked, and does not leak the other user's identity in the error response
- [ ] Linking attempt when current user already has an active link is blocked (one-link-per-profile enforced)
- [ ] `google_account_links` row is unreachable via RLS to any `user_id` other than the owner (except `is_super_admin()`)
- [ ] Client-facing API responses for linked-account data never include ciphertext/iv/tag fields
- [ ] Access token is never present in any log line (grep server logs post-flow for token-shaped strings)
- [ ] Unlink calls Google's revoke endpoint (verify via mock/stub in test) before/alongside local delete
- [ ] Unlink still deletes local row even when Google revoke call fails (simulate failure)
- [ ] Linking a Google account never changes `profiles.role` (assert role unchanged pre/post link across all four roles)
- [ ] Domain-verified `trust_status` never grants access to any `private.is_*()` RLS check (assert a `trust_status='domain_verified'` student still fails `is_teacher_or_admin()`)
- [ ] `classroom_members` role grants no row in `bank_members` and no bypass of `bank_members`-gated RLS policies
- [ ] `bank_members` role grants no row in `classroom_members` and no bypass of `classroom_members`-gated RLS policies
- [ ] Classroom API call using User A's session cannot access User B's `google_account_links` token (attempt cross-user call, expect denial)
- [ ] No query path joins `google_account_links` to `ai_provider_profiles` or returns AI provider ciphertext via any Google-linking-related endpoint
- [ ] Google login (if enabled) for a brand-new user defaults `profiles.role = 'student'`, never elevated, regardless of `hd` domain

---

## 14. Implementation Blockers

Items that must be resolved with explicit decisions/config before implementation can begin:

1. **Key management for refresh-token encryption**: concrete mechanism (app-level AES-GCM with a new dedicated env var vs. Supabase Vault/pgsodium) and rotation strategy are deferred by design (§3.1) — must be decided at implementation kickoff, not assumed.
2. **Trusted domain allowlist source of truth**: where the admin-configured list of `hd` domains eligible for `trust_status = 'domain_verified'` lives (config table vs. env var vs. org-level setting) is undefined — needs a decision before §9 can be built.
3. **Collision audit log location**: no generic security-events/audit-log table currently exists in the schema; §6 and §8 both require one. Needs either a new dedicated table or a decision to extend an existing logging mechanism (e.g. the pattern used by `ai_provider_operation_logs`).
4. **`question_banks.visibility` 4-vs-3-value gap** (§0.1): must be reconciled (fold `organization` into `Shared`, or remove it) before any visibility-adjacent UI work references the 3-value model this spec assumes. Not resolved here — flagged for a separate migration/spec.
5. **Google Cloud project / OAuth client registration**: this spec assumes a registered OAuth client with defined scopes exists or will be created outside this repo — credential provisioning is explicitly out of scope for SEC-GOOGLE1 and must happen via the team's standard secret-provisioning process, not by an agent.
6. **Classroom scope minimization**: exact list of Google Classroom OAuth scopes needed for the self-service boundary (§11) must be enumerated by whoever implements the Classroom API integration — this spec sets the boundary, not the scope list.
7. **Session/account-creation semantics for Google Login** (§10): whether Google Login can create a brand-new `profiles` row automatically, or must always route through an explicit "create account" confirmation step, needs a product decision before implementation.
