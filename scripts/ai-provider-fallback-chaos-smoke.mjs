import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), "..");

dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const gatewayToken = process.env.AI_PROVIDER_GATEWAY_TOKEN;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;
const adminUsername = process.env.TEST_ADMIN_USERNAME;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const superAdminUsername = process.env.TEST_SUPER_ADMIN_USERNAME;
const superAdminPassword = process.env.TEST_SUPER_ADMIN_PASSWORD;

const COOLDOWN_BUFFER_MS = 1_250;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarize(error) {
  return String(error?.message ?? error ?? "unknown error").slice(0, 320);
}

function emailFromUsername(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadLiveRouting(profiles) {
  const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");
  const transpile = (source, fileName) =>
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName,
    }).outputText;

  const adapters = dataUrl(transpile(await read("src/lib/ai-providers/adapters.ts"), "adapters.ts"));
  const errors = dataUrl(
    transpile(await read("src/lib/ai-providers/errors.ts"), "errors.ts").replace(
      'import "server-only";',
      "",
    ),
  );
  const profileModule = dataUrl(`
    const profiles = ${JSON.stringify(profiles)};
    export async function listEnabledAIProviderProfilesForServerUse() { return profiles; }
    export async function loadAIProviderProfileForServerUse({ profileId }) {
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Synthetic routing profile is unavailable.");
      return { ...profile, apiKey: "synthetic-test-key" };
    }
  `);
  const gatewayModule = dataUrl('export function requireAIProviderGatewayToken() { return "synthetic"; }');
  const source = transpile(await read("src/lib/ai-providers/routing.ts"), "routing.ts")
    .replace('import "server-only";', "")
    .replace('from "@/lib/ai-providers/adapters"', `from "${adapters}"`)
    .replace('from "@/lib/ai-providers/errors"', `from "${errors}"`)
    .replace('from "@/lib/ai-providers/profiles"', `from "${profileModule}"`)
    .replace('from "@/lib/ai-providers/gateway-token"', `from "${gatewayModule}"`);
  return import(dataUrl(source));
}

async function signIn(username, password, label) {
  assert(username && password, `Missing ${label} smoke credentials.`);
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: emailFromUsername(username),
    password,
  });
  assert(!error && data.user, `${label} sign-in failed.`);
  return { client, user: data.user };
}

async function trySignIn(username, password, label) {
  if (!username || !password) return null;
  try {
    return await signIn(username, password, label);
  } catch {
    return null;
  }
}

async function runtimeState(admin, profileId, operationKind) {
  const { data, error } = await admin.rpc("list_ai_provider_runtime_states_for_worker", {
    p_operation_kind: operationKind,
    p_provider_profile_ids: [profileId],
  });
  assert(!error, `runtime-state read failed: ${summarize(error)}`);
  return Array.isArray(data) ? data[0] ?? null : null;
}

async function recordOutcome(admin, {
  operationKind,
  probeLeaseOwner = null,
  profileId,
  safeErrorCode = null,
  success,
}) {
  const { data, error } = await admin.rpc("record_ai_provider_route_outcome", {
    p_circuit_eligible: !success,
    p_operation_kind: operationKind,
    p_probe_lease_owner: probeLeaseOwner,
    p_provider_profile_id: profileId,
    p_safe_error_code: safeErrorCode,
    p_success: success,
  });
  assert(!error, `runtime-state write failed: ${summarize(error)}`);
  return data;
}

async function acquireProbe(admin, profileId, operationKind, leaseOwner) {
  const { data, error } = await admin.rpc("acquire_ai_provider_half_open_probe", {
    p_lease_owner: leaseOwner,
    p_operation_kind: operationKind,
    p_provider_profile_id: profileId,
  });
  assert(!error, `half-open probe acquire failed: ${summarize(error)}`);
  return data === true;
}

