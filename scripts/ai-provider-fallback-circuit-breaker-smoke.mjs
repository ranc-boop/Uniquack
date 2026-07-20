import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function read(path) {
  return readFile(resolve(root, path), "utf8");
}

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName,
  }).outputText;
}

async function loadRouting() {
  const adapters = moduleUrl(transpile(await read("src/lib/ai-providers/adapters.ts"), "adapters.ts"));
  const errors = moduleUrl(transpile(await read("src/lib/ai-providers/errors.ts"), "errors.ts").replace('import "server-only";', ""));
  const profiles = moduleUrl(`
    export async function listEnabledAIProviderProfilesForServerUse() { return globalThis.__profiles ?? []; }
    export async function loadAIProviderProfileForServerUse({ profileId }) {
      const profile = (globalThis.__profiles ?? []).find((item) => item.id === profileId);
      if (!profile) throw new Error("missing test profile");
      return { ...profile, apiKey: "test-key" };
    }
  `);
  const gateway = moduleUrl('export function requireAIProviderGatewayToken() { return "gateway"; }');
  const source = transpile(await read("src/lib/ai-providers/routing.ts"), "routing.ts")
    .replace('import "server-only";', "")
    .replace('from "@/lib/ai-providers/adapters"', `from "${adapters}"`)
    .replace('from "@/lib/ai-providers/errors"', `from "${errors}"`)
    .replace('from "@/lib/ai-providers/profiles"', `from "${profiles}"`)
    .replace('from "@/lib/ai-providers/gateway-token"', `from "${gateway}"`);
  return import(moduleUrl(source));
}

const routing = await loadRouting();

function profile(id, { defaultProfile = false, provider = "gemini_native", pdf = true, vision = false } = {}) {
  return {
    api_key_last4: "1234", base_url: "https://provider.example.test", created_at: "2026-01-01T00:00:00.000Z", organization_id: null,
    enabled: true, id, is_default: defaultProfile, model: `${provider}-model`, name: id, provider,
    supports_pdf_input: pdf, supports_vision_images: vision, updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function fakeSupabase({ policy = null, runtimeStates = [], rpc } = {}) {
  return {
    from() {
      const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({ data: policy, error: null }) };
      return query;
    },
    rpc(name, args) {
      if (rpc) return rpc(name, args);
      if (name === "list_ai_provider_runtime_states_for_worker") return Promise.resolve({ data: runtimeStates, error: null });
      return Promise.resolve({ data: true, error: null });
    },
  };
}

function policy(ids, operationKind = "ai_pdf_extract") {
  return {
    ai_provider_routing_policy_members: ids.map((provider_profile_id, route_order) => ({ provider_profile_id, route_order })),
    enabled: true, id: "policy", max_profiles_per_execution: ids.length, operation_kind: operationKind,
    organization_id: null, policy_version: 1, updated_at: "2026-01-01T00:00:00.000Z",
  };
}

async function capabilityAndExplicitRouteCases() {
  const textOnly = profile("text", { defaultProfile: true, provider: "deepseek", pdf: false });
  const pdfFallback = profile("pdf", { provider: "gemini_openai", pdf: false, vision: true });
  globalThis.__profiles = [textOnly, pdfFallback];

  await assertRejects(
    () => routing.resolveAIProviderRoute({ operationKind: "ai_pdf_extract", organizationId: "org", supabase: fakeSupabase() }),
    "text-only default profile must never be silently used for a PDF job",
  );

  const route = await routing.resolveAIProviderRoute({
    operationKind: "ai_pdf_extract", organizationId: "org", supabase: fakeSupabase({ policy: policy(["text", "pdf"]) }),
  });
  assert(route.source === "explicit_policy" && route.candidates.length === 1 && route.candidates[0].profile.id === "pdf", "the route must skip an incompatible primary rather than downgrade a PDF job");
}

async function circuitAndFallbackCases() {
  const primary = profile("primary", { defaultProfile: true });
  const fallback = profile("fallback", { provider: "gemini_openai", pdf: false, vision: true });
  globalThis.__profiles = [primary, fallback];
  const route = await routing.resolveAIProviderRoute({
    now: new Date("2026-07-11T12:00:00.000Z"), operationKind: "ai_pdf_extract", organizationId: "org",
    supabase: fakeSupabase({ policy: policy(["primary", "fallback"]), runtimeStates: [{ provider_profile_id: "primary", circuit_state: "open", consecutive_failure_count: 2, open_until: "2026-07-11T12:05:00.000Z", half_open_lease_expires_at: null }] }),
  });
  assert(route.candidates.length === 1 && route.candidates[0].profile.id === "fallback", "an open circuit must be skipped by later workers");

  const calls = [];
  const attemptBudgets = [];
  const fallbackResult = await routing.runWithAIProviderRoute({
    execute: async (selected, attemptBudget) => {
      attemptBudgets.push({ id: selected.id, maxAttempts: attemptBudget.maxAttempts });
      if (selected.id === "primary") throw Object.assign(new Error("UNAVAILABLE raw provider detail"), { status: 503 });
      return "review-drafts";
    },
    leaseOwner: "worker", route: { ...route, candidates: [{ mode: "normal", profile: primary, routeOrder: 0 }, { mode: "normal", profile: fallback, routeOrder: 1 }] },
    supabase: fakeSupabase({ rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; } }),
  });
  assert(fallbackResult.value === "review-drafts" && fallbackResult.fallbackUsed, "a classified transient primary failure must use only the configured fallback");
  assert(JSON.stringify(attemptBudgets) === JSON.stringify([
    { id: "primary", maxAttempts: 3 },
    { id: "fallback", maxAttempts: 1 },
  ]), "fallback routing must share one bounded PR4-I attempt budget across configured profiles");
  const failure = calls.find((call) => call.name === "record_ai_provider_route_outcome" && call.args.p_success === false);
  assert(failure?.args.p_safe_error_code === "provider_busy" && !JSON.stringify(failure).includes("UNAVAILABLE"), "runtime state must store a safe code, not raw provider diagnostics");
}

