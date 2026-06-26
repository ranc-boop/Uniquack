# Site Performance Audit

## Executive Summary

PERF0 added dev-only audit tooling and ran a whole-site performance/dead-code scan against the current Next.js app. The current build is not dominated by a single public-page bundle. The biggest risks are concentrated in:

- Large client islands: `src/components/practice/practice-agent-client.tsx` and `src/components/ai-pdf-import-panel.tsx`.
- Large server bundles and service files: `src/app/admin/imports/pdf/page.tsx` pulls the largest server app bundle, backed by `src/lib/ai-pdf-import/service.ts`.
- Admin routes that fetch broad supporting data: Review Drafts, Tags, Admin Questions, and import tools frequently load 1000+ supporting rows.
- Dead-code candidates from Knip: old UI primitives, editor/Tiptap helpers, and many planning-foundation exports that should be reviewed before deletion.

No feature behavior was changed in this PR.

## Tooling Added

Package scripts:

```json
{
  "analyze": "cross-env ANALYZE=true next build --webpack",
  "perf:audit": "node scripts/site-performance-audit.mjs",
  "deadcode:audit": "knip --reporter compact"
}
```

Dev dependencies:

- `@next/bundle-analyzer`
- `cross-env`
- `knip`

Analyzer behavior:

- Normal `npm.cmd run build` is unchanged.
- `npm.cmd run analyze` writes analyzer reports under `.next/analyze/`.
- `npm.cmd run perf:audit` reads `.next` build artifacts and writes `.next/site-performance-audit.json`.
- `npm.cmd run deadcode:audit` intentionally exits non-zero when it finds unused candidates.

## Route-Level Findings

Build mode: `next build --webpack`.

All listed app routes are dynamic (`ƒ`) in the current build output.

| Route | Client route chunk | Server app bundle | Findings |
| --- | ---: | ---: | --- |
| `/` | 1.2 KB / 741 B gzip | 32.2 KB / 10.7 KB gzip | Small route chunk. Imports global layout, icons, cards, and global KaTeX CSS through root layout. |
| `/admin` | 4.8 KB / 2.1 KB gzip | 37.6 KB / 12.8 KB gzip | Admin shell is modest. Watch global admin nav growth. |
| `/admin/questions` | 1.0 KB / 562 B gzip | 50.9 KB / 14.8 KB gzip | Server page is large and does fallback `select("*")` when taxonomy RPC is unavailable. Uses paginated question query but fetches assets/source/import refs after. |
| `/admin/review` | 7.2 KB / 2.3 KB gzip | 40.0 KB / 12.5 KB gzip | Fetches draft questions plus tags/assets/source files/import items with `limit(1000)` support queries. Risk grows with draft/import data. |
| `/admin/imports/pdf` | 52.4 KB / 15.7 KB gzip | 441.2 KB / 113.8 KB gzip | Largest server bundle. AI PDF client panel is 58.8 KB source. Route imports provider/profile/chunking/display state and upload controls. |
| `/admin/blueprints` | 160 B / 145 B gzip | 22.7 KB / 7.7 KB gzip | Route chunk is tiny because UI is server-rendered. Main risk is source complexity in `blueprint-workspace.tsx` (89.2 KB). |
| `/admin/blueprints/review` | 160 B / 144 B gzip | 22.9 KB / 7.7 KB gzip | Thin route wrapper to the shared Blueprint workspace. |
| `/admin/blueprints/library` | 160 B / 145 B gzip | 22.9 KB / 7.7 KB gzip | Thin route wrapper to the shared Blueprint workspace. |
| `/admin/blueprints/sources` | 160 B / 145 B gzip | 22.9 KB / 7.7 KB gzip | Thin route wrapper to the shared Blueprint workspace. |
| `/admin/blueprints/history` | 160 B / 144 B gzip | 22.9 KB / 7.7 KB gzip | Thin route wrapper to the shared Blueprint workspace. |
| `/questions` | 13.3 KB / 4.3 KB gzip | 54.5 KB / 17.7 KB gzip | Server page loads taxonomy catalog and question summaries. Client filter/display island is moderate. |
| `/practice` | 59.5 KB / 14.8 KB gzip | 121.0 KB / 36.5 KB gzip | Largest route client chunk. `PracticeAgentClient` is a 99.3 KB client component with SSE parsing, sidebars, session history, answer state, hints, review, and recommendations in one island. |
| `/videos` | 4.2 KB / 1.9 KB gzip | 40.6 KB / 13.4 KB gzip | Fetches 100 videos and taxonomy assignments. Reasonable now, but needs pagination if library grows. |

