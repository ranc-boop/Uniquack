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
