# Teacher Product IA Reconciliation Plan

## Executive Summary

Teacher product architecture is not only bank-first. The correct teacher workspace is:

```text
Teacher Dashboard
-> Question Bank / Library
-> AI Parsing
-> Blueprint Library
-> Classroom
-> Publish
-> Progress / Feedback
```

Question Banks remain the content source of truth. Blueprints are reusable planning assets. Classrooms are roster and delivery surfaces. Publish is the top-level distribution workflow. Progress / Feedback closes the loop from student practice evidence back to teacher planning.

This plan reconciles the bank-first guardrails, the old competition demo's teacher-studio rhythm, Google Classroom-style classroom organization, asset-library-style Bank and Blueprint browsing, global taxonomy governance, and strict teacher/student/admin workspace separation.

## Current Problems

- The teacher workspace still feels too close to the student/practice shell. Teacher should not be a student workspace with extra access-gated buttons.
- Classroom creation and classroom route issues exposed that the teacher workspace is still incomplete as a product surface.
- A classroom-first UI is not enough. Classrooms deliver content; they are not the teacher's content source of truth.
- The old competition demo had a more coherent teacher flow: source import, framework/package preview, review, reports, and evidence felt connected.
- The bank-first foundation exists, but IA must now cover Blueprint, Classroom, Publish, and Progress as first-class teacher modules.
- Blueprint currently leans admin/system-facing. It needs a teacher-facing library and asset workflow.
- Publish/assigning is still too hidden inside class or bank detail flows. It should be a top-level teacher workflow.
- Teacher visual/product structure should be separate from student practice and admin governance.

## Teacher Workspace Modules

### Teacher Dashboard

Purpose: the teacher studio hub.

The dashboard should orient a teacher around owned content, review gates, delivery, and evidence. It should show:

- recent banks
- drafts needing review
- recent imports
- classroom activity
- progress and feedback summaries
- quick links to create bank, import material, open Blueprint Library, publish assignment, and review evidence

The first mental model is old-demo-inspired Teacher Studio, but rebuilt around bank ownership and review safety.

### Question Bank

Purpose: teacher content source of truth.

Banks support private, shared, organization, and public/global scopes. The bank list should use a card/table hybrid so teachers can browse visually while still comparing counts, roles, review status, source activity, and assignment readiness.

Bank detail should show:

- questions
- taxonomy/knowledge points
- difficulty
- source lineage
- review status
- visibility and membership
- imports
- Review Drafts
- linked Blueprints
- assignment readiness

Question Bank is not Practice. It is a repository/library for curated content.

### AI Parsing

Purpose: turn owned materials into reviewable drafts.

AI Parsing should be a teacher tool that starts from source ownership and target bank selection. It can live at `/teacher/ai-parsing` and also be reachable from bank detail.

Rules:

- upload or select owned material
- choose target bank, later multiple banks
- produce Review Drafts
- no auto-publish
- preserve source lineage
- suggest existing global taxonomy tags only
- future NVIDIA LocateAnything or visual grounding helps source localization and evidence regions; it does not create uncontrolled user tags

### Blueprint

Purpose: first-class reusable assessment pattern library.

Blueprints should behave like library/package assets:

- private/shared/public scopes
- folders
- cards and detail pages
- generated from bank questions or source observations
- default private
- linked to banks, packages, classrooms, and assignments
- importable into a bank as reviewable material or package structure

Blueprint is not an assignment bypass. Blueprint output still flows through Review Drafts and bank approval before student delivery.

### Classroom

Purpose: roster and delivery layer.

Classroom should borrow the Google Classroom mental model without integrating with Google Classroom yet:

- class card grid
- class cover/identity
- roster/people
- assignment list
- completion rate
- recent activity
- linked blueprints
- analytics/feedback
- class settings

Classroom detail should have:

- Overview
- People
- Assignments
- Analytics / Feedback
- Linked Blueprints
- Settings

Classroom does not own content. It receives selected approved content through Publish / Assignment.

### Publish

Purpose: top-level distribution workflow.

Publish should not be hidden only inside one class. It should support:

- choose source: Question Bank, Blueprint, package
- choose target: one class, multiple classes, individual students later
- edit assignment or feedback details
- save draft
- assign now
- schedule later
- publish feedback later

Assignment is a delivery event. It exposes selected approved items, not a whole private bank.

### Progress / Feedback

Purpose: evidence return to teacher insight.

Progress / Feedback should work across classes and within a class. It should show:

- assignment completion
- taxonomy/mastery evidence
- mistake patterns
- practice attempts and recommendations
- source/bank lineage where useful
- feedback publishing later

Progress closes the loop:

```text
Assignment -> Practice -> Evidence -> Teacher planning
```

## Teacher vs Student vs Admin Split

### Teacher

