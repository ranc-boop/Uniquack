# Stage 0 — Behavior & Architecture Baseline Audit

Snapshot date: 2026-08-13 · Branch `audit/behavior-architecture-baseline` · HEAD `a685cf4`.
Purpose: a trustworthy baseline of what the system **does today**, so later cleanup can be aggressive on code quality and conservative on behavior. No code, schema, or permission was changed in this stage.

### Stage 0 — Behavior & Architecture Baseline

| Doc | Contents |
|---|---|
| [01-current-architecture.md](01-current-architecture.md) | Stack, deployment reality, layers, domains, migration chains, data flow |
| [02-behavior-and-contracts.md](02-behavior-and-contracts.md) | Workflows, HTTP API inventory, DB/RPC/storage/env contracts, test harness |
| [03-authorization-data-access.md](03-authorization-data-access.md) | Role model, RLS approach, service-role usage map, tenancy boundaries, secrets |
| [04-architecture-findings.md](04-architecture-findings.md) | P0–P3 findings + watch items |
| [05-behavioral-invariants.md](05-behavioral-invariants.md) | 35 invariants cleanup must preserve, with evidence citations |
| [06-unknowns.md](06-unknowns.md) | 12 items needing human confirmation (items 3 resolved, see doc) |

### Refactor-Readiness Audit (2026-08-13)

Owner directives applied: comparisons use `supabase/clean-migrations/` only; Stage-0 P1-1 is intended design (tracked remaining item).

| Doc | Contents |
|---|---|
| [10-repo-dependency-findings.md](10-repo-dependency-findings.md) | Dependency directions, smoke path-pinning constraint, dead-code census |
| [11-architecture-redundancy-findings.md](11-architecture-redundancy-findings.md) | God module, provider-loop duplication, DB approval onion, legacy read models |
| [12-authorization-findings.md](12-authorization-findings.md) | Authz propagation, mirrors, service-role discipline, role-concept multiplicity |
| [13-api-rpc-contract-findings.md](13-api-rpc-contract-findings.md) | Full RPC live/compat/dead classification, action-surface drift |
| [14-database-integration-findings.md](14-database-integration-findings.md) | Hand-typed DB types, phantom table, dual lifecycle, trigger opacity |
| [15-ai-import-pipeline-findings.md](15-ai-import-pipeline-findings.md) | End-to-end pipeline map, canonical/experimental/dormant classification |
| [16-refactor-candidate-register.md](16-refactor-candidate-register.md) | **Main cleanup handoff** — PRESERVE / SAFE / RRP / RM / BLOCKED register |
| [17-resolution-queue.md](17-resolution-queue.md) | Human decisions + HOSTED PARITY REQUIRED checks, grouped for batch resolution |
| [appendix-rpc-census.md](appendix-rpc-census.md) | Raw 92-function call-site census table |

## One-paragraph system summary

EduStruct is a locally-run Next.js 16 app against a hosted Supabase project ("Current Clean Supabase") — no live web deployment. Postgres with heavy RLS (288 policies, ~95 tables, ~174 functions across 77 executable canonical migrations) is the real authorization and workflow engine; the app layer is server components + 28 server-action modules + a small API surface (practice engine, private asset delivery, internal AI worker). The core loop — teacher PDF upload → durable AI parsing jobs (fenced worker, provider gateway) → bank-scoped review drafts → lineage-gated approval into question banks → idempotent assignment creation → student practice with DB-admission-controlled AI → evidence back to teachers — is implemented and smoke/CI-guarded, alongside an official public library (system bank, two-state approval, 0076/0077).

## Most important contracts that must not change (short list)

- Canonical migration chain governance (78/77, blocked 0032) and forward-only corrections.
- Review gates: lineage-checked approval (0066), assignment readiness triggers (0057), no AI auto-publish, system-bank-only public visibility (0076 CHECKs).
- The live RPC surface — including *both* versioned and unversioned variants currently called from code.
- Private `question-assets` delivery path (RPC-authorized 60s signed URLs) and burst-reserved `ai-import-sources` uploads.
- Worker boundary: internal token route, DB-side claim + lease fencing, idempotent enqueue.
- Practice DB admission (request windows + inflight leases), source-scope lock, evidence isolation.
- Assignment creation idempotency receipts; hashed join/share codes (TS↔SQL classroom hash equivalence).
- Middleware auth-context header strip/inject and role gates.

## Multiple / unclear sources of truth

- `questions.status` (legacy) vs `questions.approval_status` (authoritative two-state).
- Classroom join-code hashing implemented in both TS and SQL.
- Two migration chains (`clean-migrations` canonical vs frozen legacy `migrations`).
- V1 AI parsing (live) vs V2 contracts (unwired) vocabularies.
- Docs vs implementation: CONTEXT.md "Known Gaps" and `docs/security/findings.md` are stale in places; code + CI are current truth.

## Highest-risk findings

1. **Resolved historical P1-1** Platform-admin vs org-admin global-library behavior was accepted as intended on 2026-08-13; see [12-authorization-findings.md](12-authorization-findings.md). Retained here to preserve Stage 0 history, not as an open blocker.
2. **P1-2** Dual question lifecycle fields — consolidation could silently change visibility/assignability.
3. **P1-3** Cross-language join-code hash duplication.
4. **P1-5 / P2-1** Versioned-RPC pairs and dormant 0004/0005 table families — deleting the wrong artifact breaks runtime or hosted data.
5. **P1-7** `any`-typed queue RPC boundary + lagging generated DB types.

## Recommended next audit stage

1. **Hosted-schema parity check**: reconcile the hosted project's applied history against the repo chain (registers exist under `docs/security/`); confirm dormant tables are empty before any drop plan.
2. **RPC call-site census**: per versioned/unversioned pair, prove which functions have zero callers (code + scripts + hosted usage) — prerequisite for consolidation.
3. **Resolve the remaining product/schema unknowns** in the 06 doc with the product owner — especially Google linking, dormant schema, and the `status` end-state.
4. **Script triage**: classify `scripts/` into CI-gating / on-demand / historical-evidence, and record the canonical must-pass list.
5. Only then scope refactors, using 05-behavioral-invariants.md as the regression contract.

## Stage 1 — Current Product Workflow & Technical Risk Audit (2026-09-24)

| Doc | Contents |
|---|---|
| [18-current-product-workflow-and-risk-audit.md](18-current-product-workflow-and-risk-audit.md) | Current Admin/Teacher/Student journeys, role-preview and localization gaps, Student Library/Study Group status, demo-data write risk, stale route/product docs, and technical findings carried forward from Stage 0. |

This is a static audit of `main` at `87be4ba`, using Stage 0 as a historical technical baseline. It did not query hosted Supabase, read environment-file contents, run tests/builds, or change application/data state. Stage 0 findings above are retained for historical context; the platform-admin/org-admin item is explicitly marked resolved and is not a current blocker.