## Largest Bundles / Modules

Root client chunks:

| File | Size |
| --- | ---: |
| `static/chunks/3794-*.js` | 217.5 KB / 59.3 KB gzip |
| `static/chunks/4bd1b696-*.js` | 195.2 KB / 61.4 KB gzip |
| `static/chunks/webpack-*.js` | 3.4 KB / 1.7 KB gzip |

Largest app route client chunks:

| Route | Size |
| --- | ---: |
| `/practice` | 59.5 KB / 14.8 KB gzip |
| `/admin/imports/pdf` | 52.4 KB / 15.7 KB gzip |
| `/admin/imports/package` | 26.4 KB / 8.4 KB gzip |
| `/admin/imports` | 21.0 KB / 7.1 KB gzip |
| `/admin/imports/assets` | 18.3 KB / 5.7 KB gzip |

Largest server bundles:

| Route | Size |
| --- | ---: |
| `/admin/imports/pdf` | 441.2 KB / 113.8 KB gzip |
| `/practice` | 121.0 KB / 36.5 KB gzip |
| `/questions/[id]` | 79.0 KB / 23.5 KB gzip |
| `/admin/ai-settings` | 70.2 KB / 22.1 KB gzip |
| `/admin/tags` | 56.9 KB / 17.0 KB gzip |

Notable package contributors / risks:

- `katex` is imported by `MathContent`, and `katex/dist/katex.min.css` is imported globally in `src/app/layout.tsx`.
- Tiptap dependencies are installed, and `src/components/editor/tiptap-extensions.ts` imports them, but Knip reports that file/dependencies as unused candidates.
- `pdfjs-dist`, `@napi-rs/canvas`, and `sharp` are server-side AI PDF parsing/rendering dependencies. They are correctly externalized in `next.config.ts`, but the AI PDF admin route remains the largest server bundle.
- `@supabase/ssr` is used in server/client helpers. Several client panels import `createClient` from `src/lib/supabase/client.ts`.
- `lucide-react` imports are common. Current route chunk sizes do not suggest a catastrophic icon-library pull, but icon imports should remain named imports only.

## Client Component Audit

Largest `"use client"` source files:

| File | Source size | Notes |
| --- | ---: | --- |
| `src/components/practice/practice-agent-client.tsx` | 99.3 KB | Single large client island handling session creation, history, sidebars, SSE parsing, answers, hints, recommendations, review, resizing, and UI state. Top PERF2 target. |
| `src/components/ai-pdf-import-panel.tsx` | 58.8 KB | Upload, provider mode, segmentation, polling, source management, and server-action calls in one client island. Top PERF2 target. |
| `src/components/batch-import-json-panel.tsx` | 20.5 KB | Admin-only import UI. Candidate for lazy loading under import page tabs. |
| `src/components/package-import-panel.tsx` | 20.0 KB | Admin-only zip/package import UI. Candidate for dynamic import. |
| `src/components/bulk-asset-upload-panel.tsx` | 17.6 KB | Admin-only upload flow. Candidate for dynamic import. |
| `src/components/ai-pdf-segmentation-planner.tsx` | 13.8 KB | Only needed inside AI PDF import. Keep out of shared layouts. |
| `src/components/question-editor/question-editor.tsx` | 11.6 KB | Review/admin editing island. Should not leak into public question pages except where intentionally used. |
| `src/components/tags/taxonomy-tag-tree-picker.tsx` | 10.7 KB | Used for admin/review taxonomy editing. Candidate for smaller readonly display components. |

Recommended boundary changes:

- Split `PracticeAgentClient` into server shell + smaller client islands for session list, active round, answer editor, and sidebars.
- Split `AIPdfImportPanel` into upload/source selector, provider configuration summary, status polling, and advanced segmentation controls.
- Convert readonly tag/chip displays to server components where possible; keep tree pickers as client-only edit controls.
- Lazy-load admin-only import panels when the admin route renders multiple import tools.

## Import Hygiene

Findings:

