# Practice Library Scope And Completion Implementation

## Goal

Allow self-study Practice sessions to lock an authorized combination of the
public catalog and up to ten active member Libraries, rank questions from
server-side attempt evidence, and end safely when the selected scope is
exhausted or further practice has diminishing value.

## Non-goals

- This change does not expose every `visibility = public` Library.
- Assignment visibility does not grant browsing access to a teacher Library.
- Assignment Practice keeps its assignment-owned completion rules.
- This change does not publish Review Drafts or bypass existing approval gates.
- No hosted migration application is claimed by this implementation.

## Product workflow

The flow remains bank-first:

```text
Authorized Library membership
-> editable empty session source selection
-> first-round validation and immutable source snapshot
-> server-scoped question search
-> attempts and round evidence
-> final Practice report
```

The browser lists only the public-catalog special source and active Libraries
for which the current user has an active membership. Creating an empty
self-study conversation does not write or lock a source snapshot. The first
recommendation sends the selected identifiers to
`lock_practice_session_sources_for_round`, which serializes competing starts,
revalidates ownership, active Library status, membership, and the ten-Library
limit, then writes the immutable source snapshot. Assignment Practice remains
fixed by the assignment delivery event.

## Role and ownership boundaries

Viewer, Editor, and Owner memberships may practice from a Library. Removed
members and archived Libraries are excluded both when listing sources and on
every recommendation search. A permission withdrawal shrinks the effective
scope but does not erase completed rounds or attempts, because those records
are already-created student evidence.

Assignment sources are internal session sources. They are never returned by
the self-study source-list API and cannot upgrade assignment-only access into
Library browsing access.

## Candidate state and safety gates

`search_practice_questions_in_session` derives the effective scope entirely
from the session and current server-side permissions. It classifies the latest
attempt for each question as unseen, retry-needed, mastered, ungraded, or
deferred. Unseen questions rank first, then one eligible retry per question per
session. Mastered, ungraded, and deferred questions are counted for inventory
but are not normally recommended.

Library questions must remain active, undeleted, and assignment-ready. Review
Draft approval and publish lineage are unchanged; AI drafts are not made
eligible by this feature.

## Stable tools and dynamic policy

The recommendation request always sends the same four tool schemas, including
`finish_practice`. Dynamic availability is never embedded in those stable
descriptions. Append-only `tool_policy_notice` records are persisted only when
policy changes and are placed at the absolute end of the model context.

The server remains authoritative. It rejects a first-round finish call,
recomputes inventory and permissions, and can force completion after strict and
relaxed searches find no unseen or eligible retry questions. Assignment
Practice does not use this tool.

## Completion and recovery

The finalizer conditionally changes only an active session to completed. The
claim writes a `generating` marker so concurrent callers cannot start another
provider report. The winning caller streams a final report with tool choice
disabled, persists it to the session summary and session-review reflection,
then emits completion. Provider failure uses a deterministic evidence-based
report and never resumes the recommendation loop.

## Migration and rollback risk

Migration `0052_practice_library_scope_and_inventory.sql` is forward-only. It
adds one RLS-protected table and three RPCs, then backfills historical
self-study sessions to the public catalog and linked assignment sessions to
assignment sources. It does not edit or replay an old migration.

After operator application, the source-binding RPC reproduced PostgreSQL
`42702`: its unqualified `array_agg(bank_id)` could refer either to the query
column or the `RETURNS TABLE` output variable. Migration
`0053_practice_session_source_rpc_ambiguity_fix.sql` corrects this forward-only
by qualifying the deduplicated query column. `0052` remains unchanged.

Migration `0054_practice_source_scope_lock_on_first_round.sql` adds the explicit
lock timestamp and owner-checked first-round RPC. Existing self-study sessions
with round evidence are backfilled as locked; round-less sessions remain
editable even if `0052` had provisionally attached a source. The RPC replaces
only that unlocked provisional scope and uses the corrected initializer for
the final permission validation. Existing and future Assignment sessions are
locked independently of the self-study selector.

Rollback should be an additional forward migration that disables new source
creation/search entry points while preserving session source and evidence
rows. Dropping the table would lose authorization snapshots and is not an
acceptable rollback.

## Validation

Required validation includes lint/build, canonical migration governance,
security and RLS smoke, route smoke, existing Practice/Assignment smoke, and
the dedicated Library-scope/finish-policy smoke. Hosted application and live
role-E2E remain release-owner actions and must be recorded separately.

## Old demo overlap

The old competition demo was inspected only as a conceptual source for
teacher-scoped private content. No demo route, wearable UI, fake publish flow,
or auto-approval behavior is restored.
