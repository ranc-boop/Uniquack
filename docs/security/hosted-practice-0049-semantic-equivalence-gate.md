# Hosted Practice 0049 Semantic Equivalence Gate

Date: 2026-07-21

Final classification:
`HOSTED_PRACTICE_0049_EXACTLY_REPRESENTED_UNLEDGERED`

This gate used only process-scoped hosted-clean variables and a Session Pooler
PostgreSQL connection. No `.env.local`, legacy project, Supabase management API,
Storage mutation, migration apply, migration-history repair, provider call,
credential-bearing URL, project identifier, database row content, or function
body is recorded here.

## Read-Only Proof

| Check | Result |
|---|---|
| Branch | `codex/pdf50-hosted-clean-maintenance` |
| Source HEAD | `cc1972fe0856451e8afa3931977a3b68023cc53f` |
| Required hosted-clean env names present | PASS |
| Read-only gate confirmed | PASS |
| Hosted Session Pooler shape | PASS |
| Expected project identity match | PASS |
| Forbidden legacy identity not matched | PASS |
| Denylist check | PASS |
| SSL connection | PASS |
| `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY` | PASS |
| `transaction_read_only` | ON |
| `transaction_isolation` | repeatable read |
| Transaction-local statement and lock timeouts | PASS |
| `SELECT 1` | PASS |
| `ROLLBACK` | PASS |
| Connection closed | PASS |
| Hosted writes | 0 |
| Provider calls | 0 |

## Canonical 0049 Fingerprint

Parsed source:
`supabase/clean-migrations/0049_practice_agent_provider_routing.sql`

Expected migration-history identity:

| Field | Expected |
|---|---|
| Version | `0049` |
| Filename | `0049_practice_agent_provider_routing.sql` |
| Canonical order | Practice 0049, PDF50 0050 |

Expected definition object count: `5`

| Category | Count |
|---|---:|
| Check constraints | 2 |
| Functions | 3 |
| Grants | 0 |
| Policies | 0 |
| Indexes | 0 |
| Triggers | 0 |

Affected direct tables:

- `private.ai_provider_runtime_states`
- `public.ai_provider_routing_policies`

Affected behavior tables:

- `private.ai_provider_runtime_states`
- `public.ai_provider_profiles`
- `public.ai_provider_routing_policies`
- `public.ai_provider_routing_policy_members`

Operation allowlist:

- `ai_pdf_extract`
- `blueprint_analyze_text`
- `blueprint_generate_questions`
- `blueprint_observe_pdf`
- `practice_generation`

Operation allowlist hash:
`ce9556c0d315a5c5a84b40ef33edac4cd36d1bfc69349ba6cf626b1cbf57f2f1`

Whole normalized 0049 source hash:
`c3110865fecf98a53f75dcafaea3ca48e0d9da3276ddba483c47df5dc82adaa9`

## Per-Object Equivalence

| Object | Category | Classification | Expected hash | Hosted hash | Notes |
|---|---|---|---|---|---|
| `private.ai_provider_runtime_states.ai_provider_runtime_states_operation_kind_check` | check constraint | `EXACT_EQUIVALENT` | `ce9556c0d315a5c5a84b40ef33edac4cd36d1bfc69349ba6cf626b1cbf57f2f1` | `ce9556c0d315a5c5a84b40ef33edac4cd36d1bfc69349ba6cf626b1cbf57f2f1` | PostgreSQL predicate text normalized differently; operation set is exact and constraint is validated |
| `public.ai_provider_routing_policies.ai_provider_routing_policies_operation_kind_check` | check constraint | `EXACT_EQUIVALENT` | `ce9556c0d315a5c5a84b40ef33edac4cd36d1bfc69349ba6cf626b1cbf57f2f1` | `ce9556c0d315a5c5a84b40ef33edac4cd36d1bfc69349ba6cf626b1cbf57f2f1` | PostgreSQL predicate text normalized differently; operation set is exact and constraint is validated |
| `public.list_ai_provider_runtime_states_for_worker(p_provider_profile_ids uuid[], p_operation_kind text)` | function | `EXACT_EQUIVALENT` | `723d0357d58eec9ff76e91b55d6c7816cf1850db637dee73d69186c960b1e0d1` | `723d0357d58eec9ff76e91b55d6c7816cf1850db637dee73d69186c960b1e0d1` | Body, behavior, return type, language, volatility, security mode, parallel mode, and search path match |
| `public.record_ai_provider_route_outcome(p_provider_profile_id uuid, p_operation_kind text, p_success boolean, p_circuit_eligible boolean, p_safe_error_code text, p_probe_lease_owner text)` | function | `EXACT_EQUIVALENT` | `76de1f6d18a40f172916abbd6a74c371816e9e680a602194b915c5d6fbbdec6c` | `76de1f6d18a40f172916abbd6a74c371816e9e680a602194b915c5d6fbbdec6c` | Body, behavior, return type, language, volatility, security mode, parallel mode, and search path match |
| `public.upsert_ai_provider_routing_policy_for_gateway(gateway_token text, p_organization_id uuid, p_operation_kind text, p_enabled boolean, p_max_profiles_per_execution integer, p_provider_profile_ids uuid[])` | function | `EXACT_EQUIVALENT` | `49b7babffdae06610439a6967a61e6ee6b2fc48319dc87644f935ff758f2ecdc` | `49b7babffdae06610439a6967a61e6ee6b2fc48319dc87644f935ff758f2ecdc` | Body, behavior, return type, language, volatility, security mode, parallel mode, and search path match |