- `src/app/layout.tsx` imports global KaTeX CSS. This is convenient but applies to all routes, including pages with no math.
- `src/components/math-content.tsx` is a client component and imports `katex`; many routes render math through it.
- Import pages (`/admin/imports/*`) import multiple large upload/panel components and Supabase browser client code.
- `src/components/ui/command.tsx`, `src/components/ui/form.tsx`, `src/components/ui/slider.tsx`, and `src/components/ui/tooltip.tsx` are reported unused by Knip. If true, their dependencies (`cmdk`, `react-hook-form`, Radix slider/tooltip) may be removable.
- `src/components/editor/tiptap-extensions.ts` is reported unused; if confirmed, Tiptap dependencies may be removable.
- No obvious full icon-library namespace import was found; continue using named `lucide-react` imports.

## Dead Code Audit

Command:

```bash
npm.cmd run deadcode:audit
```

Result: Knip completed and returned non-zero because it found candidates.

High-value candidates to manually verify first:

- Unused files:
  - `src/components/editor/tiptap-extensions.ts`
  - `src/components/questions-table.tsx`
  - `src/components/ui/command.tsx`
  - `src/components/ui/form.tsx`
  - `src/components/ui/pagination.tsx`
  - `src/components/ui/slider.tsx`
  - `src/components/ui/tooltip.tsx`
  - `scripts/markdown-latex-editor-browser-smoke.mjs`
  - `scripts/admin-reset-question-bank.mjs`
  - `scripts/route-smoke.mjs` (likely false positive because it is intentionally run directly, not through package scripts)

- Unused dependencies reported:
  - `@hookform/resolvers`
  - `@radix-ui/react-slider`
  - `@radix-ui/react-tooltip`
  - `@tanstack/react-table`
  - `@tiptap/extension-mathematics`
  - `@tiptap/react`
  - `@tiptap/starter-kit`
  - `cmdk`
  - `react-hook-form`

- Unused dev dependency reported:
  - `@types/katex`

Important caution:

Many planning-foundation exports under `src/lib/ai-pdf-import/*` and `src/lib/blueprints/*` are reported unused. Some are intentionally exported contracts for smoke tests, future phases, or documentation. Do not bulk-delete them without owner review.

## Data / Render Audit

Potential record-count issues:

- `src/app/admin/review/page.tsx`
  - Loads draft questions, import items, taxonomy tags, assets, and source files.
  - Multiple support queries use `limit(1000)`.
  - PERF3 should move to summary/pagination and only load per-card details when expanded.

- `src/app/admin/tags/page.tsx`
  - Loads taxonomy nodes up to 2000 and edges up to 4000.
  - Acceptable for admin now, but should move to facet/tree pagination or incremental loading if taxonomy grows.

- `src/app/admin/imports/assets/page.tsx`
  - Loads up to 1000 questions and 2000 asset/source rows.
  - Should move toward search-driven selection or paginated asset review.

- `src/app/admin/questions/page.tsx`
  - Uses taxonomy RPC for paged search, but fallback path uses `select("*", { count: "exact" })`.
  - After selecting IDs, the page fetches full question rows and supporting assets/source/import refs.

- `src/lib/practice/persistence.ts`
  - Several `.select("*")` calls in session/round/attempt persistence.
  - PERF3 should replace broad selects with typed summary columns for the agent UI.

Render-cost risks:

- `src/components/blueprints/blueprint-workspace.tsx` is 89.2 KB. It is server-rendered, so it does not inflate client JS much, but it is a maintainability/render complexity hotspot.
- `src/components/practice/practice-agent-client.tsx` combines many interactive regions in one client component; every state change risks broad re-render.
- `src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx` is 33.4 KB and renders many optional diagnostic sections. Keep diagnostics collapsed and summary-first.

## Safe Cleanup Items

Good PERF1 candidates after manual confirmation:

- Remove unused Tiptap editor helpers and dependencies if no current route imports them.
- Remove unused shadcn/Radix UI primitives that are not referenced.
- Add package scripts for currently direct-run smoke scripts if Knip false positives are noisy.
- Split old planning foundation exports into internal modules or mark intentionally exported contracts in Knip config.
- Move global KaTeX CSS to a narrower import only if visual regression risk is manageable.

## Risky Refactor Items

Do not combine these with dead-code deletion:

