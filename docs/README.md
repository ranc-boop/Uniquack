# Docs Index

Start with the root files: [`../AGENTS.md`](../AGENTS.md) (guardrails), [`../CONTEXT.md`](../CONTEXT.md) (product context), [`../DESIGN.md`](../DESIGN.md) (UI design). The current behavior baseline lives in [`../audit/`](../audit/README.md).

Several smoke scripts read files in this folder by literal path (`docs/security/*`, `docs/architecture/ai-parsing-contract-fingerprints.json`, `docs/runbooks/local-ai-jobs-worker.md`, `docs/site-performance-audit.md`, `docs/blueprint-library-0031-*.sql`, and others). Do not move or rename a file here without searching `scripts/` first.

## Product and domain model

| Doc | Topic |
|---|---|
| [bank-first-product-prd.md](bank-first-product-prd.md) | Bank-first product requirements |
| [bank-first-domain-model.md](bank-first-domain-model.md) | Bank-first domain model |
| [bank-first-implementation-plan.md](bank-first-implementation-plan.md) | Bank-first implementation plan |
| [universal-library-product-architecture.md](universal-library-product-architecture.md) | Universal Library architecture |
| [universal-library-implementation-sequence.md](universal-library-implementation-sequence.md) | Universal Library build order |
| [library-blueprint-classroom-product-model.md](library-blueprint-classroom-product-model.md) | Library, blueprint and classroom model |
| [product-role-classroom-assignment-plan.md](product-role-classroom-assignment-plan.md) | Roles, classrooms and assignments |
| [student-teacher-boundary-plan.md](student-teacher-boundary-plan.md) | Student/teacher boundary |
| [teacher-product-ia-reconciliation-plan.md](teacher-product-ia-reconciliation-plan.md) | Teacher information architecture |
| [teacher-product-implementation-sequence.md](teacher-product-implementation-sequence.md) | Teacher workspace build order |
| [teacher-route-map.md](teacher-route-map.md) | Teacher routes |
| [taxonomy-current-architecture.md](taxonomy-current-architecture.md) | Taxonomy |
| [entitlements-and-monetization-plan.md](entitlements-and-monetization-plan.md) | Entitlements and monetization |
| [demo-feature-productization-inventory.md](demo-feature-productization-inventory.md) | Old demo feature inventory |
| [design-system-decision-old-demo-derived.md](design-system-decision-old-demo-derived.md) | Design system decision |
| [google-login-account-linking-plan.md](google-login-account-linking-plan.md), [sec-google-account-linking-spec.md](sec-google-account-linking-spec.md) | Google account linking (parked) |

## Development and operations

| Doc | Topic |
|---|---|
| [supabase-setup-and-rls-testing.md](supabase-setup-and-rls-testing.md) | Supabase setup and RLS testing |
| [npm-test-and-web-rehearsal.md](npm-test-and-web-rehearsal.md) | Test and rehearsal commands |
| [ai-ready-batch-import.md](ai-ready-batch-import.md) | AI-ready batch import |
| [ai-production-enablement-checklist.md](ai-production-enablement-checklist.md) | AI production checklist |
| [question-assets-maintenance.md](question-assets-maintenance.md) | Question asset access rules |
| [site-performance-audit.md](site-performance-audit.md) | Performance audit (read by `perf:budget`) |
| [storage-private-cutover-report.md](storage-private-cutover-report.md), [storage-signed-url-report.md](storage-signed-url-report.md), [storage-url-backfill-report.md](storage-url-backfill-report.md) | Private storage cutover |
| [runbooks/](runbooks/) | Local AI worker and PDF50 runbooks |

## Subfolders

| Folder | Contents |
|---|---|
| [architecture/](architecture/) | AI parsing contracts and baselines, PDF50 design, practice-cycle design |
| [security/](security/) | Findings, migration register and governance, authz test design, hosted/local apply evidence, route and schema manifests |
| [runbooks/](runbooks/) | Operational procedures |
| [archive/](archive/README.md) | Historical per-feature reports and one-off migration apply notes |
