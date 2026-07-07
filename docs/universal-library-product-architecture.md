# Universal Library Product Architecture

## 1. Executive Summary

EduStruct should evolve into:

```text
Universal Intelligent Learning Library
+ Teacher Delivery Workspace
+ Student Self-study Workspace
+ Admin Governance Workspace
```

The Library is universal. Teachers, students, organizations, and official EduStruct accounts can all own, use, share, copy, fork, and improve learning content.

Teacher and Student differ by workspace and capabilities, not by whether they can own libraries. A teacher workspace emphasizes delivery, review, classrooms, assignments, and evidence. A student workspace emphasizes self-study, practice, mistakes, Study Groups, and personal progress.

Admin remains a governance workspace for provider settings, taxonomy, verification, support, audit, and public/verified library review.

## 2. Universal Library Concept

The Universal Library is the shared content repository layer for EduStruct. It replaces the assumption that "Question Bank" is only a teacher object. The database may keep `question_banks` as the implementation name for now, but the product concept should become Library.

A Library can contain:

- questions
- blueprints
- packages
- source materials
- study sets
- mistake sets
- feedback notes
- review drafts

A Library can be owned by:

- a teacher
- a student
- an organization
- EduStruct or another official verified account

Library ownership controls content. Classroom ownership controls roster and delivery. Assignment ownership controls a delivery event. These should not collapse into one object.

## 3. Product Analogies

Use these products as conceptual references, not as exact UI or business-logic copies:

- GitHub repository / fork / pull request: public content can be copied or forked; improvements can be proposed upstream.
- Quizlet / Anki public study sets: users can discover, copy, and study shared content.
- Canvas item banks: shared learning items can have view/edit membership.
- Google Classroom: classrooms and assignments are teacher-controlled delivery layers, not the content repository itself.

EduStruct's version should remain review-gated, source-linked, taxonomy-grounded, and privacy-first.

## 4. Visibility Model

Use four primary visibility states:

| Visibility | Meaning |
| --- | --- |
| Private | Owner plus invited members only. |
| Shared | Invite/share-code access for collaborators. |
| Public | Discoverable and pull/copy/forkable by other users. |
| Verified | EduStruct-reviewed, high-trust public content. |

Rules:

- Public does not mean Verified.
- Verified requires platform governance and review.
- Teacher and student user content can become Public.
- Verified is a separate trust layer above Public.
- Private content must not appear in public/global search.
- Classroom membership does not grant Library access.
- Study Group membership does not grant classroom access.

## 5. Membership Roles

Keep Library membership simple:

| Role | Capability |
| --- | --- |
| Owner | Manage Library settings, members, share codes, visibility requests, and destructive lifecycle actions. |
| Editor | Add, edit, import, organize, and propose content inside the Library. |
| Viewer | Read Library content that membership grants but cannot mutate it. |

Avoid role explosion. Do not add roles such as `student_viewer`, `assigner`, `reviewer`, `school_observer`, or `taxonomy_editor` unless a later PR proves they are necessary.

Use capabilities and policy flags for product permissions instead of encoding every business distinction into membership roles.

## 6. Capability Model

Library membership controls access to content. Capabilities control what the user or plan can do with content.

Examples:

- `can_create_classroom`
- `can_publish_to_classroom`
- `can_use_ai_parsing`
- `can_create_study_group`
- `can_generate_self_feedback`
- `can_submit_to_verified_review`
- `can_view_class_progress`
- `can_manage_public_verification`
- `can_request_taxonomy_change`

This allows:

- a student to own a personal Library without being able to create classrooms;
- a teacher to use AI Parsing and classroom publish workflows;
- a school-managed student to receive assignments without having full consumer Study Group features;
- an admin to verify public content without becoming a member of every Library.

## 7. Pull / Fork / Push / Verify Model

Define four movement patterns:

| Action | Meaning |
| --- | --- |
| Pull / Copy | Copy a public item into your own Library. |
| Fork | Create a related Library or Study Set that preserves provenance but can diverge. |
| Push / Propose Improvement | Submit an improvement back to the upstream Library owner. |
| Submit To Verified Review | Ask platform governance to verify a public Library or item. |

Rules:

- A teacher can pull from a student's public Library.
- A student can pull from a teacher's public Library.
- Public pulled content keeps provenance.
- Forked content keeps lineage.
- Verified content requires review.
- Push/propose workflows should not mutate upstream content without owner approval.

## 8. Taxonomy Governance

`taxonomy_*` remains the global EduStruct source of truth.

Rules:

- Teachers and students cannot create arbitrary runtime taxonomy tags.
- AI Parsing suggests existing active taxonomy nodes.
- Blueprint grounding uses existing active assignable taxonomy leaves.
- New tag needs should become taxonomy requests.
- Admin/curriculum review approves or rejects taxonomy requests.
- Approved tags enter global taxonomy and become available to all relevant workspaces.
- Future LocateAnything-style tools help source localization and evidence regions; they do not create uncontrolled tags.

Taxonomy governance keeps Libraries comparable across public search, assignment delivery, practice evidence, and progress reports.

## 9. Safety Gates

Required safety gates:

- No AI auto-publish.
- No unreviewed draft to students.
- No Verified status without review.
- No classroom membership grants Library access.
- No Study Group membership grants teacher classroom access.
- No private content leakage into public/global search.
- No source material exposure to users who only received assignment items.
- No public push without owner or governance review.
- No arbitrary personal taxonomy as runtime truth.

## 10. Product Boundary Summary

| Layer | Purpose | Owner Examples | Student Access |
| --- | --- | --- | --- |
| Universal Library | Content repository and collaboration | teacher, student, organization, verified account | depends on visibility/membership |
| Teacher Workspace | Delivery and evidence workflow | teacher, school | teacher/admin only |
| Student Workspace | Self-study and assigned work | student | student |
| Classroom | Formal roster and assignment delivery | teacher/school | only assigned/joined class scope |
| Study Group | Peer self-study collaboration | student/peer group | group members |
| Admin | Governance and platform operations | admin/super admin | no normal student access |

The product should feel like a shared learning content platform with strong private ownership, not a teacher-only LMS and not an uncontrolled public content dump.
