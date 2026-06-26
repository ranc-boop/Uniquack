# Admin UI/UX Audit and Redesign Plan

## Scope

This ADMIN-UI0 pass audits the current admin interface and proposes a staged redesign plan. It does not implement a redesign, change business logic, remove routes, alter provider behavior, change publishing rules, or introduce migrations.

The audit uses the `ui-ux-pro-max` guidance as a checklist for accessibility, interaction clarity, layout, progressive disclosure, loading states, navigation hierarchy, forms, and data-heavy admin surfaces.

## Executive Summary

The admin UI has grown into a powerful but flat operations surface. Most workflows are functional, but the experience now reads more like engineering tooling than a teacher/admin product. The main issue is not one broken page. It is the lack of shared admin information architecture and visual primitives.

Top UX problems:

1. The admin sidebar is a flat list of many unrelated destinations, so primary workflows compete with advanced tools.
2. Page headers, cards, badges, forms, empty states, and action groups are inconsistent across admin pages.
3. Important actions are sometimes buried inside large cards, tables, or per-item sections.
4. Debug/internal data such as raw summaries, UUIDs, taxonomy IDs, warnings, and technical details remains too visible by default.
5. Blueprint Workspace and AI PDF Import are dense multi-state workflows that need workflow-first layouts rather than raw status dashboards.
6. Destructive actions exist, but their placement and hierarchy need stronger separation from normal workflow actions.
7. Loading and skeleton states exist in some dynamic panels, but not as a coherent admin pattern.
8. Taxonomy labels have improved, but raw IDs still dominate some pickers, tables, and debug rows.

Recommended direction:

- Keep all routes.
- Reorganize admin navigation around workflows.
- Introduce shared admin layout primitives before polishing individual pages.
- Move debug and technical data behind clear disclosures.
- Make teacher/admin tasks visually primary: review, approve, import, organize, generate drafts, publish only after review.

## 1. Current Admin Information Architecture

### Current Route Inventory

Core admin routes observed:

- `/admin`
- `/admin/questions`
- `/admin/review`
- `/admin/imports`
- `/admin/imports/pdf`
- `/admin/imports/assets`
- `/admin/imports/package`
- `/admin/blueprints`
- `/admin/blueprints/review`
- `/admin/blueprints/library`
- `/admin/blueprints/history`
- `/admin/blueprints/sources`
- `/admin/tags`
- `/admin/videos`
- `/admin/practice-frameworks`
- `/admin/ai-settings`
- `/admin/users`

Related non-admin product routes observed:

- `/practice`
- `/questions`
- `/questions/[id]`
- `/videos`
- `/videos/[id]`

### Current Grouping by Product Purpose

#### Core Workflows

- `/admin`
- `/admin/questions`
- `/admin/review`
- `/admin/videos`

These routes support day-to-day content management and publishing.

#### AI/Import Tools

- `/admin/imports`
- `/admin/imports/pdf`
- `/admin/imports/assets`
- `/admin/imports/package`

These routes support manual JSON import, AI PDF import, bulk asset upload, and ZIP/package import.

#### Content Management

- `/admin/questions`
- `/admin/videos`
- `/admin/tags`

These routes manage official question/video content and taxonomy.

#### Blueprint Management

- `/admin/blueprints`
- `/admin/blueprints/review`
- `/admin/blueprints/library`
- `/admin/blueprints/history`
- `/admin/blueprints/sources`

This is now a complex workspace with review actions, approved library, folders, calibration, versioning, lifecycle, AI import handoff, and generation.

#### Review/Publishing

- `/admin/review`
- Blueprint review inside `/admin/blueprints/review`
- Taxonomy review inside `/admin/tags`

Review work is split across multiple pages.

#### Practice/Student Experience

- `/practice`
- `/questions`
- `/videos`
- `/admin/practice-frameworks`

Practice is partly public/student-facing and partly admin-managed.

#### Advanced/Debug Tools

- `/admin/imports`
- `/admin/imports/assets`
- `/admin/imports/package`
- `/admin/tags`
- setup-needed panels
- technical details in AI PDF dashboard
- raw import summaries in manual import history

