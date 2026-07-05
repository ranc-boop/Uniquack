# EduStruct Design System

## Source Of Truth

EduStruct is an old competition demo-derived bank-first learning workspace.

The product is a Private Multimodal Mastery Engine. Its UI must protect this
workflow:

```text
Private/owned materials
-> AI Parsing
-> Review Drafts
-> Question Bank / Library
-> Assignment
-> Practice Evidence
-> Teacher insight
```

The old competition demo is the visual source of truth because it already felt
like an EduStruct product: soft pale sky/slate background wash, translucent
white work surfaces, compact sky badges, slate typography, rounded-lg panels,
semantic statuses, source-aware workbenches, and controlled review/delivery
boundaries.

Big-company systems can inform accessibility, table density, keyboard behavior,
and component discipline. They are not the EduStruct visual target.

## Product Visual Identity

### Teacher

Teacher UI should feel academic enough for real instruction, but polished like
the old competition demo. It is a source/review/bank workbench, not a dark-green
institutional portal and not a generic blue-white AI SaaS dashboard.

The first teacher mental model is:

```text
Banks / Library
-> Imports and Review Drafts
-> Approved bank questions/packages
-> Classrooms and assignments
-> Evidence
```

Teacher pages must make bank ownership, source lineage, review status, and
assignment visibility visible near the action.

### Student

Student UI keeps the current calm, focused study cockpit direction. This design
system does not redesign student surfaces in this PR.

Student pages may be slightly more energetic than teacher pages, but they must
stay in the same brand family: clear slate text, sky/blue actions, calm panels,
and evidence-oriented progress. Students see assigned work, practice, mistakes,
and progress. They do not browse teacher banks by joining a classroom.

### Admin

Admin UI is a governance and system workspace. It can use denser navigation and
more neutral system surfaces than teacher pages, but it must remain visually
separate from the normal teacher flow. Admin owns provider settings, global
taxonomy, public/global bank governance, support, and audit/review tooling.

Admin screens must not be treated as teacher validation.

## Color System

Use token intent first. Final CSS variables can map to these names later.

| Token intent | Recommended treatment | Use |
| --- | --- | --- |
| `background.app` | Pale slate/sky wash, near `#F8FAFC`, with optional subtle radial or linear sky tint | Logged-in app background |
| `surface.hero` | Warm white or white at about 80-90% opacity, light border, backdrop blur | Teacher Studio and bank summary panels |
| `surface.workbench` | White at about 95% opacity, slate border/ring, soft long shadow | Main tables, review workbenches, bank detail panels |
| `surface.soft` | Sky-50/60 or very pale blue tint with sky-100 border | Guidance, summaries, source hints |
| `surface.muted` | Slate-50/70 with visible border | Empty states, nested row groups, low-emphasis areas |
| `text.heading` | Slate/ink, roughly slate-950 or slate-900 | Page titles, bank names, panel headings |
| `text.body` | Slate-600 or slate-700 | Body copy, descriptions, guidance |
| `text.meta` | Slate-500 or slate-400 | IDs, timestamps, source details, helper text |
| `action.primary` | Sky/blue/blue-indigo, commonly sky-600, blue-600, hover sky-700/blue-700 | Primary teacher actions |
| `action.focus` | Sky ring or blue ring, visible against white surfaces | Keyboard focus and selected states |
| `border.default` | Slate-200 or slate-100 | Standard panel and table dividers |
| `border.brand-soft` | Sky-100 or sky-200 | Soft guidance panels and active filters |

Semantic colors:

- Amber means review, warning, source check, or gate required.
- Emerald/green means approved or safe only.
- Rose/red means reject, destructive action, or error.
- Violet/purple means shared or collaboration.
- Cyan/sky means info, bank, focus, or pull-to-bank movement.
- Public/global can use amber or a neutral badge. It must not become the
  dominant brand color.

Dark green must not be used as the main sidebar, brand base, or teacher primary
color unless the user explicitly reopens that direction later.

## Typography

Use the current app/system sans stack. The old demo's strength came from clear
system typography, not a novelty font.

