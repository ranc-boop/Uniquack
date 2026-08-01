# Practice cycle reset implementation

## Goal

Let a signed-in learner practice all currently available self-study questions again without deleting evidence.

## Non-goals

- Deleting attempts, mistakes, sessions, or Assignment progress.
- Resetting another learner or a shared Library.
- Changing Bank visibility, membership, or publication state.

## Workflow and ownership

The reset action records one user-owned timestamp. Source inventory and recommendation search classify attempts before that boundary as outside the current cycle. Existing sessions and all evidence remain available for review; the client opens a new self-study session after a successful reset. Assignment delivery and evidence are unchanged.

The marker is readable only by its owner. Mutation is exposed through an authenticated, parameterless RPC that derives identity from `auth.uid()`; callers cannot select another user.

## Safety gates and data risk

The migration is forward-only and additive. It replaces the two existing Practice inventory/search functions to include the reset boundary, revokes anonymous execution, and grants only the minimum authenticated access. It does not auto-publish or bypass Review Draft approval. Old competition demo behavior is not applicable.

Rollback risk is low at application level: hide the UI and stop calling the RPC. Database rollback should be a forward correction; removing the boundary would make historical attempts count again but would not lose data.

## Verification

- `node scripts/practice-cycle-reset-smoke.mjs`
- `node scripts/canonical-migration-governance-smoke.mjs`
- `node scripts/migration-reconciliation-smoke.mjs`
- TypeScript and production build gates