These are useful but should not compete with primary workflows.

#### Settings

- `/admin/ai-settings`
- `/admin/users`

These are super-admin or operations routes.

## 2. Recommended Admin Navigation

The current `src/app/admin/layout.tsx` sidebar lists most admin routes at the same level. This makes secondary tools feel as important as primary workflows.

Recommended navigation structure:

### Primary

- Dashboard
- Questions
- Review Drafts
- Blueprint Library
- AI Parsing
- Practice
- Videos

### Advanced / More Tools

- Manual JSON Import
- Bulk Assets
- Package Import
- Taxonomy
- Practice Frameworks
- Diagnostics
- Admin Reset Tools, if present

### Settings

- AI Settings
- Users

### Navigation Behavior Recommendations

- Add active route highlighting.
- Group imports under AI Parsing or Import Tools.
- Keep super-admin-only items visible only to super admins, but preserve orientation with a Settings group.
- Use short labels in the sidebar and descriptive page headers inside pages.
- Add optional section headings in the sidebar: Workflows, Tools, Settings.
- Keep `/admin/blueprints/*` as sub-navigation inside Blueprint Library, not as top-level sidebar items.
- Avoid adding more top-level links until the grouped navigation exists.

## 3. Design System Recommendations

### Page Headers

Use one consistent page header component:

- Eyebrow for area, such as "AI Parsing" or "Content Management".
- H1 for the page.
- One sentence explaining the primary job.
- Primary action area on the right.
- Optional secondary links grouped as outline buttons.

Avoid long technical paragraphs in the first viewport. Move setup notes and safety explanations into secondary panels.

### Section Headers

Use section headers to answer:

- What is this section for?
- What is the next action?
- Is this workflow safe, blocked, or complete?

Use consistent spacing above major sections. Avoid stacking many same-weight card titles.

### Cards

Use cards for actual grouped tools or repeated items, not every page band.

Recommended card variants:

- Workflow card: primary action and current state.
- Data card: repeated list/table rows.
- Setup card: migration/provider/setup-needed state.
- Debug card: collapsed by default.
- Danger card: destructive or irreversible work.

Avoid nested cards where possible. Blueprint Workspace and AI PDF dashboard should use full-width sections with repeated cards only for repeated records.

### Tables and Lists

Data-heavy admin tables should:

- Use human labels first.
- Keep IDs secondary, muted, and copyable.
- Avoid full raw JSON cells.
- Use row actions grouped at the end.
- Collapse row edit details by default.
- Offer useful empty states.

Manual import currently shows `JSON.stringify(batch.summary)` in the visible Recent import batches table. That should become a concise summary with raw details collapsed.

### Status Badges

Create a shared admin status badge vocabulary:

- Draft
- Published
- Archived
- Pending review
- Needs evidence
- Approved
- Rejected
- Partial
- Failed
- Ready
- Setup needed
- Generation ready
- Calibration required

Badges should use semantic colors and readable labels, not raw database status strings as the primary display.

### Action Groups

Each page or card should have:

- One clear primary action.
- Secondary actions grouped separately.
- Advanced actions behind disclosure or in an overflow group.
- Destructive actions visually separated and confirmed.

Blueprint cards currently contain lifecycle, edit, calibration, folder, generation, and quality states in one dense area. The primary next action should be visually elevated based on state.

### Destructive Actions

Destructive actions should:

- Use danger styling.
- Be separated from normal save/update actions.
- Show object name and consequence.
- Prefer soft-delete/archive where supported.
- Avoid appearing inline next to primary workflow actions unless the object is clearly selected.

### Empty States

Empty states should tell the admin what to do next:

- No Review Drafts: "Import questions or generate draft questions, then review them here."
- No AI PDF imports: "Upload a private source PDF to start."
- No approved blueprints: "Store review actions from an AI import, then approve reusable blueprints."
- Empty folder: "No blueprints in this folder yet. Move approved blueprints here."
- No taxonomy assignments: "Assign active leaf taxonomy tags before publishing."

### Loading States

Use skeletons for dynamic client panels:

- AI PDF import panel
- Bulk asset upload panel
- Package import panel
- Practice client
- Any future admin table with client-side loading

