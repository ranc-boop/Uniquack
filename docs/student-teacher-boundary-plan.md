# Student / Teacher Boundary Plan

## 1. Executive Summary

Teacher and Student both use the Universal Library layer.

Teacher is a delivery and evidence workspace. Student is a self-study and collaboration workspace.

The distinction is not "teachers can own Libraries, students cannot." The distinction is:

- what workspace the user is in;
- which capabilities the user has;
- what policy or entitlement applies;
- whether the action is formal school delivery or self-study collaboration.

## 2. Teacher Workspace

Teacher workspace modules:

- Dashboard
- Library
- AI Parsing
- Blueprint
- Classroom
- Publish
- Progress / Feedback

Teacher actions:

- create a Library
- import owned material
- review drafts
- approve items into a Library
- organize Blueprints
- publish selected Library content to classrooms
- analyze class and assignment evidence
- give feedback to assigned students

Teacher-only capabilities:

- classroom creation
- formal assignment publishing
- class progress analytics
- teacher feedback to assigned students
- managed roster actions such as removing a student from class
- AI Parsing for instructional source material when the plan allows it

Teacher does not own the universal content model. Teacher owns the formal delivery workflow.

## 3. Student Workspace

Student workspace modules:

- Dashboard
- My Work
- Practice
- Mistakes
- Study Library
- Study Groups
- Public Library
- Progress / Feedback

Student actions:

- pull/save public content
- create a personal Study Library
- create study sets
- save mistake sets
- practice independently
- generate self-study feedback when entitled
- share mistakes or notes
- join a Study Group
- collaborate on group study content

Student cannot by default:

- manage teacher classrooms
- see teacher private Libraries
- publish formal assignments
- see class-wide analytics
- create global taxonomy tags
- approve unreviewed AI drafts for classroom delivery
- bypass school policy on public browsing or Study Groups

## 4. Classroom vs Study Group

### Classroom

A Classroom is teacher/school-owned formal delivery.

Classroom includes:

- roster
- join code
- assignments
- due dates
- teacher feedback
- class progress evidence
- class analytics
- school policy

Classroom does not own content. It receives selected approved Library content through Publish / Assignment.

Joining a classroom does not grant source Library access.

### Study Group

A Study Group is student/peer-owned self-study collaboration.

Study Group includes:

- shared study sets
- shared mistake sets
- group practice
- explanation notes
- peer discussion
- group feedback
- optional teacher share later

Study Group does not create formal grades by default. It does not grant classroom management capabilities. It does not expose teacher private Libraries.

## 5. Feedback Model

Feedback should be scoped by context.

| Feedback Context | Created From | Default Visibility |
| --- | --- | --- |
| Assignment feedback | Teacher-assigned work and Practice evidence | Student and teacher according to class policy |
| Self-study feedback | Student independent Practice or mistakes | Private to student |
| Study-group feedback | Group practice, shared mistakes, or shared notes | Study Group members |
| Verified/public feedback | Official or reviewed explanation content | Public/Verified according to governance |

Assignment feedback:

- is tied to teacher-assigned work;
- can inform class progress;
- can be visible to teacher and student;
- must respect school policy.

Self-study feedback:

- is created by the student;
- is private by default;
- can be shared later to a Study Group or teacher if the product and policy allow.

Study-group feedback:

- is collaborative;
- should be visible only to group members unless explicitly shared outward;
- should not become formal school grading without teacher/school action.

Verified/public feedback:

- requires platform review;
- may become part of official content;
- should keep provenance and versioning.

## 6. Student Library Model

Student Library may contain:

- saved questions
- study sets
- mistake sets
- personal notes
- self-study feedback
- public pulls/forks
- group-shared items

Student UI should not call this a teacher bank. Use language such as:

- Study Library
- My Library
- Saved Sets
- Mistake Sets
- Public Library

The implementation may still reuse `question_banks` or Library tables under the hood during migration, but the product surface should not imply the student is inside a teacher bank.

## 7. Academic Integrity And Institution Policy

School-managed students may run in Student Classroom Lite mode.

Student Classroom Lite means:

- assigned work is available;
- basic practice is available;
- basic feedback is available;
- broad public browsing can be disabled;
- Study Groups can be disabled or limited;
- self-study feedback can be limited;
- personal import can be disabled;
- academic integrity controls can be stricter.

This lets schools use EduStruct for assigned learning without granting every consumer student feature.

## 8. Boundary Rules

- A Library can be teacher-owned, student-owned, organization-owned, or verified-account-owned.
- A Classroom is teacher/school delivery.
- A Study Group is peer/self-study collaboration.
- Assignment visibility is not Library membership.
- Study Group visibility is not classroom enrollment.
- Public Library does not mean Verified Library.
- Capabilities decide actions; Library membership decides content access.
- Role names should stay simple: Owner, Editor, Viewer.

## 9. Route Direction

Future route direction can look like:

| Workspace | Route Family | Purpose |
| --- | --- | --- |
| Teacher | `/teacher/library` or current `/teacher/banks` during transition | teacher Library operations |
| Teacher | `/teacher/classrooms` | formal delivery and roster |
| Teacher | `/teacher/publish` | assignment distribution |
| Student | `/student/library` | personal Study Library |
| Student | `/student/groups` | Study Groups |
| Student | `/student/work` | assigned work |
| Public | `/library` | public and verified discovery |
| Admin | `/admin/library` | verification and governance |

Do not rename routes until a deliberate migration plan exists.
