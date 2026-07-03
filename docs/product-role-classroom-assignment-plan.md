# Product Role, Classroom, and Assignment Architecture Plan

Date: 2026-07-03

## Executive Summary

The product now has a working clean Supabase baseline, AI Parsing to Review Drafts, Review Draft approval, Question Bank publishing, Practice Agent evidence, and Blueprint Library foundations. The next product gap is not another AI feature. It is the missing role, classroom, and assignment architecture that connects those systems into a real teacher/student workflow.

The current app still mixes admin and teacher responsibilities, exposes practice as a general page instead of a student work queue, and lacks first-class classrooms, assignments, rosters, and private teacher question banks. Before building more demo surfaces, the product should standardize three runtime roles:

- **Admin** manages the platform, organization, taxonomy, provider settings, and public/shared resources.
- **Teacher** owns classrooms, private imports, reviewed materials, assignments, and class-level learning evidence.
- **Student** joins classrooms, completes assigned work, practices recommended questions, and reviews mistakes.

The recommended next implementation PR is **Native Classroom Foundation**: add first-class classroom, membership, join-code, and RLS contracts before adding assignment flows.

## Current State

The current main branch has these relevant foundations:

- Clean Supabase migrations for organizations, profiles, provider gateway, taxonomy, AI parsing, Review Drafts, Question Bank, Blueprint Engine, Practice Agent evidence, and course-builder-adjacent tables.
- Admin routes for AI PDF import, Review Drafts, Question Bank, taxonomy, Blueprint Library, provider settings, users, videos, and practice frameworks.
- Public/student-facing routes for Question Bank, question detail, Practice, Mistakes, and Videos.
- AI PDF import can create Review Drafts, and approved drafts can publish into the Question Bank.
- Practice can consume approved questions and write practice/session evidence.

Major missing product contracts:

- No first-class `teacher` runtime role in the app role model.
- No classroom, roster, join-code, or teacher/student enrollment model.
- No assignment entity that connects questions, practice, due dates, and student progress.
- No dedicated **My Work** student page that organizes assigned work.
- No clear privacy boundary between admin support views and teacher-private class/question data.
- No native public/private bank split for teacher-owned question sets.

## Product Problem To Solve

The competition/demo story wants flows like:

1. Teacher uploads course material.
2. AI Parsing creates reviewed draft questions or blueprint observations.
3. Teacher approves or edits material.
4. Teacher assigns selected questions/practice to a classroom.
5. Student sees the assignment in My Work.
6. Student practices, gets feedback, and creates evidence.
7. Teacher sees class progress and adapts the next stage.

Right now the app has many of the technical pieces, but not the product relationship layer that makes the flow coherent. Without classrooms and assignments, the product risks looking like an admin tool rather than a learning platform.

## Role Model

### Admin

Admin is a platform or school operations role, not the default teacher experience.

Admin should manage:

- Organization setup and user accounts.
- Global/system taxonomy.
- Public/shared question bank governance.
- AI provider settings and provider gateway configuration.
- AI import/review tooling where organization policy allows.
- Blueprint Library governance for shared/system blueprints.
- Audit, safety, and support views.

Admin should not casually become the owner of all classroom activity. Access to private teacher or student work should be limited to explicit support/audit paths and recorded in audit logs where possible.

### Teacher

Teacher is the primary product author/operator role.

Teacher should manage:

- Their classrooms.
- Student roster and join codes.
- Private imports and course materials.
- Review Drafts created from their imports.
- Private and shared question bank collections.
- Assignments and practice sequences.
- Class progress, mistakes, mastery, and evidence.
- Course Builder flows that turn reviewed material into assigned learning paths.

Teacher should not need `/admin` as the main daily workspace.

### Student

Student is the learning role.

Student should see:

- My Work: assigned work, due dates, status, and next recommended action.
- Practice entry points from assignments.
- Mistakes and review queue.
- Progress and feedback.
- Class enrollment state.

Student should not see:

- AI provider settings.
- Review Drafts before teacher approval.
- Private teacher banks.
- Other students' work.
- Admin-only taxonomy/provider/import controls.

## Classroom Model

Classrooms should be native product objects, not inferred from organization membership.

Conceptual entities:

- `classrooms`
- `classroom_members`
- `classroom_join_codes`
- Optional future `classroom_invites`

Classroom fields should support:

- Organization ownership.
- Teacher ownership.
- Name, section, subject, term, description.
- Active/archived status.
- Created/updated timestamps.

Membership should support:

- Teacher owner.
- Co-teacher or teaching assistant later.
- Student member.
- Joined/removed timestamps.
- Status: invited, active, removed, archived.

Join codes should support:

- Short human-entered code.
- Expiration and rotation.
- Max-use or classroom-only constraints if needed.
- Storage as a hash or otherwise protected token where practical.

RLS principles:

- Teachers can read/manage classrooms they own or co-teach.
- Students can read classrooms they belong to.
- Students cannot enumerate all classrooms.
- Admin can manage organization-level classroom setup through audited support paths.

## Assignment Model

Assignments connect teacher intent to student work and practice evidence.

Conceptual entities:

- `assignments`
- `assignment_items`
- `student_assignment_progress`
- `assignment_practice_sessions`

Assignment fields should support:

- Classroom ownership.
- Teacher creator.
- Title, instructions, due date, publish status.
- Source kind: manual, AI import, blueprint, course builder, practice framework.
- Visibility: draft, published, archived.

Assignment items should support:

- Approved question IDs.
- Practice framework IDs.
- Blueprint-derived generated draft references after approval.
- Ordering.
- Point or completion metadata later.

Student progress should support:

- Not started, in progress, submitted/completed, needs review.
- Last activity timestamp.
- Score/mastery/evidence summary where appropriate.
- Link to practice sessions and attempts.

Important rule: assignments should reference approved/reviewed learning material. AI output should still pass through Review Drafts or Blueprint Library approval before becoming assigned student work.

## Student My Work

**My Work** should be the student's main learning dashboard.

Recommended routes:

- `/my-work`
- `/my-work/[assignmentId]`
- Existing `/practice` remains the practice engine.
- Existing `/mistakes` remains mistake review.

My Work should show:

- Assigned work by classroom.
- Due dates and status.
- Recommended next action.
- Continue practice button.
- Mistake review prompt when relevant.
- Completed work history.

Difference from Practice:

- My Work answers: "What should I do now?"
- Practice answers: "Run the learning engine for this question/session."

## Teacher Workspace

Teacher should eventually have a route family separate from admin operations.

Recommended routes:

- `/teacher`
- `/teacher/classes`
- `/teacher/classes/[classroomId]`
- `/teacher/classes/[classroomId]/assignments`
- `/teacher/classes/[classroomId]/students`
- `/teacher/classes/[classroomId]/progress`
- `/teacher/imports`
- `/teacher/review`
- `/teacher/question-bank`
- `/teacher/course-builder`

Teacher workflow:

1. Create classroom.
2. Invite students with join code.
3. Upload course material or select existing questions.
4. Review/approve AI-created drafts.
5. Build an assignment from approved questions/materials.
6. Publish assignment to class.
7. Monitor student progress and mistakes.
8. Use evidence to build the next assignment.

## Admin Boundaries

Admin should keep platform-level controls:

- User and organization management.
- AI provider gateway and provider profiles.
- System taxonomy and global content governance.
- Public bank governance.
- Audit and support.
- Global safety/smoke diagnostics.

Admin should not be the primary teacher workspace. Private teacher classroom data should be protected by RLS and product UI boundaries.

Suggested admin support access pattern:

- Admin can inspect private class data only through explicit support tools.
- Support access should be read-only where possible.
- Support actions should be auditable.
- Provider secrets and encrypted key fields remain inaccessible to client UI.

## Public And Private Question Banks

The app needs a clear bank ownership model.

Recommended bank scopes:

- **System/public**: curated global questions visible broadly.
- **Organization/shared**: school-owned shared bank.
- **Teacher-private**: teacher's own reviewed questions and imports.
- **Classroom-assigned**: questions currently assigned to a class.

Question visibility should not be inferred only from whether a question is approved. Approval means usable; visibility decides who can see/use it.

Recommended fields or equivalent contracts:

- `owner_scope`: system, organization, teacher, classroom, private.
- `owner_id`: nullable depending on scope.
- `visibility`: private, shared, public, archived.
- `source_metadata`: AI import, batch import, manual, blueprint generation.
- `review_status`: draft/reviewed/approved/rejected where applicable.

Review Drafts should preserve teacher/import ownership so approved questions land in the correct bank scope by default.

## Google Login And Google Classroom

Google integration should be phased, not required for the first classroom MVP.

### Phase A: Google Login

Add Google OAuth account linking so teachers and students can sign in with Google. This does not require Google Classroom.

### Phase B: Google Classroom Roster Import

Allow a teacher to connect Google Classroom and import:

- Courses as classrooms.
- Students as classroom memberships.
- Course names/sections.

The app should still keep native classrooms as the internal source of truth.

### Phase C: Google Coursework Sync

Optional later integration:

- Push assignments to Google Classroom.
- Pull submission/completion state.
- Link back to EduStruct practice.

This should be future work after native assignments are stable.

## Enterprise Extension

The same architecture can later support enterprise training, but it should not distort the school MVP.

Possible enterprise mapping:

- Organization becomes company/workspace.
- Classroom becomes team/cohort.
- Teacher becomes manager/trainer.
- Student becomes employee/learner.
- Assignment becomes training task.
- Question bank becomes knowledge or assessment bank.
- Course Builder becomes training-plan builder.