Avoid blank loading states for large panels. Reserve space to reduce layout shift.

### Detail Drawers and Disclosures

Use progressive disclosure for:

- Technical provider details
- Raw JSON
- raw taxonomy IDs
- cluster IDs
- provider warnings
- full traces
- source evidence
- debug-only migration/setup state

The default view should be operational, not diagnostic.

### Debug Sections

Debug sections should:

- Be collapsed by default.
- Be labeled as "Technical details" or "Debug details".
- Never expose secrets, private URLs, raw provider output, image bytes, base64, or full PDF text.
- Provide concise safe summaries before details.

### Folder/Sidebar Layout

Blueprint folders are useful, but the workspace should avoid competing sidebars. Use:

- Left folder/filter panel.
- Main content list.
- Right details drawer only when an item is selected, not always visible.

On mobile, folder filters should collapse above the list.

### Forms

Forms should:

- Use visible labels.
- Group related fields.
- Keep advanced fields collapsed.
- Use helper text for complex inputs.
- Show validation near fields.
- Use disabled state copy that explains why an action is unavailable.

Long admin forms in questions, videos, tags, and blueprints would benefit from consistent `FieldGroup`, `ActionBar`, and `InlineValidation` primitives.

### Taxonomy Chips

Taxonomy display should:

- Show human label first.
- Group by facet: Curriculum, Concept, Method, Task, Form.
- Keep raw IDs muted and secondary.
- Wrap gracefully with `overflow-wrap: anywhere`.
- Avoid large raw IDs in tables unless in collapsed details.
- Use "group" labels for parent nodes and "assignable" labels for selectable leaves.

### Calibration and Generation States

Blueprint generation should use a consistent state model:

- Needs taxonomy
- Needs evidence
- Needs calibration
- Calibration failed
- Generation ready
- Generated drafts sent to Review

Generate buttons should not appear visually available when generation readiness is false.

### Review Queue States

Review pages should make the publishing contract obvious:

- Draft-only until approved.
- Bulk publish should remain explicit.
- Failed/blocked items need readable reasons.
- Selection and bulk action controls should stay visible but not crowd every card.

## 4. Page-by-Page Recommendations

### Admin Shell and Dashboard

Current confusion:

- Sidebar is flat and crowded.
- No active nav state.
- Dashboard copy still says "Foundation skeleton".
- Demo seed action appears high on the dashboard, which can distract from real workflows.

Primary should be:

- Operational overview: pending drafts, AI imports, blueprint reviews, published questions, setup blockers.

Secondary/collapsed:

- Demo seed data and diagnostics.

Recommended layout:

- Grouped sidebar.
- Dashboard KPI strip.
- "Continue work" cards for Review Drafts, AI Parsing, Blueprint Library.
- Advanced tools section below.

Implementation risk: Low to medium. Layout-only, but nav changes need route smoke coverage.

### Blueprint Workspace

Current confusion:

- One component handles overview, review, library, history, sources, folders, lifecycle, calibration, versions, and generation.
- Cards are dense and action-heavy.
- Debug details exist but still appear close to primary workflows.
- Folder management, approved library, calibration, and generation compete for attention.

Primary should be:

- For Review view: approve/reject/needs evidence.
- For Library view: organize, calibrate, generate when ready.
- For Sources view: store review actions from AI imports.

Secondary/collapsed:

- Split/merge/replace versioning tools.
- Debug details, raw evidence, cluster IDs.
- Folder management forms, except active folder filter.

Recommended layout:

- Keep existing subroutes.
- Use a stable workspace shell: summary header, tabs, optional folder sidebar, main list, selected item detail.
- Make state-specific next action the first visible control.
- Make quality blockers a readable checklist.
- Keep generation safety copy visible but calm.

Implementation risk: Medium to high. Visual changes are easy to overreach into lifecycle behavior. Keep ADMIN-UI3 presentational.

### Review Drafts

Current confusion:

- Bulk controls, filtering, draft cards, AI metadata, taxonomy editing, readiness, and publish/delete actions share the same long page.
- The page is powerful but dense for a teacher reviewing generated/imported drafts.