Exact match count: `5`

Mismatch count: `0`

Mismatch categories: none

## Function Security Properties

| Function | Security definer | Language | Volatility | Parallel | Search path | Classification |
|---|---|---|---|---|---|---|
| `public.list_ai_provider_runtime_states_for_worker(...)` | true | `plpgsql` | `stable` | `unsafe` | `public,private` | MATCH |
| `public.record_ai_provider_route_outcome(...)` | true | `plpgsql` | `volatile` | `unsafe` | `public,private` | MATCH |
| `public.upsert_ai_provider_routing_policy_for_gateway(...)` | true | `plpgsql` | `volatile` | `unsafe` | `public,private` | MATCH |

Owner and ACL metadata were captured by hash only. Practice 0049 does not issue
`GRANT`, `REVOKE`, `ALTER OWNER`, policy, index, or trigger statements, so
there is no 0049 grant or ownership mutation to compare against.

## Routing And Worker Behavior

The normalized function body and behavior hashes matched for all three
functions. The comparison covered:

- gateway-token verification for routing policy writes;
- exact operation allowlist including `practice_generation`;
- unsupported-operation rejection;
- provider-profile cap and duplicate-profile rejection;
- enabled-policy primary-profile requirement;
- compatible enabled-profile filtering;
- routing-policy row lock and member rewrite behavior;
- trusted-worker guard for runtime-state reads and writes;
- provider/runtime operation filtering;
- bounded safe error code handling;
- half-open probe lease checks;
- circuit-open behavior on eligible failure;
- missing runtime-state insert behavior;
- probe lease clearing after outcome recording.

No extra provider-routing branch was detected. No broader or narrower operation
constraint was detected.

## History Status

| Check | Result |
|---|---|
| Migration-history rows | 21 |
| Canonical history represented | `0001-0019` |
| Canonical history missing | `0020-0050` |
| Known unmapped legacy rows | 2 |
| Ambiguous rows | 0 |
| Practice 0049 history | ABSENT |
| PDF50 0050 history | ABSENT |

Practice 0049 is represented in hosted schema definitions but not represented
by hosted migration history. The evidence supports:
`UNLEDGERED_SCHEMA_CHANGE_OR_MANUAL_APPLICATION_NOT_REPRESENTED_BY_HISTORY`.

Re-executing Practice 0049 is unnecessary and potentially conflicting because
all five canonical 0049 definition objects are already exactly represented.

## PDF50 Boundary

| Check | Result |
|---|---|
| PDF50 0050 non-bucket schema objects | ABSENT |
| Compatible private `ai-import-sources` bucket | PRESENT |
| Bucket included in Practice 0049 classification | NO |

The existing `ai-import-sources` bucket is unrelated to Practice 0049. It
remains part of the separate PDF50 0050 preexisting-bucket adoption boundary.

## History-Adoption Eligibility

| Requirement | Result |
|---|---|
| Every canonical 0049 object is present | PASS |
| Every normalized definition is semantically equivalent | PASS |
| No required object is partial | PASS |
| No security property is weaker | PASS |
| No unexpected routing behavior is present | PASS |
| 0049 migration-history record is absent | PASS |
| Re-executing 0049 is unnecessary and potentially conflicting | PASS |
| Canonical source still has Practice 0049 and PDF50 0050 | PASS |

History-adoption eligibility: `ELIGIBLE`

No history record was added by this task.

## Required Next Maintenance Sequence

If approved as a controlled maintenance operation, the next sequence is:

1. Add verified canonical history records `0020-0049`.
2. Preserve the two unmapped legacy rows.
3. Verify next pending canonical migration is `0050`.
4. Apply PDF50 `0050` once.
5. Run hosted RLS/Storage/1/10/50 admission validation.
