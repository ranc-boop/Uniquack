# Student Assignment Practice Compatibility Report

## Executive Summary

Assignment-linked Practice now supports assigned bank-private questions through assignment scope. The fix keeps Question Banks private, keeps assignments as the student-visible delivery layer, and makes Practice resilient when AI review is unavailable.

## Reproduction / Issue

The bank-first assignment flow assigns selected approved bank questions without globally publishing those questions. That means student Practice must work with non-published private bank questions when the student receives them through an assigned classroom assignment.

Some Practice paths still assumed globally published questions or depended on AI review completing successfully. That could surface as assignment Practice failures such as `Key is not allowed`, unavailable contextual hints, or stuck review/grade behavior after a student submits assigned work.

The exact `Key is not allowed` message was not reproduced verbatim in this pass. The compatibility gaps found are still in the same assignment-to-practice path.

## Root Cause

- `loadQuestionForHint` required `status = published`, which blocked contextual hints for assignment-scoped private bank questions even though RLS already allows assigned-question access.
- The deterministic grading endpoint returned grades and assignment progress, but did not persist review/attempt evidence into the current Practice round when `sessionId` and `roundId` were present.
- The Practice client could get stuck on AI review failure instead of falling back to deterministic grading for supported question types.

## Files Changed

- `src/lib/practice/tools.ts`: removes the published-only filter from hint question lookup and lets RLS enforce assignment/private visibility.
- `src/app/api/practice/grade/route.ts`: persists deterministic review/attempt evidence for existing practice rounds and still updates linked assignment progress.
- `src/components/practice/practice-agent-client.tsx`: falls back to deterministic grading when AI review streaming fails.
- `scripts/assignment-practice-evidence-smoke.mjs`: adds static guards for bank-private assignment start, RLS-based hints, and grade fallback persistence.

## Assignment-Scoped Private Question Access

Confirmed by the existing live `assignment-from-bank` smoke:

- assigned bank-private questions are readable through assignment scope;
- the source bank remains hidden from the student;
- unassigned private bank questions remain hidden;
- assigned questions remain non-published with `published_at` null;
- global/public search does not expose the private bank question.

## Practice Compatibility Result

- `/practice?assignmentId=...` still starts through the assignment-specific Practice API.
- Assigned bank-private questions can now be used by the hint path through assignment-scoped RLS.
- Deterministic grade fallback persists Practice review/attempt evidence when a round exists.
- AI review failure now has a safe fallback for supported deterministic grading paths.

## Student-Visible Error State

The main student-visible behavior changed from a hard AI review failure to a deterministic fallback review panel when fallback grading succeeds. Broader copy polish for student error states remains future UI polish.

## Smoke Coverage

`scripts/assignment-practice-evidence-smoke.mjs` now checks that:

- assignment Practice still uses `startAssignmentPractice`;
- assignment Practice does not require published/global questions;
- the client calls `/api/practice/assignments/start`;
- the client has `/api/practice/grade` fallback behavior;
- deterministic grading persists evidence through `persistQuestionReviewResults`;
- hint lookup is not hard-coded to `status = published`.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/assignment-from-bank-smoke.mjs`
- `node scripts/assignment-practice-evidence-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

`node scripts/route-smoke.mjs` was not rerun because no route expectations or route files changed in this targeted fix.

## Remaining Blockers

- No Study Groups yet.
- No Student Library yet.
- No full student workspace redesign in this PR.
- Further student error-state UI polish can come later if needed.

## Explicit Non-Goals

- No Student Library.
- No Study Groups.
- No monetization or entitlement changes.
- No public pull or private push workflows.
- No provider behavior changes.
- No student UI redesign.
- No Google Classroom integration.
- No wearable UI.