Primary should be:

- Review a draft, fix blockers, publish or keep draft.

Secondary/collapsed:

- AI import metadata, asset placeholder details, technical import reasons.
- Bulk delete.

Recommended layout:

- Sticky or repeated review action bar.
- Draft cards with readiness status, taxonomy state, content preview, and primary review actions.
- Batch filter summary at top when arriving from AI PDF or blueprint generation.

Implementation risk: Medium. Publishing behavior must not change.

### Admin Questions

Current confusion:

- Create question, search/filter, taxonomy filters, bulk update, table rows, edit links, and delete controls all appear on one page.
- Taxonomy filter picker can be large and visually dominate the question list.

Primary should be:

- Find, inspect, and edit existing questions.

Secondary/collapsed:

- Create question form.
- Advanced taxonomy exclude filters.
- Bulk status/delete actions.

Recommended layout:

- Header with primary "Create question" button that opens a collapsed panel/drawer.
- Compact filter bar with advanced filters collapsed.
- Table or list with stable columns and row action menu.
- Keep taxonomy chips grouped and compact.

Implementation risk: Medium. Must preserve taxonomy search, pagination, bulk updates, and edit query-param behavior.

### AI PDF Import

Current confusion:

- Upload, provider setup, source list, extraction controls, status dashboard, warnings, chunk details, blueprint handoff, and retry all live together.
- The AI PDF dashboard is much improved but still reads as a control dashboard rather than an import workflow.

Primary should be:

- Upload source, choose mode/provider, start import/observation, then review output.

Secondary/collapsed:

- Chunk technical details.
- Raw warnings.
- Figure review details unless action is needed.
- Debug provider/status internals.

Recommended layout:

- Step-based workflow section: Source, Provider, Mode, Run, Review.
- Recent imports as compact list.
- Selected batch detail panel.
- Blueprint Observation completion should route clearly to Blueprint Library.
- Keep failed chunk reason concise and safe.

Implementation risk: Medium. Do not alter AI parsing state machine or provider routing.

### Import Tools

Current confusion:

- Manual JSON import is the default `/admin/imports` body, while the page also acts as an import hub.
- Recent import batches show raw summary JSON.
- Package and bulk asset imports have useful but long instructional text.

Primary should be:

- Choose the correct import method.

Secondary/collapsed:

- Manual JSON import panel.
- Recent raw technical summaries.
- Filename matching examples.

Recommended layout:

- Import hub first.
- Method cards with "best for" copy.
- Put Manual JSON Import behind its own section or route emphasis.
- Replace raw batch summary with concise counts/status and collapsed details.

Implementation risk: Low to medium.

### Taxonomy

Current confusion:

- Create taxonomy node, browse/search, detached nodes, pending approvals, and delete subtree controls are all visible.
- Raw IDs appear prominently in the tree.
- Delete subtree is visually close to browsing.

Primary should be:

- Browse/search official taxonomy and review pending taxonomy actions.

Secondary/collapsed:

- Create node.
- Detached nodes.
- Delete subtree.

Recommended layout:

- Search and tree as primary.
- "Manage taxonomy structure" advanced section.
- Delete subtree behind explicit danger area.
- Label parent nodes as browse-only/group nodes and assignable leaves clearly.

Implementation risk: Medium because taxonomy actions are destructive.

### Videos

Current confusion:

- Video CRUD, linked question taxonomy filters, create form, table, edit forms, and delete controls share the page.
- Video taxonomy is inherited through linked questions, which needs clearer explanation.

Primary should be:

- Find and maintain video/question bindings.

Secondary/collapsed:

- Create video.
- Advanced taxonomy filters.
- Row edit details.

Recommended layout:

- Filter bar.
- Video table/list.
- Create/Edit forms in disclosure or drawer.
- Keep "Official taxonomy tags" visible but compact.

Implementation risk: Low to medium.

### Practice and Public Question Bank

Current confusion:

- Public/student pages use a more polished "student" visual style than many admin pages.
- Practice has progressive loading and a focused shell, while admin pages still look more utilitarian.

Primary should be:

- Preserve student flow and avoid pulling admin density into public routes.

Recommended layout:

- Do not redesign student pages in admin UI PRs except to maintain nav consistency.
- Admin Practice Frameworks should be grouped under Practice.

Implementation risk: Low for IA only.

### AI Settings and Users

Current confusion:

- These are super-admin operational routes and should not compete with content workflows.

Primary should be:

- Provider configuration and user role management.

Recommended layout:

- Keep in Settings group.
- Maintain secret-safe messages and no raw encrypted values.

Implementation risk: Low if layout-only.

## 5. Staged Implementation Plan

### ADMIN-UI1: Admin Shell, Navigation, Page Header, Spacing

Goal:

- Establish grouped admin navigation and shared page header rhythm.

Likely files:

- `src/app/admin/layout.tsx`
- `src/app/admin/page.tsx`
- optional `src/components/admin/admin-page-shell.tsx`
- optional `src/components/admin/admin-page-header.tsx`

Allowed changes:

- Group sidebar links.
- Add active nav state if a client or pathname-safe pattern is chosen.
- Add consistent page width, gutters, and mobile behavior.
- Update dashboard copy away from "Foundation skeleton".

Not allowed:

- Remove routes.
- Change authorization.
- Change workflow behavior.

Risk level: Medium.

Tests needed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/route-smoke.mjs`
- `node scripts/security-smoke.mjs`

Behavior that must not change:

- Admin/super-admin route guards.
- Super-admin-only visibility for AI Settings and Users.

### ADMIN-UI2: Shared UI Components

Goal:

- Add reusable admin visual primitives before page-specific polish.

Likely files:

- `src/components/admin/admin-section-card.tsx`
- `src/components/admin/admin-status-badge.tsx`
- `src/components/admin/admin-empty-state.tsx`
- `src/components/admin/admin-action-group.tsx`
- `src/components/admin/admin-debug-details.tsx`

Allowed changes:

- Add primitives.
- Replace small local patterns where safe.
- Define status label mapping.

Not allowed:

- Change publish/import/generation actions.
- Change data loading.

Risk level: Low to medium.

Tests needed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/route-smoke.mjs`

Behavior that must not change:

- Status values persisted in DB.
- Any server action contracts.

### ADMIN-UI3: Blueprint Workspace Visual Polish

Goal:

- Make Blueprint Library readable and workflow-first.

Likely files:

- `src/components/blueprints/blueprint-workspace.tsx`
- `src/app/admin/blueprints/*`
- `src/components/tags/taxonomy-tag-chips.tsx`
- `src/components/tags/taxonomy-tag-tree-picker.tsx`
- `scripts/route-smoke.mjs`

Allowed changes:

- Improve card hierarchy.
- Separate folder panel from main content.
- Collapse debug/edit/version details by default.
- Improve quality blocker and generation readiness display.

Not allowed:

- Change approval gates.
- Change generation behavior.
- Change calibration behavior.
- Change AI parsing handoff behavior.

Risk level: High.

