# Teacher Route Map

This route map proposes the target teacher information architecture. Status values mean:

- `existing`: route exists now and broadly matches the target
- `placeholder`: route exists or can exist as shell, but needs real workflow/content
- `needs rebuild`: route exists but the product model or IA is wrong/incomplete
- `future`: route does not exist yet

## Teacher Routes

| Route | Purpose | Primary user | Data source | Write operations | Not allowed / non-goals | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| `/teacher` | Teacher Dashboard / Studio hub for banks, imports, drafts, classrooms, publish, and evidence | Teacher | question banks, review drafts, imports, classrooms, assignments, evidence | quick create/join bank, navigate to review/publish | not student practice shell, not classroom-first homepage | needs rebuild |
| `/teacher/banks` | Question Bank Library | Teacher | `question_banks`, `bank_members`, counts from bank questions/review/imports | create bank, join by code, open bank | no student bank browsing | existing |
| `/teacher/banks/new` | Create private/shared/organization bank | Teacher | org profile and bank policies | create bank and owner membership | no public/global direct publish | existing |
| `/teacher/banks/join` | Join a shared bank by code | Teacher | bank share code hash/RPC | join as allowed role | not classroom join; not student access | existing |
| `/teacher/banks/[bankId]` | Bank detail overview | Teacher bank member | bank, bank questions, review/import counts, members | manage bank if owner/editor, start import, create assignment | not Practice, not classroom content ownership | existing |
| `/teacher/banks/[bankId]/questions` | Questions inside bank | Teacher bank member | bank questions, canonical questions, taxonomy assignments | organize/manage approved bank questions | no unreviewed draft assignment | existing |
| `/teacher/banks/[bankId]/imports` | Bank-scoped imports | Teacher owner/editor | import batches, source material, target bank | start/import source to Review Drafts | no auto-publish, no global review bypass | existing |
| `/teacher/banks/[bankId]/review` | Bank-scoped Review Drafts | Teacher owner/editor | review batches/items targeting bank | approve/edit/reject to bank | no direct student assignment before approval | existing |
| `/teacher/banks/[bankId]/blueprints` | Blueprints generated from or linked to this bank | Teacher bank member | blueprint library rows, bank/blueprint links | link/import blueprint to bank later | no Blueprint bypass around Review Drafts | future |
| `/teacher/banks/[bankId]/members` | Members and share | Teacher owner/editor/viewer depending role | `bank_members`, share codes | create/revoke code, update/remove members | no student roster management here | existing |
| `/teacher/banks/[bankId]/assignments/new` | Create assignment from selected bank questions | Teacher owner/editor with class rights | bank questions, classrooms, assignments | create draft/assigned assignment from bank | no global publish, no full-bank student access | existing |
| `/teacher/ai-parsing` | Top-level AI Parsing/import entry | Teacher | source material, provider profiles, target banks, import batches | upload/import to selected bank(s) | no direct assignment, no auto-publish, no provider setup | future |
| `/teacher/blueprints` | Blueprint Library | Teacher | question blueprint tables, folders, links, taxonomy | browse/create/import/link private/shared/public blueprints | not admin-only governance, no direct student delivery | future |
| `/teacher/blueprints/[blueprintId]` | Blueprint detail | Teacher with access | blueprint entry, source examples, taxonomy, generation readiness, links | edit/link/import/generate reviewable drafts later | no raw provider execution bypass, no auto-publish | future |
| `/teacher/classrooms` | Class card grid | Teacher | classrooms, memberships, assignment summary, evidence summary | create class, open class | not content source of truth | existing |
| `/teacher/classrooms/[classroomId]` | Class overview | Teacher managing class | classroom, roster summary, assignments, activity | edit class, open sections | no bank browsing by students | needs rebuild |
| `/teacher/classrooms/[classroomId]/people` | Roster | Teacher managing class | classroom memberships, join code | invite/join code, remove/kick student, roles later | not bank membership; no content ownership change | future |
| `/teacher/classrooms/[classroomId]/assignments` | Class assignment history | Teacher managing class | assignments, assignment items, completion evidence | create/manage assignments | source selection should also exist in top-level Publish | existing |
| `/teacher/classrooms/[classroomId]/assignments/new` | Class-scoped assignment creation | Teacher managing class | classrooms, bank content, assignment helpers | create assignment | should not be the only publish workflow | existing |
| `/teacher/classrooms/[classroomId]/assignments/[assignmentId]` | Assignment detail | Teacher managing class | assignment, items, student progress | edit/status actions later | no full bank exposure to students | existing |
| `/teacher/classrooms/[classroomId]/analytics` | Class analytics / feedback | Teacher managing class | practice evidence, assignment progress, taxonomy mastery | publish feedback later | no medical/wearable demo surface | future |
| `/teacher/classrooms/[classroomId]/blueprints` | Linked blueprints for the class | Teacher managing class | blueprint links, assignments, class context | link/unlink planning assets later | no direct student delivery | future |
| `/teacher/classrooms/[classroomId]/settings` | Class settings | Teacher managing class | classroom row and policies | edit class, archive later | no bank ownership controls | future |
| `/teacher/publish` | Top-level publish/assign center | Teacher | banks, blueprints, packages, classrooms, assignments | save draft, assign now, schedule later | no raw AI draft assignment, no auto-publish | future |
| `/teacher/progress` | Cross-class progress and feedback | Teacher | assignments, practice sessions, attempts, taxonomy evidence | feedback draft/publish later | not student practice view | future |
| `/teacher/course-builder` | Package/framework generator compatibility surface | Teacher | source material, blueprints/packages, Review Drafts | generate reviewable package/drafts later | no review bypass, no direct assignment shortcut | needs rebuild |

## Student Route Separation

Student routes remain receivers of assigned work and practice, not bank managers.

| Route | Purpose | Separation rule |
| --- | --- | --- |
| `/student` | Student dashboard | assigned work and learning state only |
| `/student/work` | My Work list | assignment visibility only |
| `/student/work/[id]` | Assignment detail | selected assignment items only |
| `/student/classrooms` | Joined classes | roster membership, not bank browsing |
| `/student/classrooms/join` | Join class by code | classroom join code, not bank share code |
| `/practice` and practice APIs | Practice engine | consumes assigned/self-directed allowed questions and returns evidence |

## Admin Route Separation

Admin routes remain governance/system tools, not teacher validation.

| Route group | Purpose | Separation rule |
| --- | --- | --- |
| `/admin` | System dashboard | governance and support |
| `/admin/ai-settings` | Provider settings | admin-only provider gateway |
| `/admin/tags` and taxonomy tools | Global taxonomy governance | teachers submit requests; admins approve taxonomy |
| `/admin/review` | System/global review support | not the normal teacher bank review path |
| `/admin/blueprints` | Blueprint governance/admin operations | teacher-facing Blueprint Library should move to `/teacher/blueprints` |
| `/admin/imports/*` | Admin import/support tooling | teacher import belongs under teacher/bank-scoped AI Parsing |
| `/admin/questions` | Admin/system question support | teacher question operations belong in banks |
| `/admin/users` | User support | admin-only |

## Route Model Notes

- Teacher Dashboard should surface banks first, then imports/review, then delivery.
- Classroom detail should feel like a real class product, but content still comes from banks/publish.
- Blueprint needs teacher routes so it stops feeling like an admin-only system tool.
- Publish needs a top-level route because assignment can target multiple classes or later individual students.
- Existing classroom assignment routes can stay as contextual shortcuts, but should not be the only path.
