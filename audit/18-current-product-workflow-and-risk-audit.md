# EduStruct — Current Product Workflow & Technical Risk Audit

- **Audit date:** 2026-09-24
- **Code baseline:** `main` at `87be4ba` (`Merge bilingual UI support`)
- **Reference baseline:** Stage 0 / refactor-readiness audit dated 2026-08-13 in this directory.

## Scope and confidence

This is a static repository audit of routes, navigation, server actions, domain code, clean migrations, existing audit records, CI, and smoke-test definitions. It does not read `.env.local`, print or copy secrets, query the hosted Supabase project, submit browser forms, or run tests/builds. Only this report and its index entry are changed by the audit.

“Confirmed” means the behavior is visible in current source. “Risk / decision” means the impact depends on deployment context or product intent and is called out rather than treated as a proven vulnerability. Existing Stage 0 findings are carried forward where the current database/API code has not materially changed; they are not represented as a fresh hosted-schema verification.

## Executive summary

The central learning workflow is substantially connected and bank-first: the Teacher home selects a next action (review drafts, create an assignment from ready questions, create a Library, or import); bank- and classroom-scoped assignment entry points converge on `/teacher/publish`; the composer has content, classroom, and review stages; the student assignment detail hands off to Practice with the assignment ID and a return path. The reviewed gates still distinguish reviewed/assignable content from drafts. These are good foundations, not the source of most current confusion.

The most actionable problems are inconsistent role entry/preview behavior, visible English left in important Chinese-language workflows, a demo-data write on the ordinary Admin dashboard, and planned Student Library/Study Group surfaces that currently redirect to other products. Several product documents still describe older route states, making the intended model hard to infer even for future maintainers.

## Current end-to-end journeys

```text
Visitor: / → /questions (public question discovery) or /practice and /mistakes
         sign in → safe `next` destination if present; otherwise role home
         (Admin /admin, Teacher /teacher, Student /questions)

Admin:   sign in → /admin → public-library governance / taxonomy / users / AI operations
                           ↘ teacher preview works
                           ↘ student preview points to /student, blocked by middleware

Teacher: sign in → /teacher → next action
          → Library → import/AI parsing → bank-scoped Review Drafts → approved bank questions
          → /teacher/publish (select questions → choose classroom → review/save or assign)
          → classroom assignment detail / student-visible preview → teacher progress/evidence

Student: sign in without a return URL → /questions (public question discovery)
         assigned path: /student/work → assignment detail → /practice?assignmentId=…&returnTo=…
         self-study: /questions, /practice, /mistakes, /student/progress
         /student/library → public library; /student/groups → formal classrooms (redirects)
```

The public landing page also links directly to Practice, Questions, Mistakes, and Videos (`src/app/page.tsx:10-33, 52-62, 142-153`). A valid `next` path survives sign-in; without one, `signInWithUsername` selects `/admin`, `/teacher`, or `/questions` (`src/app/auth/actions.ts:10-20, 22-65`). Thus a Student is sent to public discovery rather than the Student dashboard on a generic sign-in. Public and assignment-only visibility remain distinct; the landing-page link alone does not establish that a route is available to every unauthenticated visitor.

Admin navigation and Teacher navigation are intentionally separate. Teacher home prioritizes the bank/review/delivery sequence in `src/lib/teacher-dashboard.ts:107-157`. The bank and classroom “new assignment” routes redirect to the common publish composer while carrying their context; they are not independent assignment implementations. The Student assignment handoff preserves both assignment identity and the return route in `src/app/student/work/[id]/page.tsx:177`.

## Findings, ordered by impact

### P1 — Admin “Student Preview” is a visible route that the role gate rejects

**Confirmed from source.** Admin and super-admin accounts receive a Student Preview option linked to `/student` in `src/components/app-chrome.tsx:52-108`. The page-level `requireStudentWorkspace` admission guard accepts admins (`src/lib/auth/guards.ts:157-174`), but middleware ends the `/student/**` path check with `canAccessStudent(role)` (`src/lib/supabase/middleware.ts:105-166`), and that predicate admits students only (`src/lib/auth/roles.ts:11-12`). The middleware therefore redirects the advertised Admin preview before the page guard can run. Also, “read-only” is not an enforced contract: the guard is not a mutation restriction; the Practice session API accepts any authenticated identity (`src/lib/practice/auth.ts:20-33`, `src/app/api/practice/sessions/route.ts:104-110`), and session RLS allows owner writes without a Student-role condition (`supabase/clean-migrations/0047_practice_self_study_evidence_isolation.sql:97-102`). The preview notice says actions remain attributed to the administrator (`src/lib/i18n/messages.ts:10`). Admin dashboard shortcuts also label `/videos` as “Student Videos”, while `/videos` does not switch an admin into the Student preview shell.

