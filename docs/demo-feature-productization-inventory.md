# Competition Demo Feature Productization Inventory

Date: 2026-07-03

## Executive Summary

The clean Supabase/core-product track is now stable enough to stop treating database reset as the main workstream. Current `main` has the clean schema baseline, provider gateway setup, real Gemini AI PDF import into Review Drafts, Review Draft publish lineage, taxonomy search, Question Bank, Practice Agent custom rounds, Blueprint Library, and passing smoke coverage.

The main demo branch worth mining is `origin/codex/web-demo-feature-scan-ui-expansion`. It contains a useful product narrative and several UI/flow ideas, but it also contains high-risk runtime actions, old migration artifacts, and demo-only pages. Do not merge it wholesale.

Recommended first productization PR: extract the low-risk AI Parsing / Review Draft UX improvements from the demo branch into current `main`, especially the reusable AI PDF import workspace framing and clearer source-to-review handoff. Keep it admin/teacher-safe, do not add new provider calls, and preserve Review Draft / no-auto-publish governance.

## Current Clean Product Baseline

Validated baseline now on `main`:

- Local dev uses clean Supabase.
- Clean migrations `0001` through `0017` exist, including provider gateway, Review Draft publish lineage, question asset storage, and Practice session state compatibility.
- Admin auth bootstrap and provider gateway setup are complete.
- Gemini provider creation works through `/admin/ai-settings`.
- Real Gemini AI PDF import reaches Review Drafts.
- Draft quality fixes are applied.
- Review Draft approval lineage works through transactional publish behavior.
- Approved synthetic question reaches Question Bank.
- `search_questions_by_taxonomy` works with active assignable taxonomy leaves.
- Practice custom round works after clean migration `0017`.
- `lint`, `build`, `security-smoke`, RLS smoke, route smoke, and full smoke have passed in the recent clean-flow validation.

Current `main` product surfaces:

- Admin: `/admin`, `/admin/imports/pdf`, `/admin/review`, `/admin/questions`, `/admin/tags`, `/admin/blueprints`, `/admin/practice-frameworks`, `/admin/ai-settings`, `/admin/videos`, `/admin/users`.
- Public/student: `/questions`, `/questions/[id]`, `/practice`, `/mistakes`, `/videos`, `/videos/[id]`.
- API: Practice round/recommend/review/grade/hint/session routes and AI PDF segment preview route.
- No `/teacher` route exists on current `main`.
- No `/demo/state-aware-practice` route exists on current `main`.
- No `PracticeFatiguePanel` exists on current `main`.

## Branches Inspected

- `main` at latest merged clean flow.
- `codex/web-demo-feature-scan-ui-expansion` local branch.
- `origin/codex/web-demo-feature-scan-ui-expansion`.
- `origin/codex/demo-ai-personalized-learning-flow`.
- `origin/codex/final-ai-narrative-state-aware-practice`.
- `origin/codex/final-ai-narrative-state-aware-strengthening`.
- `origin/codex/final-ai-narrative-bold-demo`.

Notes:

- The local `codex/web-demo-feature-scan-ui-expansion` branch contains historical clean Supabase/reset artifacts and large migration/doc differences. Treat it as mixed history, not a clean source branch.
- The remote `origin/codex/web-demo-feature-scan-ui-expansion` is the better product/demo source reference.
- The final narrative branches are mostly copy/docs and pitch narrative. They are useful for messaging, not direct product code.

## Feature Inventory by Product Area

### A. AI Parsing / Private Knowledge Engine

Observed demo/source paths:

- `src/components/ai-pdf-import-workspace.tsx`
- `src/app/teacher/course-builder/imports/page.tsx`
- `src/app/admin/imports/pdf/page.tsx`
- `src/components/ai-pdf-import-panel.tsx`
- `docs/web-demo-personalized-branch-scan.md`

Features:

- Shared AI PDF import workspace wrapper.
- Teacher-facing import page that reuses the admin AI PDF pipeline.
- Cleaner import flow framing: upload, choose source/provider, run extraction or blueprint observation, watch status, publish framework.
- Source asset and created-question counts in import choices.
- Clearer "draft first" positioning.

