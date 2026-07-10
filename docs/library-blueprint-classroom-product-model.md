# Library, Blueprint, Classroom Product Model

## Core Flow

```text
Owned material
-> AI Parsing
-> Review Drafts
-> Bank
-> Blueprint/package optional
-> Publish
-> Classroom/student target
-> My Work
-> Practice
-> Evidence
-> Teacher dashboard
```

This is the product spine. Every teacher-facing feature should fit this model or be explicitly marked as future/non-goal.

## 1. Question Bank As Repository

Question Bank is the teacher content repository.

Responsibilities:

- stores approved/reviewable question membership
- preserves source lineage
- scopes visibility: private, shared, organization, public/global
- supports members and roles
- supports import/review workflows
- acts as the source for assignments and packages

Question Bank is not:

- a classroom
- a practice page
- a student browsing area
- a direct public publishing shortcut

Relationships:

- a Bank can have many questions
- a Bank can have many imports
- a Bank can have many Review Drafts
- a Bank can have many Blueprints
- a Bank can produce assignments through Publish

## 2. Blueprint As Library / Package

Blueprint is a reusable assessment pattern asset.

Responsibilities:

- capture reusable question structure and generation constraints
- organize with folders and scopes
- reference source examples and taxonomy targets
- connect to banks and packages
- later generate reviewable draft questions

Blueprint is not:

- a direct student delivery mechanism
- a replacement for Review Drafts
- a personal tag system
- an auto-publish path

Relationships:

- a Blueprint can reference bank questions/packages
- a Blueprint can be generated from bank questions or AI Parsing observations
- a Blueprint can be imported into a bank as reviewable material
- a Blueprint can be linked to classrooms and assignments for planning context

## 3. Classroom As Delivery / Roster

Classroom is roster and delivery context.

Responsibilities:

- class identity and roster
- student join code and membership
- assignment list
- completion/progress views
- feedback and analytics
- linked planning assets

Classroom is not:

- content source of truth
- bank membership
- public publishing surface

Relationships:

- a Classroom can receive many published assignments
- a Classroom can have many students
- a Classroom can link to many Blueprints for planning
- a Classroom should not grant access to source banks

## 4. Publish As Distribution Workflow

Publish is the distribution workflow.

Responsibilities:

- choose source: bank, blueprint, package
- choose target: class, multiple classes, individual students later
- configure instructions, due date, schedule
- create draft or assigned assignment
- preserve assignment-only visibility

Publish is not:

- a bank editing surface
- a Review Draft approval shortcut
- a global public publishing mechanism

Relationships:

- Publish can target multiple classrooms
- Publish creates assignments
- Assignments expose selected items only
- Assignments preserve source bank/package lineage

## 5. Student My Work As Receiver

Student My Work is where delivery becomes student-facing.

Responsibilities:

- show assigned work
- show due state and completion
- open assignment detail
- launch Practice

Student My Work is not:

- a bank browser
- a teacher workspace
- a review/publish area

Relationships:

- My Work receives assignments
- assignment detail exposes selected items
- Practice starts from the assignment

## 6. Practice As Learning Engine

Practice is the learning engine.

Responsibilities:

- present assigned/self-directed allowed questions
- collect attempts
- provide hints/feedback/review
- generate evidence for teacher insight

Practice is not:

- a question bank
- a teacher import surface
- a classroom management surface

Relationships:

- Practice consumes assignment items
- Practice evidence links to student, assignment, question, taxonomy, and classroom
- Practice evidence returns to Progress / Feedback

## 7. Progress As Evidence Return

Progress / Feedback turns student work into teacher insight.

Responsibilities:

- assignment completion
- mastery/taxonomy signals
- mistake patterns
- attempt history
- recommendation/feedback drafting

Progress is not:

- public grading by default
- a replacement for teacher judgment
- a medical or fatigue diagnosis surface

Relationships:

- evidence links back to assignment
- assignment links back to bank question/source
- taxonomy provides comparable skill structure

## 8. Taxonomy As Global Governance Layer

Taxonomy is global EduStruct governance.

Responsibilities:

- provide active assignable tags/leaves
- support cross-bank comparability
- ground AI Parsing, Blueprint, Assignment, Practice, and Progress
- accept teacher requests through admin review later

Taxonomy is not:

- arbitrary user-created labels
- per-teacher tag chaos
- a visual region localization system

Future visual grounding, including LocateAnything-style localization, should identify source regions/evidence and help AI Parsing. It should not create uncontrolled tags.

## Relationship Summary

- Bank can have many questions.
- Bank can have many blueprints.
- Blueprint can reference bank questions/packages.
- Classroom can receive many published assignments.
- Publish can target multiple classrooms.
- Assignment exposes selected items only.
- Student practice evidence links back to assignment, question, taxonomy, and classroom.
- Taxonomy is global, not per user.

## Safety Boundaries

- AI Parsing creates Review Drafts.
- Review Draft approval is required before student assignment.
- Unreviewed AI output cannot be assigned.
- Classroom membership does not grant bank browsing.
- Private/shared bank content is private by default.
- Public/global movement requires review.
- Teacher and student shells remain separate.