- Splitting `PracticeAgentClient`; high UX risk and API-state risk.
- Splitting `AIPdfImportPanel`; upload/lease/status flows are sensitive.
- Refactoring `src/lib/ai-pdf-import/service.ts`; high risk for AI PDF import stability.
- Changing Review Draft data loading; must preserve draft-only/no auto-publish and import asset visibility.
- Changing taxonomy/blueprint persistence routes; must preserve admin-only writes and quality gates.

## Suggested Cleanup PR Order

### PERF1: Remove obvious dead code and unused deps

- Expected impact: smaller install size and less cognitive load; possible bundle reduction if Tiptap/cmdk/form/slider are truly unused.
- Risk: low to medium.
- Likely files: `package.json`, `package-lock.json`, unused `src/components/ui/*`, `src/components/editor/tiptap-extensions.ts`.
- Tests: lint, build, security smoke, route smoke, markdown editor smoke, package/batch/import smokes.

### PERF2: Fix client/server boundaries and dynamic imports

- Expected impact: lower client JS for `/practice`, `/admin/imports/pdf`, import tools, and edit-heavy admin pages.
- Risk: medium to high.
- Likely files: `src/components/practice/*`, `src/components/ai-pdf-import-panel.tsx`, `src/app/admin/imports/*`, `src/components/question-editor/*`.
- Tests: lint, build, route smoke, practice smoke, AI PDF/import smokes, manual route QA.

### PERF3: Route-level pagination and summary loading

- Expected impact: faster admin/review/questions/tags routes as data grows.
- Risk: medium.
- Likely files: `src/app/admin/review/page.tsx`, `src/app/admin/tags/page.tsx`, `src/app/admin/questions/page.tsx`, `src/app/admin/imports/assets/page.tsx`, practice persistence helpers.
- Tests: route smoke, RLS smoke, review/manual QA, taxonomy search QA.

### PERF4: Performance budgets / CI regression checks

- Expected impact: catches bundle growth before merge.
- Risk: low once baseline is stable.
- Likely files: CI workflow, `scripts/site-performance-audit.mjs`, package scripts, budget config.
- Tests: CI dry run, lint, build, `perf:audit`.

## PERF1 Active Bundle And Render Weight Reduction

PERF1 focused on active route chunk weight and initial render/data volume without deleting features.

### Files Changed

- `src/app/practice/page.tsx`
- `src/components/practice/practice-agent-loader.tsx`
- `src/app/admin/imports/pdf/page.tsx`
- `src/components/ai-pdf-import-panel.tsx`
- `src/components/ai-pdf-import-panel-loader.tsx`
- `src/app/admin/imports/page.tsx`
- `src/components/batch-import-json-panel-loader.tsx`
- `src/app/admin/imports/assets/page.tsx`
- `src/components/bulk-asset-upload-panel-loader.tsx`
- `src/app/admin/imports/package/page.tsx`
- `src/components/package-import-panel-loader.tsx`
- `src/app/admin/review/page.tsx`

### Bundle Before / After

Measured with:

```bash
npm.cmd run build
npm.cmd run perf:audit
npm.cmd run analyze
```

Route client chunks:

| Route | Before | After | Change |
| --- | ---: | ---: | ---: |
| `/practice` | 59.5 KB / 14.8 KB gzip | 3.6 KB / 1.4 KB gzip | -55.9 KB |
| `/admin/imports/pdf` | 52.4 KB / 15.7 KB gzip | 3.7 KB / 1.4 KB gzip | -48.7 KB |
| `/admin/imports` | 21.0 KB / 7.1 KB gzip | 3.7 KB / 1.4 KB gzip | -17.3 KB |
| `/admin/imports/assets` | 18.3 KB / 5.7 KB gzip | 3.7 KB / 1.4 KB gzip | -14.6 KB |
| `/admin/imports/package` | 26.4 KB / 8.4 KB gzip | 3.7 KB / 1.4 KB gzip | -22.7 KB |
| `/admin/review` | 7.2 KB / 2.3 KB gzip | 7.2 KB / 2.3 KB gzip | unchanged client chunk; server data query reduced |
| `/admin/questions` | 1.0 KB / 562 B gzip | 1.0 KB / 562 B gzip | unchanged |
| `/videos` | 4.2 KB / 1.9 KB gzip | 4.2 KB / 1.9 KB gzip | unchanged |

