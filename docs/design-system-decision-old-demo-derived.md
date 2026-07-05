# Design System Decision: Old-demo-derived Direction

Date: 2026-07-05

## Final Selected Direction

EduStruct's selected design direction is:

```text
Old competition demo evolved into a bank-first teacher workspace.
```

The old demo is the product-specific visual source of truth for teacher-side
surfaces. The final system should feel like a private question-bank operating
workspace with source review, package generation, assignment boundaries, and
evidence return.

## Why This Won

The old demo style won over the generic big-tech exploration because it already
felt like EduStruct:

- It had a coherent product skin instead of borrowed enterprise styling.
- The pale sky/slate wash, translucent white panels, slate typography, compact
  badges, and soft shadows repeated across flows.
- It made imports, review, framework/package preview, practice, and evidence
  feel connected.
- It was polished without becoming a generic blue-white AI SaaS dashboard.
- It gave review, source, bank, and delivery states clear visual identity.

Big-company systems remain useful as references for accessibility, table
behavior, keyboard interaction, and density. They are implementation references,
not the visual source of truth.

## Keep From The Old Demo

- Soft pale sky/slate background wash.
- Warm white or translucent white work surfaces.
- Sticky translucent header with compact product navigation.
- Slate/ink headings and slate-muted body text.
- Sky/blue primary actions.
- Rounded-lg panels, light borders, rings, and soft long shadows.
- Compact semantic status badges.
- Main workbench plus right rail layouts.
- Teacher Studio landing polish.
- Course Builder hub and package/framework preview structure.
- Teacher-scoped AI PDF/import workbench patterns.
- Private generated exam-style question review.
- Source lineage and evidence/report loop concepts.

## Do Not Reuse

- Classroom-first framing as the teacher starting point.
- Course Builder as a bypass around Review Drafts and banks.
- Auto-approve or fake publish flows.
- Presentation-only demo pages as normal product routes.
- Wearable/fatigue UI as a normal MVP surface.
- Student practice cards as the teacher default surface.
- Admin-as-teacher shortcuts.
- Route/demo labels without product ownership boundaries.

## No Dark Green Decision

Dark green must not be used as the main sidebar, brand base, or teacher primary
color unless the user explicitly reopens that direction later.

Green is reserved for approved/safe states. Amber handles review, warning, and
source-check gates. Sky/blue/blue-indigo carries primary teacher actions.

## Role Visual Split

Teacher:

- Old-demo-derived bank-first workbench.
- Source/review/bank registry and delivery boundary surfaces.
- Calm, academic, polished, and operational.

Student:

- Keep the current calm focused study cockpit direction.
- Left session rail, center practice work, right study state/evidence.
- Slightly more energetic than teacher, but still in the same sky/slate brand
  family.
- No teacher bank browsing through classroom membership.

Admin:

- Governance/system workspace.
- Provider settings, global taxonomy, public/global bank governance, support,
  and audit/review tooling.
- Visually separate from normal teacher flows and never used as teacher product
  validation.

## Impact On Next Implementation PRs

Future teacher UI work should start with Banks / Library and preserve this
sequence:

```text
Create or join bank
-> import/pull/review/organize questions
-> create classroom/course
-> assign selected approved bank content
-> student practices
-> evidence returns
```

Implementation PRs should:

- Use `DESIGN.md` as the design-system source before changing teacher UI.
- Build Teacher Studio around a question bank registry, not classroom cards.
- Make Bank Detail the primary teacher operating surface.
- Treat Review Drafts as a teacher QA workbench.
- Scope imports to banks and source lineage.
- Reframe Course Builder as a package generator into Review Drafts/banks.
- Show assignment-only student visibility on delivery surfaces.
- Keep public/global bank movement behind review gates.
- Avoid runtime shortcuts that only add routes without bank ownership, review,
  visibility, and role boundaries.

## Screenshots And Demos Referenced

The old-demo extraction docs were not present on updated `main`; `docs/design-demos`
was missing when this decision was written. The decision still follows the
selected direction from the task and read-only inspection of the prior
`codex/old-demo-ui-style-extraction` branch.

Referenced old-demo extraction materials from that branch:

- `old-demo-ui-style-inventory.md`
- `edustruct-competition-derived-design-direction.md`
- `README.md`

That extraction referenced three generated static PNG demos:

- `teacher-studio-old-demo-bank-first.png`
- `bank-detail-old-demo-style.png`
- `review-workbench-old-demo-style.png`

No runtime app code, `src/`, migrations, SQL, Supabase data, provider
configuration, or real routes are changed by this decision doc.
