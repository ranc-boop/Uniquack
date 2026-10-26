# AI Operations Migration 0036 Manual Apply

Apply only [`0036_ai_operations_launch_readiness.sql`](../../../supabase/clean-migrations/0036_ai_operations_launch_readiness.sql) to the clean Supabase project after the PR is merged.

This forward-only migration adds the closed-beta operations layer. It does not alter migrations `0033`, `0034`, or `0035`, and it does not create provider profiles, credentials, Review Drafts, Questions, or Assignments.

It adds:

- `ai_operations_controls`: super-admin-only queue pause, budget, alert, and invocation bounds.
- `ai_operation_telemetry`: super-admin-only aggregate execution facts.
- a queue insert trigger that applies emergency enqueue pauses and conservative estimated-cost reservations.
- trusted-worker telemetry/control RPCs.
- super-admin-safe circuit inspection/reset RPCs.

In the Supabase SQL Editor, run the full migration file once. Then refresh **Admin / AI Settings**. Do not paste provider keys, gateway tokens, or database credentials into the migration.

After it is applied, run the focused smoke commands in the PR report. The worker remains disabled until an internal scheduler and `AI_JOBS_INTERNAL_TOKEN` are configured server-side.