**Impact:** the app advertises a workspace transition that fails or lands in the wrong preview context; a support/admin user can mistake this for a broken Student workspace.

**Recommended change:** first make the route contract consistent. Remove unsupported preview links, or deliberately allow the route through middleware. If retaining preview, decide whether it is genuinely read-only (then enforce that at each mutation/API boundary and assess the database boundary) or an admin-identity exercise preview (then label clearly that actions may write evidence under the admin account). Do not infer read-only behavior from `requireStudentWorkspace`, and do not treat admin-preview smoke as a substitute for real Student-role validation. Route `/videos` through an explicitly labeled preview context if it remains a Student shortcut.

### P1 — Chinese UI coverage is incomplete on core review/import screens, and the checks do not gate it

**Confirmed from source.** The bilingual catalogs have parity tests, but core screens still contain direct English UI strings outside the catalogs. Examples include “Preview selected” / “Approve selected” in `src/components/teacher/teacher-bulk-selection.tsx:690-701`; Teacher PDF batch-upload controls, statuses, and recovery copy in `src/components/teacher/teacher-pdf-burst-upload.tsx:389-513`; Admin Review Draft warning/readiness labels in `src/components/draft-review-card.tsx:212-256`; the Admin PDF import workflow in `src/components/ai-pdf-import-panel.tsx:1097-1098,1458-1593`; and Admin package-import labels in `src/components/package-import-panel.tsx:334-404`. These are interface controls and explanations, not learning content that should remain untranslated.

`test/i18n-locale.test.mjs` checks locale parsing, formatting, and catalog-key parity. `scripts/i18n-route-smoke.mjs` checks the login page and public landing page only. The package exposes `smoke:i18n`, but neither that script nor `npm test` is invoked by `.github/workflows/ci.yml`; `scripts/smoke-all.mjs` does not import the locale route smoke either.

**Impact:** a user can select Chinese and still encounter English at the AI import → Review Draft → approval handoff, exactly where state and safety decisions need to be clear. Catalog parity alone cannot detect text that bypasses the catalog.

**Recommended change:** complete a user-visible-string pass over Admin, Teacher, Student, Practice, loading/error states, and accessible labels; retain original learning content as-is. Expand route-level locale checks to representative Admin, Teacher, Student, import, review, assignment, and Practice routes, and make the locale contract run in CI. Keep the locale cookie and all permission/data behavior unchanged.

### P2 — Admin dashboard demo action writes “published” records without an environment boundary

**Confirmed write path; deployment impact is conditional.** `/admin` presents a “Create demo records” form (`src/app/admin/page.tsx:47-55`). Its `createDemoContent` action requires an Admin and uses the signed-in Supabase client, but it inserts a question and a video with legacy `status: "published"` and `published_at` (`src/app/admin/actions.ts:14-90`). The action is explicitly demo-labeled and idempotent by fixed demo identifiers, but no `NODE_ENV` or database-target guard is present. Stage 0 describes the normal app setup as local Next.js against a hosted Supabase project.

**Impact:** “local app” does not imply “local database”; clicking this ordinary dashboard action can write persistent fixture records into whichever database the app is configured to use. The audit did not execute it or determine which public/student queries would display each row.

**Recommended change:** move fixture creation to an explicitly local/disposable seed command, or enforce a non-production target and a clear confirmation that names the target environment. Do not rely on the demo label alone as the safety boundary.

### P2 — A Student signing in without a requested destination skips the Student dashboard

**Confirmed from source; desired landing is a product decision.** `signInWithUsername` preserves a valid `next` path and sends Admins to `/admin` and Teachers to `/teacher`, but the fallback for every other profile is `/questions` (`src/app/auth/actions.ts:22-65`). That puts a Student into public question discovery rather than `/student`, where assigned work and due items are summarized.

**Impact:** students with formal assignments may start in the self-study/public-library path and miss “My Work”; this is especially confusing when signing in from the generic public landing page.

**Recommended change:** unless public discovery is intentionally the default for Students, use `/student` as the no-`next` Student destination and keep explicit task return paths authoritative. Record the product choice; no role or access rule needs to change.

### P2 — Student Library and Study Group routes are compatibility redirects, not implemented workspaces

**Confirmed from source/schema inventory.** `/student/library` redirects to `/student/public-library`; `/student/groups` redirects to `/student/classrooms` (`src/app/student/library/page.tsx:7-9`, `src/app/student/groups/page.tsx:7-9`). No `study_group` data model appears in the canonical migrations or the Student implementation. Neither route is in `StudentWorkspaceNav`. This conflicts with the Universal Library direction, which describes personal Student Libraries and peer Study Groups as separate from formal classrooms (`docs/universal-library-product-architecture.md:16, 74, 157-171`).

