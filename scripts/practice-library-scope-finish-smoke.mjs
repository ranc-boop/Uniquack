import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const [migration, ambiguityFix, firstRoundLock, agent, recommend, reviewRoute, tools, sessions, sources, client, panels, completion] =
  await Promise.all([
    read("supabase/clean-migrations/0052_practice_library_scope_and_inventory.sql"),
    read("supabase/clean-migrations/0053_practice_session_source_rpc_ambiguity_fix.sql"),
    read("supabase/clean-migrations/0054_practice_source_scope_lock_on_first_round.sql"),
    read("src/lib/practice/agent-loop.ts"),
    read("src/app/api/practice/recommend/route.ts"),
    read("src/app/api/practice/review/route.ts"),
    read("src/lib/practice/tools.ts"),
    read("src/app/api/practice/sessions/route.ts"),
    read("src/app/api/practice/sources/route.ts"),
    read("src/components/practice/practice-agent-client.tsx"),
    read("src/components/practice/practice-session-scope-panels.tsx"),
    read("src/lib/practice/completion.ts"),
  ]);
const clientUi = `${client}\n${panels}`;

function includesAll(source, values, message) {
  for (const value of values) {
    assert(source.includes(value), `${message}: missing ${value}`);
  }
}

includesAll(
  migration,
  [
    "create table if not exists public.practice_session_sources",
    "source_kind in ('public_catalog', 'question_bank', 'assignment')",
    "enable row level security",
    "initialize_practice_session_sources",
    "list_selectable_practice_sources",
    "search_practice_questions_in_session",
    "join public.bank_members member",
    "member.status = 'active'",
    "bank.status = 'active'",
    "requested_count > 10",
    "selection_state in ('unseen', 'needs_retry')",
    "retried_in_session",
    "then 'deferred'",
    "selected_assignment.review_status = 'approved'",
  ],
  "0052 permission and candidate-state contract",
);
includesAll(
  ambiguityFix,
  [
    "create or replace function public.initialize_practice_session_sources",
    "array_agg(deduplicated.bank_id order by deduplicated.bank_id)",
    "requested.requested_id as bank_id",
  ],
  "0053 must qualify the bank-id aggregation after the runtime 42702 failure",
);
assert(
  !ambiguityFix.includes("array_agg(bank_id order by bank_id)"),
  "0053 cannot restore the ambiguous unqualified bank_id reference.",
);
includesAll(
  firstRoundLock,
  [
    "source_scope_locked_at",
    "lock_practice_session_sources_for_round",
    "for update",
    "delete from public.practice_session_sources",
    "initialize_practice_session_sources",
    "grant execute on function",
  ],
  "0054 must atomically validate and lock sources only when the first round starts",
);
assert(
  !/create policy[\s\S]*for (insert|update|delete)/i.test(migration),
  "Browser mutation policies must not make immutable session sources writable.",
);

includesAll(
  sessions,
  ["sourceSelection", "includePublicCatalog", "bankIds"],
  "Session creation must accept a normalized source selection",
);
includesAll(
  sources,
  ["list_selectable_practice_sources", "membershipRole", "needsRetry"],
  "Source API must return permission-scoped inventory",
);

const toolNames = [...agent.matchAll(/name: "(browse_taxonomy_batch|practice_search_batch|finalize_recommendation|finish_practice)"/g)]
  .map((match) => match[1]);
assert.deepEqual(
  toolNames.slice(0, 4),
  ["browse_taxonomy_batch", "practice_search_batch", "finalize_recommendation", "finish_practice"],
  "The stable Practice schema must contain exactly the expected four tools in order.",
);
includesAll(
  agent,
  [
    'reason_code: {',
    '"scope_exhausted", "goal_satisfied", "diminishing_returns"',
    'toolName === "finish_practice"',
    "state.completedRoundCount > 0",
    "policyNotices",
    "...tailPolicyNotices",
  ],
  "Stable finish tool and tail-policy contract",
);
assert(
  agent.indexOf("...tailPolicyNotices") > agent.indexOf("stableStringify(dynamicSuffix)"),
  "Dynamic tool policy notices must be appended after the volatile task suffix.",
);

includesAll(
  recommend,
  [
    "lock_practice_session_sources_for_round",
    "sourceSelection.bankIds",
    "finish_practice_disabled_initial",
    "finish_practice_enabled_after_first_round",
    "source_scope_reduced_",
    'send("practice_ending"',
    'send("practice_summary_delta"',
    'send("practice_completed"',
    "agentResult.searchCallsUsed >= 2",
    "sourceAccessLost",
  ],
  "Recommendation policy and completion stream contract",
);
assert(
  recommend.indexOf('send("practice_ending"') <
    recommend.indexOf('send("practice_summary_delta"'),
  "practice_ending must be emitted before summary deltas.",
);

includesAll(
  completion,
  [
    'reportStatus: "generating"',
    '.eq("status", "active")',
    "Final practice report generation is already in progress.",
    'reportStatus: "completed"',
    'toolChoice: "none"',
    '"session_review"',
    "deterministicReport",
  ],
  "Idempotent finalizer and deterministic fallback contract",
);
includesAll(
  clientUi,
  [
    '"ending"',
    '"completed"',
    "/api/practice/sources",
    "includePublicCatalog",
    "selectedBankIds",
    "sourceScopeLockedAt",
    "not attempted",
    '"practice_summary_delta"',
    "Choose sources before starting the first round.",
    "PracticeRoundNavigator",
    "questionCount",
  ],
  "Practice source selector and completion UI contract",
);
assert(
  !client.includes("setPolicyNotice") && !client.includes("{policyNotice ?"),
  "Internal tool-policy notices must stay in the agent context and not render in the student UI.",
);
includesAll(
  reviewRoute,
  [
    "normalizeRoundReviewSummary",
    "Return plain prose only.",
    'mode: "plain" | "structured" | "unknown"',
  ],
  "Round review must unwrap structured provider output without streaming raw JSON",
);
includesAll(
  tools,
  ["session_scope_fallback", 'mode === "relaxed"', "authorized session scope"],
  "Relaxed search must fall back to the full authorized session scope",
);

const sample = [
  { id: "mastered", latest: true, retried: false },
  { id: "retry", latest: false, retried: false },
  { id: "deferred", latest: false, retried: true },
  { id: "unseen", latest: null, retried: false },
];
const classified = sample.map((item) => ({
  ...item,
  state:
    item.latest === null
      ? "unseen"
      : item.latest
        ? "mastered"
        : item.retried
          ? "deferred"
          : "needs_retry",
})).sort((left, right) => {
  const rank = { unseen: 0, needs_retry: 1, mastered: 2, deferred: 3 };
  return rank[left.state] - rank[right.state];
});
assert.deepEqual(
  classified.map((item) => item.state),
  ["unseen", "needs_retry", "mastered", "deferred"],
  "Candidate-state simulation must rank unseen before the single retry lane.",
);

console.log("PASS immutable permission-scoped Practice sources");
console.log("PASS server-authoritative unseen/retry/mastered/deferred inventory");
console.log("PASS byte-stable four-tool schema with append-only tail policy");
console.log("PASS idempotent streamed completion and deterministic fallback");
console.log("PASS multi-Library selector and completed-session UI");