Classification:

- Productize now: shared import workspace framing and Review Draft/source handoff copy.
- Productize later: teacher-owned import workspace route after teacher RBAC/RLS is explicitly validated.
- Needs RLS/security review: teacher import ownership filtering and provider profile access.
- Needs smoke coverage: route smoke for teacher import page if route is added.

Risk:

- Low for UI wrapper/copy around existing admin import.
- Medium for teacher-specific route access.
- High if mixed with provider execution or publish behavior.

### B. Review Drafts / Question Bank

Observed demo/source paths:

- `src/app/admin/review/page.tsx`
- `src/components/draft-review-card.tsx`
- `src/app/admin/questions/page.tsx`
- `src/components/question-bank-client.tsx`
- `src/app/teacher/course-builder/review/page.tsx`
- `src/app/teacher/course-builder/actions.ts`

Features:

- Teacher review page for generated/imported question batches.
- Review queue and approval UX improvements.
- Question Bank basket-to-practice flow.
- Source/reference preview and question asset/source file panels.
- Taxonomy-aware search/display.

Classification:

- Productize now: Review Draft and Question Bank UX polish that is display-only or uses existing admin actions.
- Productize later: teacher-owned review page once teacher role and RLS are finished.
- Needs backend/schema: teacher review page if it requires additional ownership rules.
- Needs smoke coverage: Review Draft route and no-auto-publish regression checks.

Risk:

- Low for display polish.
- Medium for teacher review visibility.
- High for any direct publish/approve action outside the existing Review Draft lineage RPC.

Hard invariant:

- No generated/imported question should become published without Review Draft governance and lineage.

### C. Practice Agent

Observed demo/source paths:

- `src/components/practice/practice-agent-client.tsx`
- `src/components/practice/practice-question-card.tsx`
- `src/components/practice/practice-round-review-panel.tsx`
- `src/components/practice/practice-trace-panel.tsx`
- `src/components/practice/practice-fatigue-panel.tsx`
- `src/lib/practice/course-generation-recommendation.ts`
- `src/lib/practice/agent-loop.ts`
- `src/lib/practice/persistence.ts`

Features:

- Saved sessions and persisted thread state.
- Practice framework selection/start path.
- Hints, feedback, round review, mistake recovery.
- Practice evidence display and trace details.
- Optional fatigue/state panel in the demo branch.
- Course-generation recommendation helper.

Classification:

- Productize now: evidence/session UX that displays already persisted Practice Agent state.
- Productize later: course framework selection if tied to teacher Course Builder route.
- Keep demo-only for now: live wearable/fatigue panel as a real-time "fatigue" feature.
- Productize later as optional signal only: self-report/state-aware recommendation display.
- Needs smoke coverage: custom round, grade, wrong-question read, session persistence.

Risk:

- Low for read-only session/evidence UI.
- Medium for framework-aware practice path.
- High for provider-backed hint/review changes or any new "fatigue" claims.

Safety language:

- State/wearable signals may support learning recommendations only. They are not medical diagnosis and should not be the main product pillar.

### D. Blueprint Engine

Observed current main paths:

- `src/app/admin/blueprints/**`
- `src/components/blueprints/blueprint-workspace.tsx`
- `src/lib/blueprints/**`
- `src/lib/ai-pdf-import/blueprint-observation.ts`
- `src/lib/ai-pdf-import/blueprint-observation-clustering.ts`
- `src/lib/ai-pdf-import/question-blueprint-analyzer.ts`

Observed demo/pitch ideas:

- Blueprint Intelligence cards on homepage/demo page.
- Question, Mastery, Training, and Coverage Blueprint storytelling.
- Blueprint source/history/readiness views.

Features:

- Current main already has a substantial Blueprint Library/admin workspace.
- Demo branch adds better narrative cards and teacher-course connection.
- Blueprint observation from AI Parsing is a real input path.
- Calibration/readiness/generation-review exists in current main code.

Classification:

- Productize now: UI copy/hierarchy that clarifies current Blueprint Library surfaces.
- Productize later: "Mastery/Training/Coverage Blueprint" names if backed by actual contracts.
- Keep demo-only: pitch cards that imply functionality not yet represented in data models.
- Needs smoke coverage: no generation without approved/calibrated blueprints, no auto-publish.

Risk:

- Low for copy and navigation.
- Medium for dashboard/card display changes.
- High for generation, calibration, or Review Draft handoff changes.

### E. Course Builder

Observed demo/source paths:

- `src/app/teacher/page.tsx`
- `src/app/teacher/layout.tsx`
- `src/app/teacher/course-builder/page.tsx`
- `src/app/teacher/course-builder/imports/page.tsx`
- `src/app/teacher/course-builder/frameworks/page.tsx`
- `src/app/teacher/course-builder/review/page.tsx`
- `src/app/teacher/course-builder/reports/page.tsx`
- `src/app/api/teacher/course-builder/reports/route.ts`
- `src/app/teacher/course-builder/actions.ts`
- `src/components/teacher-course-report-streamer.tsx`
- `src/lib/practice/course-generation-recommendation.ts`

Features:

- Teacher Studio hub.
- Course Builder home with import, framework, and report steps.
- Course package run records.
- Framework publisher from AI PDF question batches and blueprint batches.
- Exam-style question generation from blueprint summaries.
- Thread report generation from selected practice sessions.
- Follow-up practice framework creation.
- Delete/reset actions for generated run artifacts.

Classification:

- Productize later, not first: teacher workspace and Course Builder are valuable but cross multiple risk boundaries.
- Needs backend/schema: current clean schema has `course_generation_runs` and `practice_course_frameworks`, but teacher route integration still needs review.
- Needs RLS/security review: teacher-owned imports, review read access, framework ownership, course report visibility.
- Needs provider/AI review: exam-style generation and report generation use Practice AI provider paths.
- Needs smoke coverage: route auth, create run, preview, framework publish, report generation, cleanup.

Risk:

- Medium for read-only Course Builder dashboards.
- High for actions that publish imported questions, approve taxonomy assignments, insert generated exam-style questions, or delete course materials.

Important finding:

- Demo branch `src/app/teacher/course-builder/actions.ts` includes direct publish/approve/generation/delete behavior. This should be split before productization and aligned with Review Draft / no-auto-publish rules.

### F. State-Aware / Wearable-Style Practice

Observed demo/source paths:

- `src/app/demo/state-aware-practice/page.tsx`
- `src/app/demo/state-aware-practice/state-aware-demo-simulator.tsx`
- `src/app/demo/fatigue-trigger/page.tsx`
- `src/components/practice/practice-fatigue-panel.tsx`

Features:

- Competition presentation route.
- Wrist-style state simulator.
- Live-looking fatigue/load panel beside Practice Agent.
- Action vocabulary: `continue`, `rest_3`, `rest_5`, `switch_to_review`, `end_session`.
- Post-round feedback display with rest/bridge/resume flow.
- Safety boundary copy.

Classification:

- Keep demo-only now: public demo route and simulator.
- Productize later as optional signal: self-report/check-in and state recommendation UI.
- Not aligned as main pillar: real wearable integration.
- Needs UX/safety review: language must not imply diagnosis or production device support.
- Needs backend/schema if persisted: state packets, consent, retention, audit policy.

Risk:

- Low for a clearly labeled demo route.
- Medium for optional self-report UI.
- High for real wearable data, health-adjacent claims, or persistent physiological data.

### G. Enterprise / Demo-Only

Observed branches:

- `origin/codex/final-ai-narrative-*`
- Homepage demo sections in `origin/codex/web-demo-feature-scan-ui-expansion`
- `docs/ai-innovation-narrative-final*.md/pdf`

Features:

- Competitive narrative.
- Enterprise/training extension preview.
- Demo highlights and product storytelling cards.
- Pitch-only matrices.

Classification:

- Keep demo-only or archive.
- Productize later only if a real enterprise/training workflow is prioritized.
- Not aligned with immediate product direction.

Risk:

- Low if kept in docs/pitch.
- Medium if public product pages imply implemented functionality.

## Classification Table

