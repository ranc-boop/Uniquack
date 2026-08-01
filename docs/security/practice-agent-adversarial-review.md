# Practice Agent adversarial review

## Scope

This review covers authenticated Practice recommendation, answer submission, grading, hints, round review, session recovery, provider networking, public trace output, and Assignment-linked Practice. It also considers user-authored question content as indirect model input.

The work used separate reliability, prompt-input, and Agent-security review contexts. No unreviewed AI content is published or assigned by these changes.

## Threat results

| Threat | Result | Control |
| --- | --- | --- |
| Direct prompt injection through goal, answer, hint context, notes, or memory | Mitigated | Server length/type bounds; prompts mark user content as untrusted data and reject instruction precedence changes. |
| Indirect injection through question text or stored thread/tool-policy notices | Mitigated | Question/source/answer bounds; database notices remain user-context data rather than system messages. |
| System prompt, tool schema, raw reasoning, or provider payload disclosure | Mitigated | Public traces now expose only server-authored phase/timing/count summaries; model thought, raw contracts, internal tool names/call IDs, args, observations, usage, and payloads are removed. |
| Grade endpoint used as an answer oracle or forged Assignment submission | Partially mitigated | Session and round ownership, active status, exact persisted question-set matching, and deterministic objective grading prevent forgery. Assignment feedback-release policy remains a product decision below. |
| Hint endpoint used for arbitrary questions, concurrent limit bypass, or unlimited model calls | Mitigated | Active owned round membership, bounded answer/history input, per-question hint cap, atomic request admission, and a per-user operation lease are enforced. |
| Lost or cross-contaminated state while switching rounds/sessions | Mitigated | Abort/generation guards, navigation locks, per-round answer drafts, reset-aware active-session recovery, canonical stream-result flushing, and persisted status recovery are enforced. |
| Free-compute abuse through repeated or concurrent Agent calls | Mitigated | Migrations 0073-0075 provide atomic minute/hour admission plus short-lived per-user operation leases; duplicate active-round generation is rejected. |
| Oversized user/admin prompt or import input | Mitigated | Practice lists enforce item/count/aggregate limits; Blueprint and framework inputs have server/UI limits; manual JSON import is capped at 2 MiB and 1000 questions. |
| Provider response memory exhaustion | Mitigated | Streaming and non-streaming response byte ceilings plus early `Content-Length` rejection cover Practice, Chat, Gemini, Teacher Blueprint, Blueprint generation/repair, and PDF Blueprint analysis. |
| Provider base URL SSRF or redirect to internal services | Mitigated with residual below | HTTPS/public-host syntax checks, runtime DNS address checks, embedded-credential denial, redirect denial, and Gemini upload-URL revalidation. |
| Error causes the whole Practice route to become unusable | Mitigated | Route error boundary offers safe reset/re-entry without rendering raw error messages. |
| Repeating all questions destroys evidence | Mitigated | Migration 0072 records a per-user cycle boundary; attempts, mistakes, sessions, and Assignment evidence are retained. |
| Round review loses single newlines or partial Markdown | Mitigated | Review surfaces use the shared math/Markdown renderer with soft-line-break preservation. |

## Residual risks and required follow-up

1. **P0 — direct browser mutation of Practice evidence.** Canonical migration 0047 still permits an authenticated learner to write rows they own in several Practice evidence tables. The API now validates normal writes, but a caller using the Data API can bypass those route checks. Correct remediation is a forward-only migration that revokes browser writes and replaces every legitimate server write with narrow, identity-derived RPCs or a separately authenticated server-only persistence boundary. Removing policies without migrating all session, round, attempt, hint, completion, preference, wrong-question, and Assignment linkage writes would break the product and was deliberately not done in this change.
2. **P1 — Assignment answer-release policy is undefined.** An Assignment Practice round currently returns correct options, accepted answers, and solutions after any complete non-empty submission. That is appropriate for formative immediate-feedback Practice but not necessarily for a controlled assessment. The Assignment domain has no feedback-release policy field to enforce. Hiding this material without a teacher-facing policy would change product semantics, so the next product slice must define formative versus assessment mode and release timing before changing the response contract.
3. **P1 — DNS rebinding race.** Provider hostnames are resolved and checked before `fetch`, and redirects are disabled, but the platform fetch implementation may perform a second DNS resolution. Complete closure requires a supported dispatcher/egress proxy that pins the validated address while preserving TLS hostname verification.
4. **P2 — remote media tracking.** Sanitized rich question content may still reference remote media. A dedicated image proxy or allowlist is needed to prevent learner IP/referrer disclosure without breaking existing assets.
5. **P2 — production rollout remains separate.** Migrations 0072-0075 were applied and runtime-validated on the configured disposable project. This does not claim production application or migration-ledger history. Production must apply the canonical sequence 0072, 0073, 0074, then 0075 before the application because Agent admission and concurrency control intentionally fail closed when their RPCs are absent.

## Verification evidence

- Production Next.js build passed.
- Lint and TypeScript passed.
- Practice state recovery, recommendation search gate, round request security, review Markdown, prompt/trace security, Assignment UX/resume, submit request, cycle reset, AI admission, prompt limits, provider network safety, error boundary, and canonical migration governance smokes passed.
- Hosted disposable validation passed rollback preflight, forward application, catalog/RLS/grant checks, rollback-only authenticated/anonymous behavior, rate-limit and lease-contention boundaries, token-safe release, and non-mutating Data API schema-cache probes for the reset, admission, and lease RPCs.
- Supabase advisors reported no warning associated with the 0072-0075 tables or functions. The project still has 8 security and 253 performance baseline warnings outside this change.
- Existing `security-smoke.mjs` passed its security assertions until an unrelated classroom route inventory assertion from current main; this is not reported as a pass.
- Live route smoke was not run because no local web server was listening on port 3000.

## Release and rollback

The configured disposable project already has 0072-0075. For every other environment, apply canonical migrations forward-only in that order before deploying this branch. Do not edit the applied 0073 file: 0074 is its forward correction. Application rollback can hide reset UI and remove admission/lease callers, but database correction remains forward-only. Provider private-network access is denied by default; non-production local-provider use requires the explicit `ALLOW_PRIVATE_AI_PROVIDER_NETWORK` and, for HTTP, `ALLOW_INSECURE_AI_PROVIDER_HTTP` flags.