- H1: strong, compact, slate/ink, roughly 30-40px on desktop. It should feel
  serious and product-specific, not cartoonish or poster-heavy.
- Page subtitles: 14-16px, slate-muted, comfortable line height.
- Section headers: semibold or bold, 16-20px, close to the work they label.
- Labels: compact, 11-12px when needed. Uppercase is allowed for eyebrows and
  table labels, but not for long workflow copy.
- Tables: calm and legible. Header labels can be small and semibold; row text
  should stay readable and wrap when needed.
- Numbers: can use stronger weight for counts and progress, but must not become
  oversized marketing stats inside the logged-in app.
- IDs and technical references: monospace or muted metadata, never the primary
  label when a human title/source exists.

## Layout System

### App Shell

- Sticky translucent header, white/85 to white/90, light bottom border, backdrop
  blur, compact product mark, and role-aware navigation.
- Main work area uses a generous max width, commonly 92rem to 108rem, with
  responsive gutters.
- Logged-in app pages use work surfaces, not huge marketing heroes.
- Page rhythm should stay airy at the section level and compact inside tables,
  queues, and workbench rows.

### Teacher Shell

Teacher pages use a bank-first shell:

```text
Sticky header
-> workspace summary / hero panel
-> registry or workbench panel
-> right-side review/source/action rail when helpful
-> delivery layer panels below
```

On desktop, bank detail and review pages can use a main panel plus right rail.
On mobile, right rails stack below the main workbench and primary actions remain
reachable without horizontal scroll.

### Delivery Layer

Classrooms and assignments sit below banks in the visual hierarchy. They are
roster and delivery surfaces, not the source of content ownership.

Assignments are delivery events from approved bank items. Copy must reinforce
that assignments expose selected approved items, not the full bank.

## Panel System

| Panel | Use case | Visual treatment | Do not use for |
| --- | --- | --- | --- |
| Hero panel | Page-level orientation: Teacher Studio, bank detail, review workbench summary | White/80-90, rounded-lg, light slate/sky border, subtle blur, slate heading, short body, one primary CTA | Marketing copy, oversized feature tours, or unrelated cards |
| Workbench panel | Primary operating surface: bank registry, question table, review editor, import queue | White/95, rounded-lg, visible border/ring, soft long shadow, structured header and rows | Decorative dashboards or nested cards inside cards |
| Soft guidance panel | Helpful next step, source hint, import summary, bank boundary explanation | Sky-50/60 or pale blue, sky-100 border, small icon, concise copy | Critical warnings, destructive states, or dense data |
| Review gate panel | Safety boundary before approval, assignment, public submission, or publish | Amber-50 style fill, amber border, clear gate label, required action, no celebratory tone | Success messages or primary navigation |
| Source lineage panel | Source material, import batch, review item, excerpt, provenance trail | White or slate-50 row stack, muted metadata, source title first, raw IDs secondary | Hiding ownership details or replacing review controls |
| Delivery layer panel | Classrooms, assignments, evidence, package delivery options below bank content | White/95 or slate-50, lower visual priority than bank workbench, sky primary only for valid approved-content actions | Content creation source of truth |
| Side rail panel | Right-side actions and state: import, pull, members, review status, assign from bank | Sticky on desktop, stacked on mobile, compact white panels with badges and clear hierarchy | Primary page content or long-form tables |

Panels should use rounded-lg rather than oversized pill/card shapes. Use soft
depth, light borders, and repeated structure instead of decorative gradients.

## Badge And Status System

Badges are compact, rounded-full or small rounded pills, bordered, and
semantically colored. They communicate product state; they do not replace
workflow copy or review gates.