**Impact:** a Library URL silently means public discovery, and a Study Group URL silently means formal class roster. That blurs ownership and the explicitly separate classroom/group permission boundaries.

**Recommended change:** make an explicit release-scope decision. If these features are not in the current release, mark them as planned/unsupported and avoid presenting redirects as functional workspaces. If they are required, design each complete ownership, membership, visibility, and RLS flow before adding UI or migrations; never implement Study Groups as classroom aliases.

### P2 — Student navigation gives little orientation about the current location

**Confirmed from source.** `StudentWorkspaceNav` renders the same link class for every route and does not read the pathname or set `aria-current` (`src/components/student/student-workspace-nav.tsx:1-40`). Teacher and Admin navigation do mark the active item. Student destinations also span the role-gated `/student/**` workspace and self-guarded `/practice`, `/mistakes`, and `/questions` routes.

**Impact:** students have no persistent active-route cue while crossing between assigned work, practice, mistakes, and public discovery; the unmarked split between workspace and self-study surfaces compounds the landing ambiguity.

**Recommended change:** add an active visual/accessible state and clarify the two navigation groups (formal assigned learning vs. self-study/discovery) without changing data access.

### P2 — Product documentation describes different route states and Library ownership models

**Confirmed discrepancy.** `CONTEXT.md:187-194` still lists `/teacher` as not bank-first and Course Builder as needing rebuild. `docs/teacher-route-map.md:14,22,25-39` marks routes as “future” even though Teacher Blueprints, Publish, Progress, and classroom analytics routes exist; it also defines “future” as a route that does not exist. The Universal Library architecture describes Student ownership, while the current Student Library route redirects. The Stage 0 highest-risk list had also shown P1-1 without its resolved status; this audit’s index update now annotates that item and removes it from the open-unknowns prompt, while retaining the original Stage 0 report as historical evidence.

**Impact:** product owners and developers cannot tell which document is current, which routes are shipped, or whether Student Library/Study Groups are requirements or future ideas. This creates repeat work and encourages route/UI changes that diverge from the bank-first and ownership model.

**Recommended change:** publish one “current behavior vs target” route map; label older PRDs/reports as historical; reconcile `CONTEXT.md` and the Stage 0 index without rewriting its evidence. Maintain separate columns for implemented, compatibility redirect, planned, and intentionally deferred.

### P2 — Course Builder is an unlinked, non-atomic secondary assignment surface

**Confirmed from source; intent unknown.** `/teacher/course-builder` is absent from the Teacher main nav and no other route links to it, yet its page exposes a direct assignment form from Course Builder/practice-framework sources (`src/app/teacher/course-builder/page.tsx:160-256`). It is not part of the common `/teacher/publish` composer. Its bridge loads source question IDs and filters using legacy `questions.status = "published"` (`src/lib/course-builder/assignment-bridge.ts:72-102`); it does not select/check authoritative `approval_status` or Library readiness itself. RLS still applies to the question read, and migration `0057` enforces readiness for bank-owned questions on assignment-item writes but returns early for ownerless questions (`supabase/clean-migrations/0057_assignment_readiness_and_anon_search_hardening.sql:214-236`); this audit did not establish a review-gate bypass. Separately, the action inserts the assignment and its items in two requests (`src/app/teacher/course-builder/actions.ts:73-107`), so item-insert failure can leave the assignment row persisted; in “assign now” mode that row is inserted with assigned status/time before item creation. The route map calls it a compatibility surface needing rebuild (`docs/teacher-route-map.md:39`).

**Impact:** direct URL access exposes a second, poorly discoverable mental model for assignment creation. Its readiness check is weaker at the application layer than the primary bank-first path, and a failed second write can leave an incomplete assignment record. It is unclear whether this is a supported feature, a migration bridge, or dormant compatibility code.

**Recommended change:** confirm its product status. If retained, make authoritative approval/readiness eligibility explicit and align source/Library lineage with the primary composer; create the assignment and its items atomically (or provide verified cleanup/rollback on failure). If retired, mark it compatibility-only and route users through the Library/Publish model. Preserve existing database review gates; the evidence here does not support claiming a demonstrated bypass.

### P2 — The client locale provider may ship both full catalogs globally; measure before optimizing

**Risk, not a measured regression.** The root client `LocaleProvider` imports `translate` from the shared catalog (`src/components/i18n/locale-provider.tsx:1-45`); `src/lib/i18n/messages.ts` is 183,443 bytes and contains both catalogs. Because translation lookup is dynamic, this can place both catalogs in a shared client chunk used across workspaces. No build or bundle measurement was run.

**Recommended change:** inspect the existing production bundle/performance budget first. If material, split or reduce the client-loaded dictionary surface while preserving server/client rendering parity. Do not call this a confirmed performance failure before measurement.