function syntheticProfile({ id, organizationId, textOnly = false, disabled = false, archived = false }) {
  return {
    api_key_last4: "0000",
    base_url: textOnly ? "https://api.deepseek.com" : `mock://ai-pdf-import/${id}`,
    deleted_at: archived ? new Date().toISOString() : null,
    enabled: !disabled,
    id,
    is_default: false,
    model: textOnly ? "synthetic-text" : "synthetic-pdf",
    name: `routing smoke ${id.slice(0, 8)}`,
    organization_id: organizationId,
    provider: textOnly ? "deepseek" : "compatible",
    supports_pdf_input: !textOnly,
    supports_vision_images: !textOnly,
  };
}

async function main() {
  assert(supabaseUrl && supabaseAnonKey, "Missing clean Supabase browser configuration.");
  assert(serviceRoleKey, "Missing clean Supabase service-role configuration.");
  assert(gatewayToken, "Missing server-side provider gateway configuration.");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [teacher, unrelatedTeacher, student] = await Promise.all([
    signIn(teacherUsername, teacherPassword, "teacher"),
    signIn(unrelatedTeacherUsername, unrelatedTeacherPassword, "unrelated teacher"),
    signIn(studentUsername, studentPassword, "student"),
  ]);
  const superAdmin =
    (await trySignIn(superAdminUsername, superAdminPassword, "super admin")) ??
    (await signIn(adminUsername, adminPassword, "admin"));
  const { data: superAdminProfile, error: superAdminProfileError } = await superAdmin.client
    .from("profiles")
    .select("role, status")
    .eq("id", superAdmin.user.id)
    .single();
  assert(
    !superAdminProfileError &&
      superAdminProfile?.role === "super_admin" &&
      superAdminProfile.status === "active",
    "A valid super-admin smoke account is required for routing-policy validation.",
  );

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const profileIds = [];
  const policyIds = [];
  const organizationIds = [];

  try {
    const [{ data: testOrganization, error: testOrganizationError }, { data: otherOrganization, error: otherOrganizationError }] =
      await Promise.all([
        admin
          .from("organizations")
          .insert({ name: `Routing smoke ${suffix}`, slug: `routing-smoke-${suffix}` })
          .select("id")
          .single(),
        admin
          .from("organizations")
          .insert({ name: `Routing other ${suffix}`, slug: `routing-other-${suffix}` })
          .select("id")
          .single(),
      ]);
    assert(!testOrganizationError && testOrganization?.id, "Unable to create routing smoke organization.");
    assert(!otherOrganizationError && otherOrganization?.id, "Unable to create isolation organization.");
    organizationIds.push(testOrganization.id, otherOrganization.id);

    const ids = {
      archived: randomUUID(),
      disabled: randomUUID(),
      fallback: randomUUID(),
      primary: randomUUID(),
      recover: randomUUID(),
      reopen: randomUUID(),
      textOnly: randomUUID(),
      wrongScope: randomUUID(),
    };
    const profiles = [
      syntheticProfile({ id: ids.primary, organizationId: testOrganization.id }),
      syntheticProfile({ id: ids.fallback, organizationId: testOrganization.id }),
      syntheticProfile({ id: ids.textOnly, organizationId: testOrganization.id, textOnly: true }),
      syntheticProfile({ id: ids.recover, organizationId: testOrganization.id }),
      syntheticProfile({ id: ids.reopen, organizationId: testOrganization.id }),
      syntheticProfile({ id: ids.disabled, organizationId: testOrganization.id, disabled: true }),
      syntheticProfile({ id: ids.archived, organizationId: testOrganization.id, archived: true }),
      syntheticProfile({ id: ids.wrongScope, organizationId: otherOrganization.id }),
    ];
    const { error: profileError } = await admin.from("ai_provider_profiles").insert(profiles);
    assert(!profileError, `Unable to create synthetic routing profiles: ${summarize(profileError)}`);
    profileIds.push(...profiles.map((profile) => profile.id));

    const upsertPolicy = async (profileIdsForPolicy, operationKind = "ai_pdf_extract") => {
      const { data, error } = await superAdmin.client.rpc(
        "upsert_ai_provider_routing_policy_for_gateway",
        {
          gateway_token: gatewayToken,
          p_enabled: true,
          p_max_profiles_per_execution: Math.min(3, profileIdsForPolicy.length),
          p_operation_kind: operationKind,
          p_organization_id: testOrganization.id,
          p_provider_profile_ids: profileIdsForPolicy,
        },
      );
      return { data, error };
    };

    for (const blockedProfileId of [ids.disabled, ids.archived, ids.wrongScope]) {
      const { error } = await upsertPolicy([blockedProfileId]);
      assert(error, "Routing policy accepted a disabled, archived, or wrong-scope profile.");
    }
    console.log("PASS routing policy rejects disabled, archived, and wrong-scope profiles");

    const { data: policyId, error: policyError } = await upsertPolicy([ids.primary, ids.fallback]);
    assert(!policyError && policyId, `Super-admin policy save failed: ${summarize(policyError)}`);
    policyIds.push(policyId);

    const { data: listedPolicies, error: listedPoliciesError } = await superAdmin.client.rpc(
      "list_ai_provider_routing_policies_for_gateway",
      { gateway_token: gatewayToken },
    );
    assert(!listedPoliciesError, `Super-admin policy list failed: ${summarize(listedPoliciesError)}`);
    const listedPolicy = (listedPolicies ?? []).find((policy) => policy.id === policyId);
    assert(
      JSON.stringify(listedPolicy?.provider_profile_ids) === JSON.stringify([ids.primary, ids.fallback]),
      "Admin policy list did not preserve configured profile order.",
    );
    assert(
      !/cipher|secret|api_key|prompt|source/i.test(JSON.stringify(listedPolicy)),
      "Admin policy list exposed credentials or source material.",
    );
    console.log("PASS super-admin saves ordered, safe routing policy metadata");

    for (const actor of [teacher, unrelatedTeacher, student]) {
      const { data, error } = await actor.client
        .from("ai_provider_routing_policies")
        .select("id")
        .eq("id", policyId);
      assert(!error && !(data ?? []).length, "Teacher or student read a protected routing policy row.");
    }
    const { data: teacherUpdate, error: teacherWriteError } = await teacher.client
      .from("ai_provider_routing_policies")
      .update({ enabled: false })
      .eq("id", policyId)
      .select("id");
    assert(
      teacherWriteError || !(teacherUpdate ?? []).length,
      "Teacher policy update was unexpectedly accepted.",
    );
    const { data: unchangedPolicy, error: unchangedPolicyError } = await admin
      .from("ai_provider_routing_policies")
      .select("enabled")
      .eq("id", policyId)
      .single();
    assert(!unchangedPolicyError && unchangedPolicy.enabled === true, "Teacher changed routing policy state.");

    const { error: teacherGatewayError } = await teacher.client.rpc(
      "upsert_ai_provider_routing_policy_for_gateway",
      {
        gateway_token: "not-a-gateway-token",
        p_enabled: true,
        p_max_profiles_per_execution: 1,
        p_operation_kind: "ai_pdf_extract",
        p_organization_id: testOrganization.id,
        p_provider_profile_ids: [ids.primary],
      },
    );
    assert(teacherGatewayError, "Teacher unexpectedly updated routing policy without trusted gateway access.");
    console.log("PASS teacher, unrelated teacher, and student cannot read or mutate routing policy state");

    for (const actor of [teacher, unrelatedTeacher, student]) {
      const { data, error } = await actor.client.rpc("list_ai_provider_runtime_states_for_worker", {
        p_operation_kind: "ai_pdf_extract",
        p_provider_profile_ids: [ids.primary],
      });
      assert(error || !(data ?? []).length, "Teacher or student read service-role-only circuit state.");
    }

    await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      profileId: ids.primary,
      success: true,
    });
    const healthyState = await runtimeState(admin, ids.primary, "ai_pdf_extract");
    assert(healthyState?.circuit_state === "closed", "Healthy provider did not remain circuit-eligible.");

    const routingProfiles = profiles
      .filter((profile) => profile.enabled && !profile.deleted_at)
      .map(({ deleted_at, organization_id, ...profile }) => ({
        ...profile,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    const routing = await loadLiveRouting(routingProfiles);
    const initialRoute = await routing.resolveAIProviderRoute({
      operationKind: "ai_pdf_extract",
      organizationId: testOrganization.id,
      supabase: admin,
    });
    assert(
      initialRoute.candidates.map((candidate) => candidate.profile.id).join(",") ===
        `${ids.primary},${ids.fallback}`,
      "Live route did not select only the configured primary and fallback order.",
    );

    const attempts = [];
    const fallbackResult = await routing.runWithAIProviderRoute({
      execute: async (profile, budget) => {
        attempts.push({ id: profile.id, maxAttempts: budget.maxAttempts });
        if (profile.id === ids.primary) throw Object.assign(new Error("synthetic availability failure"), { status: 503 });
        return "private-review-handoff";
      },
      leaseOwner: `routing-smoke:${suffix}`,
      route: initialRoute,
      supabase: admin,
    });
    assert(
      fallbackResult.value === "private-review-handoff" && fallbackResult.fallbackUsed,
      "Configured fallback did not complete the same logical routed operation.",
    );
    assert(
      JSON.stringify(attempts) === JSON.stringify([
        { id: ids.primary, maxAttempts: 3 },
        { id: ids.fallback, maxAttempts: 1 },
      ]),
      "Fallback did not receive the bounded remaining retry budget.",
    );
    console.log("PASS configured primary/fallback routing uses one bounded attempt budget without a provider call");

    await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      profileId: ids.primary,
      safeErrorCode: "provider_busy",
      success: false,
    });
    const openPrimary = await runtimeState(admin, ids.primary, "ai_pdf_extract");
    assert(
      openPrimary?.circuit_state === "open" && new Date(openPrimary.open_until) > new Date(),
      "Repeated safe transient failures did not open the primary circuit.",
    );
    const openRoute = await routing.resolveAIProviderRoute({
      operationKind: "ai_pdf_extract",
      organizationId: testOrganization.id,
      supabase: admin,
    });
    assert(
      openRoute.candidates.length === 1 && openRoute.candidates[0].profile.id === ids.fallback,
      "Open primary circuit was not skipped by normal route resolution.",
    );

    for (const profileId of [ids.recover, ids.reopen]) {
      await recordOutcome(admin, {
        operationKind: "ai_pdf_extract",
        profileId,
        safeErrorCode: "provider_busy",
        success: false,
      });
      await recordOutcome(admin, {
        operationKind: "ai_pdf_extract",
        profileId,
        safeErrorCode: "provider_busy",
        success: false,
      });
    }
    const [recoverOpen, reopenOpen] = await Promise.all([
      runtimeState(admin, ids.recover, "ai_pdf_extract"),
      runtimeState(admin, ids.reopen, "ai_pdf_extract"),
    ]);
    assert(recoverOpen?.circuit_state === "open" && reopenOpen?.circuit_state === "open", "Synthetic circuits did not open.");

    const waitUntil = Math.max(
      Date.parse(recoverOpen.open_until),
      Date.parse(reopenOpen.open_until),
    ) + COOLDOWN_BUFFER_MS;
    const waitMs = Math.max(0, waitUntil - Date.now());
    console.log(`WAITING circuit cooldown for ${Math.ceil(waitMs / 1000)} seconds`);
    await sleep(waitMs);

    const recoveryOwners = Array.from({ length: 5 }, (_, index) => `routing-recover-${index + 1}-${suffix}`);
    const recoveryClaims = await Promise.all(
      recoveryOwners.map((owner) => acquireProbe(admin, ids.recover, "ai_pdf_extract", owner)),
    );
    assert(recoveryClaims.filter(Boolean).length === 1, "Exactly one worker must win the half-open recovery probe.");
    const recoveryOwner = recoveryOwners[recoveryClaims.findIndex(Boolean)];
    const staleOutcome = await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      probeLeaseOwner: `${recoveryOwner}-stale`,
      profileId: ids.recover,
      safeErrorCode: "provider_busy",
      success: false,
    });
    assert(staleOutcome === false, "A stale half-open lease owner updated circuit state.");
    const recovered = await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      probeLeaseOwner: recoveryOwner,
      profileId: ids.recover,
      success: true,
    });
    assert(recovered === true, "Valid half-open success was rejected.");
    const recoveredState = await runtimeState(admin, ids.recover, "ai_pdf_extract");
    assert(recoveredState?.circuit_state === "closed", "Half-open success did not close the circuit.");

    const reopenOwners = Array.from({ length: 4 }, (_, index) => `routing-reopen-${index + 1}-${suffix}`);
    const reopenClaims = await Promise.all(
      reopenOwners.map((owner) => acquireProbe(admin, ids.reopen, "ai_pdf_extract", owner)),
    );
    assert(reopenClaims.filter(Boolean).length === 1, "Exactly one worker must win the failing half-open probe.");
    const reopenOwner = reopenOwners[reopenClaims.findIndex(Boolean)];
    const reopened = await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      probeLeaseOwner: reopenOwner,
      profileId: ids.reopen,
      safeErrorCode: "provider_busy",
      success: false,
    });
    assert(reopened === true, "Valid half-open failure was rejected.");
    const reopenedState = await runtimeState(admin, ids.reopen, "ai_pdf_extract");
    assert(
      reopenedState?.circuit_state === "open" && new Date(reopenedState.open_until) > new Date(),
      "Half-open failure did not safely reopen the circuit.",
    );
    console.log("PASS live closed/open/half-open, atomic probe, lease-owner, recovery, and reopen validation");

    await recordOutcome(admin, {
      operationKind: "blueprint_analyze_text",
      profileId: ids.primary,
      success: true,
    });
    const [pdfPrimaryState, textPrimaryState, fallbackState] = await Promise.all([
      runtimeState(admin, ids.primary, "ai_pdf_extract"),
      runtimeState(admin, ids.primary, "blueprint_analyze_text"),
      runtimeState(admin, ids.fallback, "ai_pdf_extract"),
    ]);
    assert(pdfPrimaryState?.circuit_state === "open", "PDF primary isolation fixture was unexpectedly closed.");
    assert(textPrimaryState?.circuit_state === "closed", "PDF health incorrectly disabled Blueprint text analysis.");
    assert(fallbackState?.circuit_state === "closed", "One profile failure incorrectly opened another profile circuit.");
    assert(
      !/cipher|secret|api_key|prompt|source_object|pdf_bytes/i.test(
        JSON.stringify([pdfPrimaryState, textPrimaryState, fallbackState]),
      ),
      "Runtime state returned credentials, source content, or raw provider data.",
    );
    console.log("PASS operation and provider circuit isolation preserve safe runtime-state metadata");
  } finally {
    if (policyIds.length) {
      await admin.from("ai_provider_routing_policies").delete().in("id", policyIds);
    }
    if (profileIds.length) {
      await admin.from("ai_provider_profiles").delete().in("id", profileIds);
    }
    if (organizationIds.length) {
      await admin.from("organizations").delete().in("id", organizationIds);
    }
    console.log("PASS routing/circuit smoke cleanup removed synthetic profiles, policies, runtime state, and organizations");
  }
}

await main();
