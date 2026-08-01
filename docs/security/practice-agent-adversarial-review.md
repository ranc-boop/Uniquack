# Practice Agent adversarial review

## Scope

This review covers authenticated Practice recommendation, answer submission, grading, hints, round review, session recovery, provider networking, public trace output, and Assignment-linked Practice. It also considers user-authored question content as indirect model input.

The work used separate reliability, prompt-input, and Agent-security review contexts. No unreviewed AI content is published or assigned by these changes.

## Threat results

| Threat | Result | Control |
| --- | --- | --- |
| Direct prompt injection through goal, answer, hint context, notes, or memory | Mitigated | Server length/type bounds; prompts mark user content as untrusted data and reject instruction precedence changes. |
| Indirect injection through question text or stored thread/tool-policy notices | Mitigated | Question/source/answer bounds; database notices remain user-context data rather than system messages. |
| System prompt, tool schema, raw reasoning, or provider payload disclosure | Mitigated | Public traces use safe structured summaries; raw reasoning/model text is excluded from API persistence and UI. |
| Grade endpoint used as an answer oracle or forged Assignment submission | Mitigated | Session and round ownership, active status, exact persisted question-set matching, and deterministic objective grading are enforced. |
| Hint endpoint used for arbitrary questions or unlimited model calls | Mitigated | Active owned round membership, per-question hint cap, bounded history, and atomic per-user operation admission. |
| Lost or cross-contaminated state while switching rounds/sessions | Mitigated | Abort and operation-generation guards, navigation locks during submit/review, persisted active-round recovery, and canceled-review recovery. |
| Free-compute abuse through repeated Agent calls | Mitigated | Migration 0073 provides authenticated, fail-closed, atomic minute/hour admission for recommendation, review, hint, title, and preference merge. |
| Provider response memory exhaustion | Mitigated | Streaming and non-streaming response byte ceilings plus early `Content-Length` rejection. |
| Provider base URL SSRF or redirect to internal services | Mitigated with residual below | HTTPS/public-host syntax checks, runtime DNS address checks, embedded-credential denial, redirect denial, and Gemini upload-URL revalidation. |
| Error causes the whole Practice route to become unusable | Mitigated | Route error boundary offers safe reset/re-entry without rendering raw error messages. |
| Repeating all questions destroys evidence | Mitigated | Migration 0072 records a per-user cycle boundary; attempts, mistakes, sessions, and Assignment evidence are retained. |
| Round review loses single newlines or partial Markdown | Mitigated | Review surfaces use the shared math/Markdown renderer with soft-line-break preservation. |

## Residual risks and required follow-up

1. **P0 — direct browser mutation of Practice evidence.** Canonical migration 0047 still permits an authenticated learner to write rows they own in several Practice evidence tables. The API now validates normal writes, but a caller using the Data API can bypass those route checks. Correct remediation is a forward-only migration that revokes browser writes and replaces every legitimate server write with narrow, identity-derived RPCs or a separately authenticated server-only persistence boundary. Removing policies without migrating all session, round, attempt, hint, completion, preference, wrong-question, and Assignment linkage writes would break the product and was deliberately not done in this change.
2. **P1 — DNS rebinding race.** Provider hostnames are resolved and checked before `fetch`, and redirects are disabled, but the platform fetch implementation may perform a second DNS resolution. Complete closure requires a supported dispatcher/egress proxy that pins the validated address while preserving TLS hostname verification.
3. **P2 — remote media tracking.** Sanitized rich question content may still reference remote media. A dedicated image proxy or allowlist is needed to prevent learner IP/referrer disclosure without breaking existing assets.
4. **P2 — production rollout remains separate.** Migrations 0072 and 0073 plus the mandatory forward correction 0074 were applied and runtime-validated on the configured disposable project. This does not claim production application or migration-ledger history. Production must apply the canonical sequence 0072, 0073, then 0074 before the application because Agent admission intentionally fails closed when its RPC is absent.

## Verification evidence

- Production Next.js build passed.
- Lint and TypeScript passed.
- Practice state recovery, recommendation search gate, round request security, review Markdown, prompt/trace security, Assignment UX/resume, submit request, cycle reset, AI admission, prompt limits, provider network safety, error boundary, and canonical migration governance smokes passed.
- Hosted disposable validation passed rollback preflight, forward application, catalog/RLS/grant checks, rollback-only authenticated/anonymous behavior, rate-limit boundaries, and non-mutating Data API schema-cache probes for the reset and admission RPCs.
- Supabase advisors reported no warning associated with the 0072-0074 tables or functions. The project still has 8 security and 253 performance baseline warnings outside this change.
- Existing `security-smoke.mjs` passed its security assertions until an unrelated classroom route inventory assertion from current main; this is not reported as a pass.
- Live route smoke was not run because no local web server was listening on port 3000.

## Release and rollback

The configured disposable project already has 0072, 0073, and 0074. For every other environment, apply canonical migrations forward-only in that order before deploying this branch. Do not edit the applied 0073 file: 0074 is its forward correction. Application rollback can hide reset UI and remove admission callers, but database correction remains forward-only. Provider private-network access is denied by default; non-production local-provider use requires the explicit `ALLOW_PRIVATE_AI_PROVIDER_NETWORK` and, for HTTP, `ALLOW_INSECURE_AI_PROVIDER_HTTP` flags.