Server bundles:

| Route | Before | After | Change |
| --- | ---: | ---: | ---: |
| `/practice` | 121.0 KB / 36.5 KB gzip | 28.1 KB / 9.4 KB gzip | -92.9 KB |
| `/admin/imports/pdf` | 441.2 KB / 113.8 KB gzip | 400.5 KB / 102.2 KB gzip | -40.7 KB |
| `/admin/imports` | 49.6 KB / 15.8 KB gzip | 33.9 KB / 11.0 KB gzip | -15.7 KB |
| `/admin/imports/assets` | 49.2 KB / 15.7 KB gzip | 34.1 KB / 11.4 KB gzip | -15.1 KB |
| `/admin/imports/package` | 49.0 KB / 15.8 KB gzip | 27.0 KB / 9.3 KB gzip | -22.0 KB |

### What Changed

- Added small client loader islands with `next/dynamic` and `ssr: false` for:
  - Practice workspace.
  - AI PDF import controls.
  - Manual JSON import editor.
  - Bulk asset upload matcher.
  - Package import controls.
- The heavy interactive tools are still available, but the route shell no longer carries their full client code as the first route chunk.
- `/admin/imports/assets` now loads the first 250 draft questions by default instead of 1000, with clear UI copy when more draft questions exist.
- `/admin/review` now reuses the already-loaded taxonomy catalog instead of issuing a duplicate active `taxonomy_nodes` support query.

### Intentional Non-Changes

- The large source files still exist. PERF1 reduces active route chunks, not internal source complexity.
- `PracticeAgentClient` and `AIPdfImportPanel` were not internally split yet; they are deferred into async chunks. Deeper component refactors remain PERF2.
- `/admin/tags` still loads the full taxonomy tree. That route needs a dedicated tree pagination/search design before reducing the query.
- `/admin/questions` and `/videos` were left unchanged because their current route chunks are already small and their data loading is paginated or bounded enough for this pass.

### PERF1 Follow-Ups

- PERF2 should split `PracticeAgentClient` into smaller interactive islands so the deferred chunk itself becomes smaller.
- PERF2 should split `AIPdfImportPanel` into upload/source/status/segmentation islands.
- PERF3 should add deeper pagination or search-first loading for taxonomy and Review Draft support data.
- PERF4 should turn the route chunk table from `perf:audit` into a CI budget once the baseline is accepted.

## PERF2 Dead Code And Unused Dependency Cleanup

PERF2 re-ran Knip after PERF1 and removed only candidates with no imports, no route conventions, and no current manual smoke requirement.

### Deleted Files

- `src/components/editor/tiptap-extensions.ts`
- `src/components/questions-table.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/form.tsx`
- `src/components/ui/pagination.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/tooltip.tsx`

### Removed Dependencies

- `@hookform/resolvers`
- `@radix-ui/react-slider`
- `@radix-ui/react-tooltip`
- `@tanstack/react-table`
- `@tiptap/extension-mathematics`
- `@tiptap/react`
- `@tiptap/starter-kit`
- `cmdk`
- `react-hook-form`
- `@types/katex`

`katex` itself stayed because `MathContent` and the markdown/LaTeX smoke tests still use it directly.

### Knip Classification

Safe to delete now:

- The old Tiptap extension helper and Tiptap dependencies. `rg` found no imports outside the helper itself.
- The unused `QuestionsTable` component. Current question bank routes use other table/client components.
- The unused shadcn-style `command`, `form`, `pagination`, `slider`, and `tooltip` component files and their direct dependencies.

Probably used dynamically / keep:

- `scripts/route-smoke.mjs`. It is intentionally run directly in CI/manual checks even though Knip does not see it through `package.json`.
- `scripts/admin-reset-question-bank.mjs`. It is an admin-only manual safety tool and should not be removed just because it is not part of normal app imports.
- `scripts/markdown-latex-editor-browser-smoke.mjs`. It remains a manual browser smoke for editor behavior; the node markdown smoke still runs in automated checks.

Needs manual follow-up:

- Unused exported helpers/types in AI PDF import, Blueprint, taxonomy, provider, and batch-import modules. Many are planning contracts, smoke fixtures, or future integration boundaries. Removing them should happen module-by-module with owner review, not as broad PERF2 deletion.
- Unused shadcn sub-exports such as `CardFooter`, `CardDescription`, table/dialog subcomponents, and variant helper exports. These are low impact and may be used by upcoming UI work.