### P2 — Dependency update signals are advisory rather than fully pinned/gated

**Confirmed from manifests/CI.** Several runtime and tool dependencies use the `latest` tag in `package.json`; `package-lock.json` plus CI `npm ci` provides reproducible CI installs, but fresh lockfile resolution can still move these packages unexpectedly. The CI dependency audit uses `continue-on-error: true` (`.github/workflows/ci.yml:43-47`).

**Recommended change:** prefer explicit supported version ranges for framework/client/runtime packages and keep the lockfile authoritative; triage dependency-audit findings through a tracked process instead of allowing all high-severity results to remain informational.

### P2 — Privileged service-role use needs an explicit boundary inventory

**Confirmed architecture; source callsites are server-side.** `createServiceRoleClient` reads the service-role key in `src/lib/supabase/server.ts:30-45`. Its current callsites are server-side worker, AI, private-asset, PDF-import, and Admin action paths (for example, `src/lib/ai-jobs/worker.ts:64,1193`, `src/app/api/question-assets/[assetId]/route.ts:3,54-65`, `src/app/teacher/banks/pdf-burst-actions.ts:30,146`, and `src/app/admin/questions/actions.ts:21,354`). `.env.local` patterns are ignored by Git (`.gitignore:11-12`). The factory module does not explicitly import `server-only`, although it currently imports the server-context-specific `next/headers`. This static review did not inspect local/CI secret stores, inspect a production bundle, or prove the authorization context at every privileged callsite.

**Impact:** accidental reuse outside a trusted server path could elevate an operation beyond ordinary RLS-scoped access. No client-component callsite was found in the source inventory; the production bundle was not inspected.

**Recommended change:** add an explicit server-only module marker and maintain a reviewed callsite inventory that proves user/ownership authorization happens before service-role elevation. Add a source-level security check to catch service-role imports from client components. Keep credentials in server-only environment configuration.

## Technical baseline carried forward

The Stage 0 audit is dated 2026-08-13. The current main change set after that audit is the bilingual UI work; no `supabase/clean-migrations/`, `src/app/api/**`, or `src/lib/supabase/**` files changed in that interval. The following Stage 0 items therefore remain relevant until explicitly closed:

- **P1 data/API contracts:** legacy `questions.status` coexists with authoritative `approval_status`; classroom join-code hashing is duplicated between TypeScript and SQL; canonical `clean-migrations` coexists with the frozen legacy migration chain; versioned and unversioned RPCs both have callers; durable-job RPC access still crosses an `any`-typed boundary. See `audit/04-architecture-findings.md:15-27` and `audit/12-authorization-findings.md:26-29`.
- **Security watch, not a confirmed exploit:** Practice mutation routes do not share the explicit Origin/Sec-Fetch-Site check used by the two Teacher fetch-POST routes; the earlier audit relied on cookie/SameSite mitigation and did not prove exploitability. Reassess before deployment/security-policy changes; do not report it as a confirmed CSRF vulnerability.
- **P2 cleanup candidates:** dormant migration-era table families, live V1 vs contracts-only V2 parsing surfaces, smoke-script sprawl, and stale/duplicated documents. Do not drop tables or consolidate RPC/migration contracts without the parity/usage checks already listed in `audit/17-resolution-queue.md`.
- **Resolved historical item:** Stage 0 P1-1 (platform-admin vs org-admin behavior) was explicitly accepted as intended for the undeployed product in `audit/12-authorization-findings.md:5-7`; the Stage 0 README “highest-risk” list should not imply it is currently unresolved.

The existing security baseline is meaningful: CI includes source security and route checks, embedded-database governance/idempotency checks, a local Supabase authorization matrix, and build/performance/runtime-route jobs (`.github/workflows/ci.yml`). That does not verify the current hosted migration history, nor does this static audit certify a production deployment.

## Recommended order and open product decisions

1. Fix the advertised Admin Student Preview contract and complete translations on the import/review decision path; make representative role/locale route checks a CI gate.
2. Put an environment boundary around demo seeding before anyone uses the Admin dashboard against shared data.
3. Confirm whether Student default landing is `/student` or public discovery; decide whether personal Libraries and Study Groups are current-release scope or planned.
4. Reconcile route/docs status and decide whether Course Builder remains supported; use real Teacher and Student accounts for workflow acceptance.
5. Continue the Stage 0 data/API cleanup only after preserving the listed RLS, lineage, assignment-readiness, idempotency, and migration-governance invariants. Hosted-schema parity remains an explicit follow-up, not an assumption.

## Verification record

- Repository/source/docs/migration/CI inspection completed at the stated code baseline.
- No tests, builds, local browser flows, or hosted Supabase queries were run, as required by this audit scope.
- No application code, schema, or user data was changed. Environment-file contents were not read.
