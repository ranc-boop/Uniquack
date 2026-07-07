# EduStruct Product Context

## Product Identity

EduStruct is a **Private Multimodal Mastery Engine**.

It is not a generic LMS, an ordinary AI tutor, or a question generator only.

EduStruct turns owned instructional materials into reviewed, source-linked question banks, assignments, practice evidence, and teacher insight.

## Core Loop

```text
Private/owned materials
-> AI Parsing
-> Review Drafts
-> Bank / Library
-> Assignment
-> Practice
-> Evidence
-> Teacher insight
```

## Bank-first Architecture

Question Bank / Library is the teacher and user content workspace.

Banks can be:

- private
- shared
- organization
- public/global

Banks can be joined by share code or invite.

Banks can have members and roles.

Classrooms and assignments should use bank content; they should not define content ownership.

## Universal Library Direction

Library is universal, not teacher-only.

Teachers, students, organizations, and official EduStruct accounts can own, use,
share, pull, fork, and improve Libraries when their capabilities and policies
allow it.

Teacher and Student differ by workspace and capabilities, not by whether they
can own Libraries:

- Teacher workspace focuses on AI Parsing, Review Drafts, formal classroom
  delivery, assignments, and evidence.
- Student workspace focuses on My Work, Practice, Mistakes, Study Library,
  Study Groups, public Library discovery, and self-study feedback.

Classroom remains a teacher/school-managed roster and delivery layer. Study
Group is the student/peer self-study collaboration layer.

Public Library content is discoverable and pull/copy/forkable. Verified Library
content is a separate high-trust layer that requires EduStruct review.

## Roles

### Admin

Admin manages platform and organization operations:

- provider gateway and AI settings
- global taxonomy
- public/global bank governance
- user and organization support
- system review and audit tools

### Teacher

Teacher manages instructional content and delivery:

- private/shared banks
- owned imports
- Review Drafts
- bank questions
- classrooms
- assignments
- progress and evidence

### Student

Student completes assigned learning:

- joined classrooms
- My Work
- Practice
- mistakes and progress
- personal Study Library and Study Groups where policy/entitlement allows

Students do not gain teacher private Library access by joining a classroom.

## Content Objects

### Question Bank / Library

A scoped collection of approved or reviewable questions and packages.

### Bank Member

A user with a role in a bank: owner, editor, or viewer.

### Bank Share Code

A revocable join token for a bank. It is for teacher collaboration, not student assignment access.

### Bank Question

A bank-scoped reference to a canonical question with ownership, visibility, source, and review metadata.

### Source Material

Teacher-owned or organization-owned source input, such as PDF, image, package, or manual content.

### Import Batch

AI Parsing or batch import run that creates reviewable outputs from source material.

### Review Draft

A private review item created from AI import, batch import, blueprint generation, or manual draft flow.

### Public / Global Question

A reviewed question available to a wider public or organization scope.

### Private / Shared Question

A reviewed question usable inside a teacher-owned or collaborative bank.

### Assignment

A delivery event that exposes selected approved bank content to a classroom or student group.

### Assignment Item

One question, package item, or practice unit inside an assignment.

### Practice Session

The student learning engine instance for assigned or self-directed practice.

### Evidence / Progress

Attempt, mastery, mistake, timing, completion, and review data that returns to the teacher.

### Course Builder Package

A planned or generated learning package that should enter a bank/library before assignment.

## Ownership And Visibility

Classroom membership does not grant bank access.

Assignment exposes selected question items only.

Study Group membership does not grant classroom or teacher private Library
access.

Public bank pull copies or references approved public material into a private/shared bank.

Private/shared push or promote to public requires review.

Approval means usable; visibility decides who can see or assign it.

## Preserved Foundations

Keep these systems:

- clean Supabase baseline
- provider gateway
- AI PDF import
- Review Drafts
- source lineage
- `taxonomy_*` runtime source of truth
- Question Bank base
- Practice base
- classroom schema
- assignment/progress/evidence schema

## Known Gaps

- current `/teacher` is not bank-first
- teacher navigation and visible shell are incomplete
- teacher private bank is incomplete
- teacher-private import/review into bank is incomplete
- assignment flow is too global published-bank based
- Course Builder needs rebuild as bank/package generator
- Student assignment Practice "Key is not allowed" needs targeted repro
- question asset visibility policy review is pending