Dependency can be removed:

- The Tiptap, React Hook Form, cmdk, React Table, Radix slider, and Radix tooltip packages listed above.

Dependency must stay:

- `katex`, because runtime math rendering and smoke tests import it.
- Core Radix primitives still imported by active UI components, such as accordion, checkbox, dialog, label, popover, and slot.

### PERF2 Non-Changes

- No route files, server actions, migrations, AI provider code, AI parsing logic, Blueprint logic, Review Draft behavior, or question generation behavior changed.
- No attempt was made to prune public exported planning contracts from AI/Blueprint modules in this pass.
- `deadcode:audit` is still expected to return non-zero because the remaining findings are intentionally classified as keep/follow-up.

### PERF2 Verification

Commands run:

```bash
npm.cmd run deadcode:audit
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/supabase-rls-smoke.mjs
node scripts/batch-import-smoke.mjs
node scripts/question-assets-security-smoke.mjs
node scripts/bulk-asset-import-smoke.mjs
node scripts/package-import-smoke.mjs
node scripts/markdown-latex-editor-smoke.mjs
npm.cmd run smoke
npm.cmd run perf:audit
npm.cmd run analyze
```

Manual route checks also verified that `/practice`, admin import routes, Blueprint routes, Review Drafts, Admin Questions, `/questions`, and `/videos` still render or auth-redirect without server errors.

`deadcode:audit` remains non-zero after cleanup, but no unused dependencies remain. The remaining unused files are intentionally kept manual scripts, and the remaining unused exports/types are follow-up candidates.

## PERF2B Practice History Schema Cutover

PERF2B makes the current database-backed Practice runtime the only supported active session format.

### Current Supported Practice Schema

- Current session schema/version: `CURRENT_PRACTICE_SESSION_SCHEMA_VERSION = "practice-session-v2"`.
- Current question snapshot schema/version: `CURRENT_PRACTICE_QUESTION_SNAPSHOT_SCHEMA_VERSION = "practice-question-snapshot-v2"`.
- `practice_sessions.cache_prefix_version` is the runtime gate for resumable sessions.
- New practice sessions write the current session schema version.
- New round, attempt, and wrong-question snapshots include the current snapshot schema version.

### Old Compatibility Paths Removed

- Practice session list/detail loading now only returns rows with the current `cache_prefix_version`.
- Recommendation, review, and custom-round API routes reject old session versions with:
  `This practice session uses an old format and cannot be resumed. Start a new practice session.`
- Old question snapshots are not normalized through old row-field fallbacks. They are ignored unless they include the current snapshot version.
- Missed-question custom rounds no longer recover from old unversioned wrong-question snapshots.
- Preference merge job creation only considers current-schema sessions.

### Browser Storage Handling

- Current pending-round handoff key: `o2i:practice:v2:pendingRound`.
- The old `o2i:pendingPracticeRound` practice key is removed on Practice page load.
- No unrelated browser storage is cleared.
- The Practice client still does not use `localStorage`.

### Old History Behavior

- Old database sessions are not hard-deleted and no destructive migration was added.
- Old sessions are omitted from the current session list and cannot be resumed through current practice APIs.
- Old/wrong snapshot rows are filtered out rather than rendered through compatibility adapters.
- Users can start a new current-schema practice session normally.

### Files Simplified

- `src/lib/practice/schema.ts`
- `src/lib/practice/persistence.ts`
- `src/lib/practice/agent-loop.ts`
- `src/lib/practice/context.ts`
- `src/app/api/practice/recommend/route.ts`
- `src/app/api/practice/review/route.ts`
- `src/app/api/practice/rounds/custom/route.ts`
- `src/components/practice/practice-agent-client.tsx`
- `src/components/practice/mistakes-page-client.tsx`
- `scripts/security-smoke.mjs`

### Remaining Follow-Ups

- A future migration can add an explicit `schema_version` column if the project needs richer lifecycle reporting for expired practice sessions.
- A future UI polish pass can add a dedicated expired-session empty state if old session links become visible somewhere outside the current session list.

## PERF2B Practice Page Dead-Code Cleanup