Tests needed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/route-smoke.mjs`
- `node scripts/security-smoke.mjs`
- blueprint-specific route smoke assertions.

Behavior that must not change:

- No auto-publish.
- Generated questions remain Review Drafts only.
- Archived/trash lifecycle semantics.

### ADMIN-UI4: Review Drafts and Question Bank Visual Polish

Goal:

- Make review and question management easier to scan and safer to act on.

Likely files:

- `src/app/admin/review/page.tsx`
- `src/app/admin/questions/page.tsx`
- `src/components/draft-review-card.tsx`
- `src/components/question-editor/*`
- `src/components/tags/*`

Allowed changes:

- Better filter layout.
- Clearer readiness state.
- Collapsed create/advanced filters.
- Better bulk action placement.

Not allowed:

- Change publish/delete semantics.
- Change taxonomy assignment validation.
- Change question status values.

Risk level: Medium to high.

Tests needed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/route-smoke.mjs`
- `node scripts/security-smoke.mjs`
- `node scripts/batch-import-smoke.mjs`

Behavior that must not change:

- Draft-only review flow.
- Bulk publish/delete confirmations and permissions.

### ADMIN-UI5: Import Tools Visual Polish

Goal:

- Clarify import method selection and make AI PDF status less diagnostic by default.

Likely files:

- `src/app/admin/imports/page.tsx`
- `src/app/admin/imports/pdf/page.tsx`
- `src/components/ai-pdf-import-panel.tsx`
- `src/components/ai-pdf-dashboard/*`
- `src/components/batch-import-json-panel.tsx`
- `src/components/package-import-panel.tsx`
- `src/components/bulk-asset-upload-panel*`

Allowed changes:

- Import hub layout.
- Concise recent batch summaries.
- Better AI PDF stepper/status hierarchy.
- Collapsed raw warnings and technical details.

Not allowed:

- Change provider routing.
- Change source PDF storage.
- Change batch import validation.
- Change draft creation behavior.

Risk level: Medium.

Tests needed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/batch-import-smoke.mjs`
- package/bulk asset smoke scripts.

Behavior that must not change:

- No raw provider output or secrets.
- AI PDF output remains draft-only.
- Blueprint observation remains observation-only unless later workflow explicitly changes.

### ADMIN-UI6: Responsive and Final Polish

Goal:

- Make admin pages usable on tablet/narrow desktop and safe on mobile.

Likely files:

- Admin layout and shared components.
- Page-specific components with overflow issues.

Allowed changes:

- Responsive grids.
- Sticky action bars where useful.
- Table-to-card fallbacks where needed.
- Better skeleton/empty states.

Not allowed:

- Broad rewrites.
- Route removal.
- Business logic changes.

Risk level: Medium.

Tests needed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/route-smoke.mjs`
- `npm.cmd run perf:budget`
- manual visual QA at desktop, tablet, narrow viewport.

Behavior that must not change:

- Existing admin routes and workflow contracts.

## Files Reviewed

Representative files inspected:

- `src/app/admin/layout.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/questions/page.tsx`
- `src/app/admin/review/page.tsx`
- `src/app/admin/imports/page.tsx`
- `src/app/admin/imports/pdf/page.tsx`
- `src/app/admin/imports/assets/page.tsx`
- `src/app/admin/tags/page.tsx`
- `src/app/admin/videos/page.tsx`
- `src/app/admin/blueprints/page.tsx`
- `src/app/admin/blueprints/review/page.tsx`
- `src/app/admin/blueprints/library/page.tsx`
- `src/app/admin/blueprints/history/page.tsx`
- `src/app/admin/blueprints/sources/page.tsx`
- `src/components/blueprints/blueprint-workspace.tsx`
- `src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx`
- `src/components/tags/taxonomy-tag-chips.tsx`
- `src/components/tags/taxonomy-tag-tree-picker.tsx`
- `src/app/questions/page.tsx`
- `src/app/videos/page.tsx`
- `src/app/practice/page.tsx`

## ADMIN-UI0 Guardrails

Do not change in UI cleanup PRs unless explicitly approved:

- Database schema.
- Provider/API behavior.
- AI Parsing state machine.
- Blueprint approval, calibration, or generation logic.
- Review Draft publish behavior.
- Question generation behavior.
- Auto-publish rules.
- Route availability.
- Official taxonomy architecture.
- `/admin/ai-settings` behavior.
- Secrets, `.env.local`, `.codex_tmp/`, or `deliverables/`.

## Validation Plan

ADMIN-UI0 should remain documentation-only. Required validation for this PR:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run perf:budget`

For later visual implementation PRs, add manual screenshots for:

- `/admin`
- `/admin/questions`
- `/admin/review`
- `/admin/imports/pdf`
- `/admin/blueprints`
- `/admin/tags`
- `/admin/videos`

## Commands Run

ADMIN-UI0 validation completed on branch `codex/admin-ui-ux-audit`:

- `npm.cmd run lint` - passed
- `npm.cmd run build` - passed
- `node scripts/security-smoke.mjs` - passed
- `node scripts/route-smoke.mjs` - passed
- `npm.cmd run perf:budget` - passed

The optional `ui-ux-pro-max` local search helper was not used because this installed skill exposes `scripts` as a pointer file rather than a directly runnable local script directory in this environment. The audit uses the loaded skill checklist directly.