| Feature | Source branch/path | Classification | Dependencies | Risk |
| --- | --- | --- | --- | --- |
| Shared AI PDF import workspace framing | `origin/codex/web-demo-feature-scan-ui-expansion:src/components/ai-pdf-import-workspace.tsx` | Productize now | Existing AI PDF tables/routes | Low |
| Clear Review Draft/source handoff copy | Admin import/review pages | Productize now | Existing Review Draft lineage | Low |
| Teacher-owned AI PDF import route | `src/app/teacher/course-builder/imports/page.tsx` | Productize later | Teacher auth/RLS/provider access | Medium |
| Teacher Course Builder hub | `src/app/teacher/course-builder/page.tsx` | Productize later | `course_generation_runs`, teacher auth | Medium |
| Framework publisher actions | `src/app/teacher/course-builder/actions.ts` | Productize later | Publish/review/taxonomy/provider paths | High |
| Exam-style generation from blueprint | `generateExamStyleQuestionsForRun` | Productize later | Provider call, generated question governance | High |
| Selected-thread reports | `src/app/teacher/course-builder/reports/page.tsx` | Productize later | Practice sessions and provider path | High |
| Practice session/evidence UI polish | Practice components | Productize now/later | Existing clean practice tables | Low/Medium |
| Practice fatigue panel | `src/components/practice/practice-fatigue-panel.tsx` | Keep demo-only now | UI state only in branch | Medium |
| Full state-aware demo route | `src/app/demo/state-aware-practice/**` | Keep demo-only | Static/demo simulator | Low |
| Blueprint narrative cards | Homepage/demo route | Productize later if grounded | Blueprint Library existing | Low/Medium |
| Enterprise extension preview | Homepage/narrative docs | Archive/demo-only | None | Low |

## Productize-Now Candidates

1. AI Parsing / Review Draft UX polish
   - Source paths: `src/components/ai-pdf-import-workspace.tsx`, `src/app/admin/imports/pdf/page.tsx`, `src/components/ai-pdf-import-panel.tsx`.
   - Mock dependency: no, if scoped to current admin AI PDF data.
   - Clean Supabase dependency: already available.
   - Review Draft risk: low if display-only.
   - Provider risk: low if no new execution path.
   - Smoke needed: route smoke for `/admin/imports/pdf`, security smoke for no secrets/no raw provider output.

2. Practice Agent evidence/session UI polish
   - Source paths: `src/components/practice/practice-agent-client.tsx`, `practice-question-card.tsx`, `practice-round-review-panel.tsx`, `practice-trace-panel.tsx`.
   - Mock dependency: none for persisted sessions, but fatigue panel is demo-only.
   - Clean Supabase dependency: `practice_sessions`, `practice_rounds`, `practice_attempts`, `practice_wrong_questions`.
   - Review Draft risk: none.
   - Provider risk: medium if hint/review behavior is changed; keep first PR display-only.
   - Smoke needed: `/practice`, custom round, grade, wrong-question read.

3. Blueprint workspace clarity
   - Source paths: current `src/components/blueprints/blueprint-workspace.tsx` and demo copy/cards.
   - Mock dependency: narrative cards may be pitch-only.
   - Clean Supabase dependency: existing blueprint tables.
   - Provider risk: low if no generation/calibration action changes.
   - Smoke needed: `/admin/blueprints`, review/library/history/sources route smoke.

## Demo-Only / Archive Candidates

- `src/app/demo/state-aware-practice/**`: keep as competition demo unless a separate demo route is explicitly desired.
- `src/app/demo/fatigue-trigger/page.tsx`: keep demo-only; do not make it product UX.
- `src/components/practice/practice-fatigue-panel.tsx`: do not productize as real wearable support. If later used, rename/reframe as optional study-state/self-report signal.
- Final AI narrative docs/PDF branches: archive as pitch material.
- `supabase/migrations.zip` on demo branch: archive/remove; do not merge.
- Generated files such as `next-env.d.ts` and `tsconfig.tsbuildinfo` from demo branches: do not merge as feature artifacts.

## Risk Assessment

Low-risk areas:

- Display-only admin import/review polish.
- Current Blueprint Library copy/navigation cleanup.
- Read-only Practice session/evidence display.
- Demo docs and internal narrative.

Medium-risk areas:

- Teacher route shell and navigation.
- Teacher-owned AI PDF workspace visibility.
- Practice framework selection UX.
- Optional self-report/state action display.

High-risk areas:

- Any action that publishes questions or approves taxonomy assignments.
- Exam-style question generation from course packages.
- Selected-thread reports that call the provider.
- Any new provider gateway access path.
- Any wearable/state persistence or health-adjacent data model.
- Any change to Review Draft publish lineage.

## Recommended Productization Order

1. AI Parsing / Review Draft UX polish
   - Start with reusable import workspace display and clearer source/review status.
   - Do not add `/teacher` yet.

2. Course Builder read-only foundation
   - Add a teacher/admin read-only Course Builder overview using existing `course_generation_runs` and `practice_course_frameworks`.
   - No publish/generation/delete actions in the first slice.

3. Practice Agent evidence/session UX
   - Improve saved session, evidence, wrong-question, and feedback readability.
   - Keep provider-backed hint/review behavior unchanged.

4. Blueprint workspace surfaces
   - Improve source/history/readiness cards in the already-existing admin workspace.
   - Do not add new generation behavior.

5. Course Builder actions
   - Add run creation, framework preview, and publish actions only after RLS/security smoke is ready.
   - Route all generated-question output through Review Draft governance.

6. State-aware practice as optional signal only
   - Start with self-report/check-in UI, not wearable integration.
   - Keep safety language: learning recommendation, not diagnosis.

7. Enterprise extension
   - Keep pitch-only until core education workflow is stable.

## Suggested PR Plan

PR 1: AI Parsing Review UX and Source Handoff

- Files likely: `src/app/admin/imports/pdf/page.tsx`, `src/components/ai-pdf-import-panel.tsx`, maybe a reusable workspace component.
- No DB schema.
- No provider behavior change.
- Add route/security smoke for no raw provider output and Review Draft handoff copy.

PR 2: Practice Evidence Display Polish

- Files likely: `src/components/practice/*`, `src/lib/practice/client-helpers.ts`.
- Display-only first.
- Keep custom round/grade/wrong-question smoke.

PR 3: Blueprint Workspace Clarity

- Files likely: `src/components/blueprints/blueprint-workspace.tsx`, admin blueprint route smoke.
- No generation/calibration behavior change.

PR 4: Teacher Course Builder Read-Only Shell

- Files likely: `src/app/teacher/**` or admin-scoped equivalent.
- Read-only overview of existing `course_generation_runs`, `practice_course_frameworks`, imports, and reports.
- Requires teacher/admin route smoke and RLS review.

PR 5: Teacher Course Builder Mutations

- Split by boundary:
  - run/package creation
  - framework preview/publish
  - report generation
  - generated-question handoff
- Do not mix provider calls, publish actions, and delete/reset flows into one PR.

PR 6: State-Aware Demo Surface

- Optional competition/demo route only.
- No wearable persistence.
- No medical claims.
- Do not make it the main product pillar.

## Explicit Non-Goals

- Do not merge `codex/web-demo-feature-scan-ui-expansion` wholesale.
- Do not cherry-pick old migration artifacts.
- Do not reintroduce legacy DB reset work.
- Do not add new provider execution paths in a UI polish PR.
- Do not bypass Review Draft / no-auto-publish governance.
- Do not make wearable/state-aware tracking the main product direction.
- Do not claim medical diagnosis, FDA-grade monitoring, EEG, or production wearable support.
- Do not change `.env.local`, provider credentials, old Supabase, or production env.

## Recommended Next Codex Task

Start with PR 1:

```text
Productize AI Parsing / Review Draft UX handoff from demo branch.
Use current main as source of truth.
Inspect origin/codex/web-demo-feature-scan-ui-expansion only for UI patterns.
Do not add teacher routes yet.
Do not change provider calls, DB schema, or Review Draft publish behavior.
```

This gives the competition demo an immediate visible improvement while staying inside the already-validated clean Supabase and Review Draft boundaries.