PERF2B inspected only the Practice page/runtime surface after the route-level lazy loading from PERF1 and the general dead-code pass from PERF2.

### Practice Files Inspected

- `src/app/practice/page.tsx`
- `src/components/practice/practice-agent-loader.tsx`
- `src/components/practice/practice-agent-client.tsx`
- `src/components/practice/mistakes-page-client.tsx`
- `src/components/practice/question-practice-panel.tsx`
- `src/lib/practice/agent-loop.ts`
- `src/lib/practice/ai.ts`
- `src/lib/practice/context.ts`
- `src/lib/practice/grading.ts`
- `src/lib/practice/persistence.ts`
- `src/lib/practice/schema.ts`
- `src/lib/practice/tools.ts`
- `src/lib/practice/types.ts`

### Code Removed Or Simplified

- Removed the unused `compactSessionMemory` helper from `src/lib/practice/context.ts`.
- Removed the unused old `persistRoundReview` persistence path from `src/lib/practice/persistence.ts`.
- Removed the now-unused `buildEpisodeCard` helper that existed only for the old `persistRoundReview` path.
- Converted internal-only Practice helpers/types from exported API surface to module-local declarations:
  - `sortKeysDeep`
  - `normalizeLLMUsage`
  - `loadPracticeCourseFramework`
  - `maybeQueuePreferenceMergeJob`
  - `upsertPracticeAgentEpisode`
  - `PracticeSearchShortCandidate`
  - `PracticePhase`
  - `PracticeMemoryUpdate`
  - `PracticeReviewAttempt`
  - `PracticePreferenceResponse`

### Compatibility Code Removed

- The old one-shot round review persistence branch was removed because the current review route uses the split current flow:
  - `persistQuestionReviewResults`
  - `persistRoundReviewSummary`
- No old session/snapshot compatibility adapters were restored. Practice still only resumes the current `practice-session-v2` format.

### Code Intentionally Kept

- The Practice client trace panel remains available but collapsed/secondary; it supports current streaming diagnostics and is not loaded as a separate default debug route.
- Wrong-question practice, hints, review diagnostics, pending-round handoff, and persisted session loading were left unchanged.
- Server-side recommendation/search tooling was left intact because it is active Practice runtime behavior, not dead UI code.
- The dynamic Practice island from PERF1 remains the route shell boundary.

### Bundle / Render Impact

- Removed roughly 350 lines of old server-side Practice persistence/helper code.
- Reduced the public export surface of Practice server modules to make future dead-code audits less noisy.
- No user-facing Practice flow was redesigned, so initial `/practice` shell behavior and the lazy-loaded client boundary remain unchanged.

### Remaining Practice Risks

- `src/components/practice/practice-agent-client.tsx` is still a large client island. Further reduction should be a focused UI split with manual Practice QA, not a dead-code deletion pass.
- Trace/detail rendering could be split into an optional lazy panel later if diagnostics remain a measurable client-side cost.
- Practice search/recommendation server helpers remain broad because they are part of active agent behavior and need product-level review before any deeper pruning.

## PERF2C Practice Agent Client Split

PERF2C keeps the `/practice` route shell from PERF1 and splits the loaded Practice island into focused UI modules.

### Before / After

- Baseline `practice-agent-client.tsx`: 99.9 KB source in `perf:audit`.
- After split `practice-agent-client.tsx`: 67.3 KB source in `perf:audit`.
- New lazy trace/debug panel: `practice-trace-panel.tsx`, 16.2 KB source, loaded only when the agent trace UI is rendered.
- `/practice` route shell remains 3.6 KB client gzip 1.4 KB.

### Components Split

- `src/components/practice/practice-question-card.tsx`
  - Per-question prompt, answer input, hints, grading badge, solution, and question-level diagnosis.
- `src/components/practice/practice-round-review-panel.tsx`
  - Round review summary, memory note, next-round focus, and next-round controls.
- `src/components/practice/practice-readable-data-card.tsx`
  - Readable study-state cards for session outline, round rationale, and practice thread details.
- `src/components/practice/practice-trace-panel.tsx`
  - Agent trace/debug display and model/tool detail formatting.
- `src/lib/practice/client-helpers.ts`
  - Client-only duration formatting, history restoration helpers, and pending-round storage handoff.

### Lazy Panels Added