| Badge | Semantic color | Meaning |
| --- | --- | --- |
| Private | Slate or sky-neutral | Teacher/bank members only |
| Shared | Violet | Collaborative bank scope |
| Organization | Indigo or neutral | Organization-scoped ownership |
| Public | Amber or neutral | Governed public/global scope |
| Owner | Slate/sky | Can manage bank and members |
| Editor | Sky or violet | Can edit bank content |
| Viewer | Slate | Read-only bank member |
| Draft | Slate | Not ready for assignment |
| In Review | Amber | Awaiting human review |
| Needs Source Check | Amber | Source or provenance must be checked |
| Approved | Emerald | Reviewed and usable |
| Published | Emerald with restraint | Published only after the relevant review gate |
| Assigned | Sky/blue | Included in a delivery event |
| Assignment-only | Cyan or neutral | Student visibility is limited to assigned items |
| Pull to Bank | Cyan/sky | Copy/reference approved public content into a bank |
| Review Gate | Amber | Action is blocked until review is completed |

Copy rules:

- Keep badge labels short and human-readable.
- Use product terms, not raw enum names.
- Never imply AI output is ready for students before approval.
- Use `Approved` for teacher-usable content and `Published` only when the
  relevant public or assignment visibility step has actually happened.
- Place ownership and visibility badges close to bank names, question titles,
  source rows, and assignment actions.
- Pair color with text. Do not rely on color alone.

## Teacher Page Patterns

### `/teacher` Teacher Studio

Teacher Studio starts with Banks / Library, not Classrooms.

Required structure:

- Hero panel labeled as a bank-first teacher workspace.
- Primary CTA: create a question bank.
- Secondary CTA: join bank by code.
- Main workbench: Question bank registry with ownership, visibility, role,
  question count, review count, source activity, and next action.
- Right-side panels: Review Drafts needing attention, recent imports, source
  checks, or bank collaboration.
- Delivery layer below: Classrooms, Assignments, Course Builder, Evidence.

The first interactive object should be a bank row or bank action.

### `/teacher/banks`

Banks page is the teacher's content registry. Use a workbench table/list hybrid
with filters for Private, Shared, Organization, Public pulls, Needs Review, and
Recently Updated.

Each row should show bank name, visibility, role, owner/member signal, question
count, review status, recent source/import activity, and a clear open/manage
action. Raw IDs stay in secondary metadata.

### `/teacher/banks/[bankId]`

Bank Detail is the core teacher operating surface.

Required structure:

- Hero/title panel for the selected bank.
- Visibility and role badges beside the bank name.
- Source lineage and share/member hints near bank controls.
- Main question database with compact rows and status/source columns.
- Filters for Approved, Draft, In Review, Needs Source Check, Imported, Pulled,
  and Assigned.
- Right rail for Import Material, Pull to Bank, Review Drafts, Members/Share,
  Assign from Bank, and Submit to Public Review.
- Safety copy: `AI drafts stay private until reviewed.`
- Safety copy: `Assignments expose selected approved items, not the full bank.`

### `/teacher/review`

Review Drafts should feel like teacher QA, not AI generation.

Use a three-zone workbench when space allows:

- Left queue: draft title, source name, target bank, status, and urgency.
- Center panel: selected question, source excerpt, reviewer notes, answer,
  taxonomy, and checklist.
- Right rail: target bank, visibility, assignment boundary, source lineage, and
  review actions.

Primary action: `Approve to Bank`.

Secondary actions: `Needs Source Check`, `Save Draft`, `Reject`.

No unreviewed draft can be assigned to students.

### `/teacher/imports`

Imports are bank-scoped source material flows:

```text
Teacher bank
-> Import material
-> AI Parsing
-> Review Drafts
-> Approved bank questions
```

The page should show target bank first, source file/title second, parsing state,
draft count, source lineage, and next review action. It must not present import
as a direct assignment or public publishing action.

### `/teacher/course-builder`

Course Builder is a package generator that feeds banks and Review Drafts.

It may keep the old demo's framework/package preview polish, but the data flow
is:

```text
Course/source material
-> blueprint or package plan
-> generated reviewable questions/package items
-> Review Drafts
-> bank package
-> optional assignment from approved bank items
```

Course Builder must not bypass Review Draft approval, bank ownership, or
assignment safety gates.

### Assignment From Bank

Assignment creation starts from approved bank content:

```text
Choose bank/package
-> select approved questions
-> choose classroom/students
-> set due date/instructions
-> publish assignment
```

Assignment pages should show source bank/package, selected item count, review
status, classroom/roster target, and assignment-only student visibility.

Classrooms are delivery and roster layers. Assignments are delivery events.

## Student Page Pattern

Student pages preserve the calm focused study cockpit:

- Left session rail for assigned work, session navigation, or progress.
- Center practice work area with the active question/task.
- Right study state/evidence panel for hints, mistakes, mastery, and next step.
- Clear next action.
- Less AI-internal wording. Prefer learning and assignment language.
- No teacher bank browsing through classroom membership.

Student UI can use more active progress states and practice feedback than
teacher UI, but it should not import colorful student-card language into teacher
workbenches.

## Component Rules

### Buttons

- Primary: sky/blue fill, white text, rounded-lg, 40-44px minimum height, one
  clear primary action per surface.
- Secondary: white or transparent surface, slate/blue text, light border.
- Destructive: rose/red treatment, separated from normal primary actions.
- Disabled: visibly muted and semantically disabled.
- Icon buttons need accessible labels and at least a 44px interactive target.

### Table Rows

- Use human labels first: bank name, question title, source title, assignment
  name.
- Put raw IDs, hashes, and route-like strings in muted metadata.
- Include visibility/review/source badges in predictable columns.
- Row hover can use sky-50/70. It must not shift layout.
- Long source names and IDs wrap or move into secondary details.

### Cards

- Cards are for repeated items, compact summaries, modals, and genuinely framed
  tools.
- Do not put UI cards inside other cards.
- Do not turn whole page sections into floating decorative cards when a band or
  workbench layout is clearer.

### Empty States

Every empty state answers:

- what happened
- why it matters
- next action

Examples:

- `No questions in this bank yet. Import source material or pull approved public
  questions into this bank.`
- `No Review Drafts ready. Run a bank-scoped import or create a manual draft
  first.`
- `This assignment has no selected bank questions yet. Choose approved questions
  from a bank.`

### Safety Callouts

Use amber review gate panels for unreviewed AI output, source-check needs,
public submission, and assignment boundaries. Copy should be direct:

- `Review required before assignment.`
- `AI drafts stay private until reviewed.`
- `Assignments expose selected approved items, not the full bank.`
- `Public submission requires review.`

### Source Lineage Rows

Source lineage rows should show source title, source type, import batch/draft
relationship, reviewer state, and timestamps. Preserve fields such as
`source_review_item_id` where relevant, but keep them visually secondary.

### Action Rails

Action rails group contextual actions for the current bank, draft, import, or
assignment. They should be compact, sticky on desktop when useful, and stacked
after primary content on mobile.

### Review Queues

Review queues should prioritize teacher decisions:

- needs source check
- in review
- draft
- approved
- rejected/error

Queue items should show target bank, source, status, and next action. Do not
make the AI system the hero of the page.

## Accessibility And Interaction

- Maintain readable contrast on pale and translucent surfaces.
- Use semantic headings and predictable focus order.
- Keep keyboard focus rings visible.
- Do not rely on hover only.
- Preserve 44px interactive targets for important controls.
- Respect reduced motion. Micro-interactions should be subtle, about 150-300ms,
  and should not cause layout shift.
- Avoid horizontal overflow on mobile. Tables need responsive stacking,
  wrapping, or condensed columns.

## Anti-patterns

Avoid:

- generic blue-white AI SaaS hero
- deep green/black/yellow teacher palette
- dark green as teacher primary, brand base, or main sidebar
- generic academic beige portal as the main style
- heavy poster typography
- route-only hidden teacher flows
- classroom-first Teacher Studio
- admin-as-teacher UI
- fake AI magic illustration
- colorful student-style UI on teacher surfaces
- wearable/fatigue normal MVP UI
- auto-publish language
- unreviewed AI draft assignment
- public push without review gate
- raw IDs as primary labels
- presentation-only demo pages in the normal logged-in product
