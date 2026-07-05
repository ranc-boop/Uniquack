# Bank-first Product PRD

Date: 2026-07-05

## Executive Summary

EduStruct should move from a classroom-first runtime shape to a bank-first product architecture.

The teacher's primary workspace is the Question Bank / Library. Classrooms and assignments deliver selected bank content to students. AI Parsing and Review Drafts feed reviewed content into banks. Practice evidence returns to teachers after students work on assignments.

## Problem With Current Classroom-first Flow

Current runtime makes the classroom the teacher entry point. That creates the wrong product mental model:

- teacher starts by creating a class instead of owning content
- assignment creation pulls from global published questions first
- teacher-private imports do not clearly land in a teacher bank
- Course Builder can look like an assignment shortcut instead of a package generator
- students joining a class could be confused with content access

The product needs a clear content source of truth before delivery.

## Target User Workflows

### Teacher Workflow

1. Teacher creates or joins a Question Bank.
2. Teacher imports private materials or pulls approved public questions.
3. AI Parsing creates Review Drafts when import is used.
4. Teacher reviews and approves drafts into a bank.
5. Teacher organizes bank content.
6. Teacher creates a classroom or chooses an existing class.
7. Teacher assigns selected bank content.
8. Student practice creates evidence.
9. Teacher uses evidence to plan next work.

### Student Workflow

1. Student joins a classroom.
2. Student opens My Work.
3. Student sees assigned items only.
4. Student starts Practice from an assignment.
5. Student receives feedback, hints, and mistake review.
6. Student progress returns to the teacher.

Students do not browse the teacher's full bank by joining a classroom.

### Admin Workflow

1. Admin manages platform, taxonomy, provider gateway, and public/global bank governance.
2. Admin supports users and reviews public contributions.
3. Admin does not act as the normal teacher workspace.

## Bank Creation And Sharing

Teachers can create banks with a visibility scope:

- private
- shared
- organization
- public/global, admin governed

Teachers can share banks through invite or share code.

Bank roles:

- owner
- editor
- viewer

Share codes are for bank collaboration. Classroom join codes are for student roster membership.

## Bank Import And Review

Teacher import flow:

```text
Teacher bank
-> Import material
-> AI Parsing
-> Review Drafts
-> Approve/edit/reject
-> Bank questions
```

Rules:

- no AI auto-publish
- no unreviewed AI draft assigned to students
- source lineage preserved
- taxonomy uses active runtime `taxonomy_*` source of truth

## Public Pull And Private Push

Public pull:

```text
Public/global bank
-> copy or reference approved questions
-> teacher private/shared bank
```

Private push:

```text
Teacher/shared bank question
-> submit to public review
-> admin review
-> public/global bank
```

No ordinary teacher action directly publishes to public.

## Assignment From Bank

Assignment creation should start from bank content:

```text
Choose bank/package
-> select approved questions
-> choose classroom/students
-> set due date/instructions
-> publish assignment
```

Assignments expose selected items only.

## Practice Evidence

Practice consumes assigned questions and produces evidence:

- session started
- attempts
- correctness
- hints
- mistakes
- completion
- mastery signals

Evidence should connect to assignment, student, classroom, and source bank item where practical.

## Course Builder As Bank / Package Generator

Course Builder should generate reusable package or bank material first:

```text
Course material
-> blueprint/package plan
-> generated/reviewable questions
-> Review Drafts
-> bank package
-> optional assignment
```

Course Builder should not bypass bank/review gates.

## Non-goals

This PRD does not propose:

- migration changes in the guardrails PR
- AI provider changes
- direct public publish by teachers
- automatic assignment from raw AI output
- wearable/fatigue UI as a normal MVP surface
- replacing Practice Agent
- restoring old demo branches wholesale

## MVP Acceptance Criteria

- teacher can create a bank
- teacher can join a bank by code
- teacher can import material into a bank
- Review Drafts approve into a bank
- teacher can pull public questions into a bank
- teacher can submit bank questions to public review
- teacher can create class after bank exists
- teacher can assign from bank questions
- student sees assigned work but not full teacher bank
- practice evidence returns to teacher