- `TracePanel` is imported through `next/dynamic` with `ssr: false`.
- The initial starter/workspace path no longer carries the trace formatting component in the main Practice client source.
- Session sidebar, answering, hints, review, wrong-question practice, and persisted session restoration are still eagerly available because they are active workflow UI.

### Behavior Preserved

- Practice workspace loading.
- New session creation and session switching.
- Taxonomy-based recommendation flow.
- Question answering for MCQ and written responses.
- Hint requests.
- Streaming review fallback and per-question feedback.
- Wrong-question retry flow.
- Current pending-round storage handoff.
- Persisted session history restoration.

### Remaining Practice Risks

- The main Practice client is still 67.3 KB because it owns orchestration, sidebars, session state, and network transitions.
- A future PR could split left/right sidebars into presentational components once the current behavior is manually QA'd after this split.
- Trace panel code is lazy, but the right-side study-state cards remain eager because they are visible in the default desktop workspace.

## PERF3 Data Loading And Pagination

PERF3 focused on routes that can become slow even when client bundles are small, because their server components were pulling fixed large batches of related rows.

### Routes Inspected

- `/admin/review`
- `/admin/questions`
- `/admin/imports/assets`
- `/admin/blueprints`
- `/admin/blueprints/review`
- `/admin/blueprints/library`
- `/admin/blueprints/history`
- `/admin/blueprints/sources`
- `/questions`
- `/videos`

### Changes Made

- `src/app/admin/review/page.tsx`
  - Added page-sized review queue loading with `REVIEW_PAGE_SIZE = 50`.
  - Batch-scoped review now pages `import_batch_items` instead of loading up to 1000 imported IDs.
  - Draft search is applied in the database query before rendering.
  - Related import items, taxonomy assignments, assets, and source files are bounded to the visible page window.
  - Added Previous / Next controls for large Review Draft queues.
- `src/app/admin/imports/assets/page.tsx`
  - Kept the existing 250 draft-question matching window.
  - Bounded existing asset/source-file lookups to that draft window instead of using two independent 2000-row lookups.
- `src/app/videos/page.tsx`
  - Replaced the fixed 100-video initial load with `VIDEOS_PAGE_SIZE = 25` pagination.
  - Added bounded question prefilters for difficulty and question-text search.
  - Added Previous / Next controls and a clear note when difficulty filtering reaches its bounded question prefilter.
- `scripts/route-smoke.mjs`
  - Added route regression checks that Review Drafts, bulk asset import, and Videos keep paged/bounded loading.

### Routes Already Healthy

- `/admin/questions` already uses the taxonomy search RPC with page limit/offset and only fetches current-page question details.
- `/questions` already uses the taxonomy search RPC with page limit/offset and only fetches current-page public question summaries.
- Blueprint routes already use bounded 20/50/60-level query windows. They still share one workspace loader, which is acceptable for this pass but remains a future split candidate.

### Compatibility Notes

- No DB schema, storage policy, AI provider behavior, AI Parsing behavior, Blueprint generation logic, Review Draft publishing behavior, or Practice behavior changed.
- Import service context queries that load taxonomy candidates or existing question codes were left unchanged because those are import validation paths, not initial route-render paths.
- `/videos` still avoids adding a new RPC. Its pagination is bounded with existing tables; a future dedicated video-search RPC would make cross-video/question search and counts more exact.

### Remaining PERF3 Follow-Ups

- Split the Blueprint workspace loader by tab so `/admin/blueprints/review`, `/library`, `/history`, and `/sources` only run the queries needed by that view.
- Add a dedicated `search_videos_by_taxonomy` RPC if public video search needs exact counts across video fields, question fields, difficulty, and taxonomy filters.
- Consider a lightweight count/summary query for large Review Draft batch filters if admins need exact search counts inside a very large batch.

## Commands Run

```bash
npm.cmd install --save-dev @next/bundle-analyzer cross-env knip
npm.cmd run build
npm.cmd run perf:audit
npm.cmd run deadcode:audit
npm.cmd run analyze
npm.cmd run perf:audit
```

Notes:

- `deadcode:audit` returned non-zero because Knip found candidates.
- `analyze` generated `.next/analyze/nodejs.html`, `.next/analyze/edge.html`, and `.next/analyze/client.html`.
- Analyzer emitted webpack cache snapshot warnings after successful build; build still passed.