Enterprise should be a future product track with its own copy and permissions. The school MVP should remain focused on teachers, classrooms, assignments, practice, and review.

## Wearable And State-Aware Boundary

Wearable/state-aware ideas should not become a core app dependency right now.

Recommended boundary:

- Do not show Apple Watch or fatigue dashboards in the core teacher/student MVP.
- Do not claim medical fatigue diagnosis.
- Do not build student assignment flow around wearable data.
- Keep state-aware signals as optional future practice evidence.
- If used in demos, present it as learning-state support, not health monitoring.

The durable product value is teacher-reviewed AI material, assignments, practice evidence, and adaptive next steps.

## MVP Implementation Phases

### Phase 1: Native Classroom Foundation

Add classroom, membership, and join-code contracts.

Deliver:

- Teacher can create classroom.
- Student can join with code.
- Teacher can see roster.
- RLS protects classroom membership.

### Phase 2: Student My Work

Add student dashboard for assigned work.

Deliver:

- Student sees assigned work by classroom.
- Empty state is clear.
- Existing Practice can launch from My Work.

### Phase 3: Teacher Assignment Flow

Add assignments that reference approved questions.

Deliver:

- Teacher creates draft assignment.
- Teacher adds approved questions.
- Teacher publishes assignment to classroom.
- Student sees it in My Work.

### Phase 4: Practice Evidence Linkage

Connect practice sessions and attempts to assignments.

Deliver:

- Practice launched from assignment records assignment context.
- Student progress updates after attempts.
- Teacher sees completion and mistake summaries.

### Phase 5: Course Builder Assignment Bridge

Connect Course Builder outputs to assignments.

Deliver:

- Teacher can turn a generated course/practice framework into a draft assignment.
- Review gates remain intact.
- No auto-publish from AI.

### Phase 6: Google Login

Add Google OAuth as a sign-in option.

### Phase 7: Google Classroom Import

Add optional roster/course import after native classroom flows are proven.

### Phase 8: Enterprise Extension

Introduce enterprise-specific packaging, routes, and copy only after school workflows are stable.

## Schema And RLS Implications

Future schema should be additive and clean. Do not bend existing admin/import tables into classroom behavior.

Likely table groups:

- `classrooms`
- `classroom_members`
- `classroom_join_codes`
- `assignments`
- `assignment_items`
- `student_assignment_progress`
- `assignment_practice_sessions`
- Optional `question_bank_collections`
- Optional `question_bank_collection_items`
- Optional support/audit access table

RLS implications:

- Student can read only their memberships, assignments, and own progress.
- Teacher can read/manage classes and assignments they own or co-teach.
- Teacher can read progress for students in their classes.
- Teacher can use approved public/shared questions and their own private questions.
- Admin can manage global/system resources.
- Admin access to private teacher/student data should be explicit and auditable.

Review and publishing implications:

- AI Parsing still writes Review Drafts.
- Review Draft approval should choose or infer the target bank scope.
- Assignment publishing should require approved/reviewed question material.
- Student-visible content should never come directly from raw AI output.

## Productization PR Plan

Recommended next PR:

1. **Native Classroom Foundation**
   - Add classroom/member/join-code schema and RLS.
   - Add minimal teacher classroom UI.
   - Add student join flow.

Then:

2. **Student My Work Foundation**
   - Add My Work route and assignment empty states.
   - Keep Practice as the engine, not the dashboard.

3. **Teacher Assignment Foundation**
   - Add assignment schema and teacher assignment builder from approved questions.

4. **Assignment Practice Evidence**
   - Link practice sessions/attempts to assignment progress.

5. **AI Review To Teacher Bank**
   - Preserve teacher/import ownership through Review Draft approval.
   - Add private/shared/public bank selection.

6. **Course Builder Assignment Bridge**
   - Turn course-builder outputs into draft assignments.

7. **Google Login**
   - Add Google account sign-in/linking.

8. **Google Classroom Import**
   - Import rosters and classes into native classroom tables.

## Explicit Non-Goals

This plan does not propose:

- Rebuilding AI Parsing.
- Changing provider gateway behavior.
- Adding migrations in this docs-only PR.
- Adding Google Classroom immediately.
- Making wearable/fatigue UI part of the core MVP.
- Letting admins casually browse teacher-private data.
- Publishing AI-generated questions without review.
- Reintroducing legacy tags as primary product UI.
- Building enterprise workflows before the school MVP is stable.

## Decision

Build the native classroom and assignment layer next. Keep AI Parsing, Review Drafts, Blueprint Library, Question Bank, and Practice as engines that plug into that layer. This gives the product a clear daily workflow:

Teacher creates class and assigns reviewed material. Student opens My Work and practices. Practice evidence returns to the teacher. Course Builder and Blueprint Engine then help plan what comes next.