async function halfOpenCase() {
  const recovering = profile("recovering", { defaultProfile: true });
  globalThis.__profiles = [recovering];
  const route = await routing.resolveAIProviderRoute({
    now: new Date("2026-07-11T12:00:00.000Z"), operationKind: "ai_pdf_extract", organizationId: "org",
    supabase: fakeSupabase({ policy: policy(["recovering"]), runtimeStates: [{ provider_profile_id: "recovering", circuit_state: "open", consecutive_failure_count: 2, open_until: "2026-07-11T11:59:00.000Z", half_open_lease_expires_at: null }] }),
  });
  assert(route.candidates[0]?.mode === "half_open_probe", "an expired open circuit must use a controlled half-open probe");
  let probes = 0;
  await routing.runWithAIProviderRoute({
    execute: async () => "recovered", leaseOwner: "probe-worker", route,
    supabase: fakeSupabase({ rpc: async (name) => { if (name === "acquire_ai_provider_half_open_probe") probes += 1; return { data: true, error: null }; } }),
  });
  assert(probes === 1, "a recovering provider must acquire exactly one half-open lease before execution");
}

async function assertRejects(run, message) {
  let rejected = false;
  try { await run(); } catch { rejected = true; }
  assert(rejected, message);
}

function sourceChecks({ migration, routingSource, workerSource, blueprintSource }) {
  assert(migration.includes("ai_provider_routing_policies") && migration.includes("ai_provider_runtime_states") && migration.includes("acquire_ai_provider_half_open_probe") && migration.includes("record_ai_provider_route_outcome"), "0035 must add durable policy and circuit state primitives");
  assert(migration.includes("enable row level security") && migration.includes("to service_role") && !migration.includes("api_key_ciphertext"), "routing schema must preserve RLS and never store provider keys");
  assert(routingSource.includes("blueprint_observe_pdf") && routingSource.includes("blueprint_analyze_text") && routingSource.includes("providerSupportsAIProviderRoutingOperation") && routingSource.includes("AI_PROVIDER_ROUTE_TOTAL_ATTEMPT_BUDGET") && !routingSource.includes("process.env.GEMINI"), "routing must be capability-aware, attempt-bounded, and free of hard-coded provider credentials");
  assert(workerSource.includes("resolveAIProviderRoute") && workerSource.includes("runWithAIProviderRoute") && workerSource.includes("routingOrganizationId") && !workerSource.includes("createAssignment"), "worker routes must preserve queue and assignment safety boundaries");
  assert(blueprintSource.includes("runWithAIProviderRoute") && blueprintSource.includes("importBatchImportJson") && !blueprintSource.includes("published_at: new Date"), "Blueprint fallback must remain review-draft-only and non-publishing");
}

await capabilityAndExplicitRouteCases();
await circuitAndFallbackCases();
await halfOpenCase();
sourceChecks({
  blueprintSource: await read("src/lib/teacher-blueprint-generation.ts"),
  migration: await read("supabase/clean-migrations/0035_ai_provider_routing_circuit_breaker.sql"),
  routingSource: await read("src/lib/ai-providers/routing.ts"),
  workerSource: await read("src/lib/ai-jobs/worker.ts"),
});

console.log("PASS AI provider fallback circuit breaker smoke");
