# Bank-first Domain Model

Date: 2026-07-05

This is an engineering-facing model. It does not define SQL yet.

## Entity Overview

### `question_banks`

Purpose: teacher, organization, shared, or public content workspace.

Key fields:

- `id`
- `organization_id`
- `owner_scope`: teacher, organization, system
- `owner_id`
- `visibility`: private, shared, organization, public, archived
- `name`
- `description`
- `created_by`
- timestamps

Ownership: teacher, organization, or system.

Visibility: private/shared/org/public.

Role permissions: owner manages; editor edits content; viewer reads.

RLS expectations: teachers see owned/member banks; admins see organization/system banks; anonymous sees none unless a future public read path is explicitly built.

Reuse/migration note: likely needs a new clean migration.

### `bank_members`

Purpose: membership and role contract for shared banks.

Key fields:

- `bank_id`
- `user_id`
- `role`: owner, editor, viewer
- `status`: active, invited, removed
- timestamps

Ownership: follows bank.

RLS expectations: owners manage members; members read their memberships; admins support through explicit support path.

Reuse/migration note: likely new table.

### `bank_share_codes`

Purpose: revocable teacher collaboration join codes.

Key fields:

- `bank_id`
- `code_hash`
- `created_by`
- `expires_at`
- `revoked_at`
- usage limits

Ownership: bank owner.

Visibility: raw code only shown at creation/display time; stored hash only.

RLS expectations: owner/editor can manage based on policy; no public enumeration.

Reuse/migration note: can mirror classroom join-code safety patterns.

### `bank_questions`

Purpose: bank-scoped question membership and visibility.

Key fields:

- `bank_id`
- `question_id`
- `source_kind`
- `source_review_item_id`
- `source_import_batch_id`
- `visibility`
- `review_status`
- `added_by`
- timestamps

Ownership: follows bank.

Visibility: bank members only, unless public bank.

RLS expectations: bank members read; owners/editors add/remove; students do not read bank contents through classroom membership.

Reuse/migration note: likely new join table referencing existing `questions`.

### `bank_sources` / `source_materials`

Purpose: bank-scoped source material used for import and provenance.

Key fields:

- `bank_id`
- `source_kind`
- `storage_ref`
- `title`
- `metadata`
- `created_by`

Ownership: teacher or bank.

Visibility: bank members with proper role.

RLS expectations: no student access by classroom membership.

Reuse/migration note: may reuse existing import/source tables if ownership can be scoped safely.

### Bank-scoped `review_drafts`

Purpose: reviewable AI/manual outputs targeted to a bank.

Key fields:

- existing Review Draft fields
- `target_bank_id`
- `source_material_id`
- `source_review_item_id`

Ownership: teacher/bank.

Visibility: bank owner/editor and authorized review roles.

RLS expectations: no assignment until approved.

Reuse/migration note: likely extends existing review tables with bank target fields.

### `questions`

Purpose: canonical question storage.

Key fields:

- question content
- taxonomy assignments
- source metadata
- review/publish status
- ownership fields where current schema supports them

Ownership: canonical record plus bank relationship.

Visibility: derived through bank relationships and public/global status.

Reuse/migration note: preserve existing table; avoid legacy tags.

### Public/global question relation

Purpose: approved public catalog membership.

Possible implementation:

- a public/system bank
- explicit `bank_questions` rows
- reviewed public contribution records

RLS expectations: public read only if product allows; mutation admin/review gated.

### Assignment source bank/package

Purpose: assignment lineage back to bank or package.

Key fields:

- `assignment_id`
- `source_bank_id`
- `source_package_id`
- `source_kind`

Reuse/migration note: existing `0024_assignment_source_metadata.sql` may support part of this.

### `assignment_items`

Purpose: selected question/package items delivered to students.

Key fields:

- `assignment_id`
- `question_id`
- `source_bank_question_id`
- order
- points/completion metadata

Visibility: assigned students can access selected items only.

### Practice evidence

Purpose: link student work to assignment, question, and teacher insight.

Key fields:

- session id
- assignment id
- student id
- question id
- attempt outcomes
- hints/mistakes/progress

Reuse/migration note: preserve existing Practice and assignment evidence foundations.

## Permission Matrix

| Actor | Private bank | Shared bank | Public bank | Assignment | Practice evidence |
| --- | --- | --- | --- | --- | --- |
| Admin | Support/governance only | Support/governance only | Manage/govern | Support/governance | Support/governance |
| Teacher owner | Full manage | Full manage | Submit/review if authorized | Create/manage | Read class evidence |
| Teacher editor | Edit content | Edit content | Submit if allowed | Create/manage if allowed | Read assigned class evidence |
| Teacher viewer | Read only | Read only | Read/pull | No manage unless separate class role | Read only if class role allows |
| Student assigned | No bank browse | No bank browse | Public read only if product allows | Read assigned items | Own evidence |
| Student bank viewer | Future only | Future only | Public read only if allowed | Assignment-limited | Own evidence |
| Anonymous | None | None | None by default | None | None |

## Lifecycle Diagrams

### PDF To Bank

```text
Teacher bank
-> Source material upload
-> AI Parsing
-> Review Drafts
-> teacher review
-> approved question
-> bank_questions row
```

### Public Pull To Bank

```text
Public/global bank question
-> teacher selects pull
-> private/shared bank copy or reference
-> provenance preserved
```

### Private Push To Public

```text
Private/shared bank question
-> submit to public review
-> admin/reviewer action
-> public/global bank membership
```

### Bank To Assignment

```text
Bank/package
-> selected approved items
-> assignment_items
-> classroom/student visibility
```

### Assignment To Practice Evidence

```text
Student My Work
-> Practice session
-> attempts and feedback
-> assignment progress
-> teacher insight
```