Teacher workspace is content creation, curation, delivery, and evidence:

- private/shared banks
- imports
- Review Drafts
- bank questions
- Blueprint Library
- classrooms
- assignments/publish
- progress and feedback

Teacher pages should look like a source/review/bank workbench, not like student practice.

### Student

Student workspace is assigned work and practice:

- My Work
- Practice
- Mistakes
- Progress
- Classes

Students do not browse teacher banks because they joined a class. They see assignment-selected items only.

### Admin

Admin workspace is governance and system operations:

- users
- provider settings
- global taxonomy
- public/global bank governance
- support/audit/review tools

Admin pages must not be used as teacher product validation.

Teacher, Student, and Admin should not be one shell with different buttons. They need separate navigation, language, and workflows.

## Question Bank Product Model

Question Bank is the teacher repository.

### Library Views

Filters:

- Private
- Shared
- Organization
- Public
- Needs Review
- Recently Updated
- Assignment Ready

### Bank Cards

Each card should show:

- bank name
- scope/visibility
- teacher role
- owner/member signal
- question count
- review count
- recent source/import activity
- next action

### Bank Detail

Tabs/sections:

- Questions
- Imports
- Review Drafts
- Blueprints
- Members
- Sources
- Assignments
- Settings

Questions should show human labels first and raw IDs only as muted metadata. Rows should include taxonomy, difficulty, source lineage, review status, visibility, and assignment readiness.

### Public/Open Source Movement

Future public/open-source pull:

```text
Public/global bank -> pull/copy/reference -> teacher private/shared bank
```

Future private/shared push:

```text
Teacher/shared bank question -> public review -> approved global/public bank
```

No direct public publish without review.

## Blueprint Product Model

Blueprint is a reusable assessment pattern library.

Blueprints should support:

- folders
- cards
- private/shared/public scopes
- Blueprint detail
- generated from bank questions or AI Parsing observations
- imported into banks
- linked classrooms
- linked assignments

Default state is private. A Blueprint can later be shared, submitted for public review, or used to generate reviewable bank material.

Blueprint detail should show:

- title/status
- taxonomy targets
- pattern summary
- required elements
- answer/spec pattern
- distractor pattern where relevant
- originality constraints
- generation readiness
- source examples
- linked banks/classes/assignments

Blueprint should not directly deliver to students. It flows through bank/review/publish boundaries.

## Classroom Product Model

Classroom is roster and delivery, not content source of truth.

### Class Cards

The class grid should show:

- class name
- subject/period
- teacher identity
- student count
- active assignment count
- completion summary
- recent activity

### Class Detail

Tabs:

- Overview: summary, next due work, recent activity
- People: roster, join code, remove/kick student, roles
- Assignments: assigned and draft assignments
- Analytics / Feedback: completion, mastery, mistakes, recommendations
- Linked Blueprints: planning assets used for the class
- Settings: class identity and controls

The class page can offer actions to publish, but Publish remains available as a top-level center.

## Publish Product Model

Publish is `/teacher/publish`.

Workflow:

```text
Choose source
-> choose target
-> configure delivery
-> review assignment boundary
-> save draft / assign now / schedule later
```

Sources:

- Question Bank
- Blueprint
- package

Targets:

- one class
- multiple classes
- individual students later

States:

- draft
- assigned
- scheduled later
- feedback draft later
- feedback published later

Publish should always display assignment-only visibility and source lineage. It should never imply that students can browse the source bank.

## Taxonomy / Tag Governance

`taxonomy_*` remains the EduStruct-wide source of truth.

Rules:

- teachers and students use global EduStruct taxonomy
- teachers cannot create arbitrary personal runtime tags
- AI Parsing suggests existing tags
- Blueprint grounding uses existing active taxonomy leaves
- if a teacher needs a new tag, the teacher submits a taxonomy request
- admin reviews taxonomy requests
- approved tags enter the global taxonomy
- future LocateAnything / visual grounding helps source region localization and evidence, not uncontrolled tag creation

This keeps content comparable across banks, assignments, practice evidence, and reports.

## Old Demo Reconciliation

Keep conceptually:

- Teacher Studio landing
- Course Builder hub rhythm
- teacher-scoped imports
- package/framework preview
- private generated exam-style question review
- teacher report/evidence direction

Do not restore:

- wearable/fatigue UI as normal product
- presentation-only demo pages
- fake publish flows
- Course Builder as a review bypass
- classroom-first teacher entry

## Non-goals

- no Google Classroom integration yet
- no student bank browsing by default
- no wearable UI as normal MVP product
- no arbitrary user-created taxonomy tags
- no auto-publish
- no public push without review
- no Blueprint bypass around Review Drafts
- no direct student delivery from raw AI output
- no migration or runtime implementation in this planning task
