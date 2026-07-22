import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import pg from "pg";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), "..");

const requiredLocalGate = "CONFIRMED";
const checkpointLocalOnly =
  process.env.PDF50_LOCAL_CHECKPOINT_REHEARSAL === requiredLocalGate &&
  process.env.PDF50_LOCALHOST_ONLY === requiredLocalGate &&
  process.env.PDF50_FAKE_PROVIDER_ONLY === requiredLocalGate;

const localHosts = new Set(["127.0.0.1", "localhost"]);
const localAllowedEnvNames = new Set([
  "PDF50_LOCAL_CHECKPOINT_REHEARSAL",
  "PDF50_LOCALHOST_ONLY",
  "PDF50_FAKE_PROVIDER_ONLY",
  "PDF50_LOCAL_DATABASE_URL",
  "PDF50_LOCAL_API_URL",
  "PDF50_LOCAL_SUPABASE_DIR",
]);
const localDbEnvNamePattern =
  /^(PDF50_|SUPABASE_|DATABASE_URL$|DIRECT_URL$|POSTGRES(?:_|$)|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SSLMODE|SERVICE|CONNECT_TIMEOUT)$|NEXT_PUBLIC_SUPABASE_)/;
const localProviderEnvNamePattern =
  /(?:GEMINI|VERTEX|DEEPSEEK|OCR|EMBEDDING|EMBEDDINGS|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_APPLICATION_CREDENTIALS)/i;
const localRemotePattern = new RegExp(
  [
    ["supabase", "co"].join("\\."),
    ["pooler", "supabase", "com"].join("\\."),
  ].join("|"),
  "i",
);
const localNonLocalHttpPattern =
  /https?:\/\/(?!localhost(?::|\/|$)|127\.0\.0\.1(?::|\/|$))[^/\s]+/i;

function localBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function localSignJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = localBase64Url(JSON.stringify(header));
  const encodedPayload = localBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function localToken({ role, secret, sub = role }) {
  const now = Math.floor(Date.now() / 1000);
  return localSignJwt({
    aud: role === "anon" ? "anon" : "authenticated",
    exp: now + 60 * 60,
    iat: now - 10,
    iss: "supabase",
    role,
    sub,
  }, secret);
}

function localDocker(args) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function validateCheckpointLocalEnvironment() {
  for (const [name, value] of Object.entries(process.env)) {
    if (localAllowedEnvNames.has(name)) continue;
    if (localDbEnvNamePattern.test(name)) throw new Error("Forbidden database/API environment variable is present.");
    if (localProviderEnvNamePattern.test(name) && value) throw new Error("Provider environment variable is present.");
    if (localRemotePattern.test(value ?? "") || localNonLocalHttpPattern.test(value ?? "")) {
      throw new Error("Forbidden non-local URL environment value is present.");
    }
  }
  assert(process.env.PDF50_LOCAL_DATABASE_URL, "PDF50_LOCAL_DATABASE_URL is required.");
  assert(process.env.PDF50_LOCAL_API_URL, "PDF50_LOCAL_API_URL is required.");
  assert(process.env.PDF50_LOCAL_SUPABASE_DIR, "PDF50_LOCAL_SUPABASE_DIR is required.");
  const databaseUrl = new URL(process.env.PDF50_LOCAL_DATABASE_URL);
  const apiUrl = new URL(process.env.PDF50_LOCAL_API_URL);
  assert(["postgres:", "postgresql:"].includes(databaseUrl.protocol), "Local database URL has an unsupported protocol.");
  assert(localHosts.has(databaseUrl.hostname) && databaseUrl.port === "54322", "Local database URL must target localhost port 54322.");
  assert(["http:", "https:"].includes(apiUrl.protocol), "Local API URL has an unsupported protocol.");
  assert(localHosts.has(apiUrl.hostname), "Local API URL must use localhost or 127.0.0.1.");
  return { apiUrl: apiUrl.toString(), databaseUrl: databaseUrl.toString() };
}

function localJwtSecret() {
  const names = localDocker(["ps", "--format", "{{.Names}}"]);
  assert(names.split(/\r?\n/).includes("supabase_db_o2i_pdf50_local_rehearsal"), "Local Supabase DB container is not running.");
  const secret = localDocker(["exec", "supabase_db_o2i_pdf50_local_rehearsal", "printenv", "JWT_SECRET"]);
  assert(secret.length >= 32, "Local JWT secret was unavailable.");
  return secret;
}

function localClient(apiUrl, token, apiKey = token) {
  return createClient(apiUrl, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function localPg(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  await client.query("set default_transaction_read_only = off");
  await client.query("set transaction_read_only = off");
  await client.query("set statement_timeout = '120s'");
  await client.query("set lock_timeout = '15s'");
  return client;
}

function localProfile({ id, organizationId, textOnly = false, disabled = false, archived = false }) {
  return {
    api_key_last4: "0000",
    base_url: textOnly ? `mock://ai-text/${id}` : `mock://ai-pdf-import/${id}`,
    deleted_at: archived ? new Date().toISOString() : null,
    enabled: !disabled,
    id,
    is_default: false,
    model: textOnly ? "synthetic-text" : "synthetic-pdf",
    mode: "standard",
    name: `local routing smoke ${id.slice(0, 8)}`,
    organization_id: organizationId,
    provider: textOnly ? "deepseek" : "compatible",
    supports_pdf_input: !textOnly,
    supports_vision_images: !textOnly,
  };
}

async function createLocalAuthUser(admin, runId, label, registry) {
  const email = `${runId}-${label}-${randomUUID().slice(0, 8)}@local.invalid`;
  const password = `Local-${randomUUID()}-Only!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { localProviderChaosSmoke: true, runId },
  });
  assert(!error && data?.user?.id, `Local ${label} user creation failed.`);
  registry.userIds.push(data.user.id);
  return { email, id: data.user.id };
}

async function runLocalCheckpointChaos() {
  const env = validateCheckpointLocalEnvironment();
  const secret = localJwtSecret();
  const runId = `provider-chaos-local-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const serviceToken = localToken({ role: "service_role", secret, sub: "service-role" });
  const anonToken = localToken({ role: "anon", secret });
  const admin = localClient(env.apiUrl, serviceToken, serviceToken);
  const sql = await localPg(env.databaseUrl);
  const registry = {
    gatewayHash: null,
    organizationIds: [],
    policyIds: [],
    profileIds: [],
    userIds: [],
  };

  try {
    const [superAdmin, teacher, unrelatedTeacher, student] = await Promise.all([
      createLocalAuthUser(admin, runId, "super-admin", registry),
      createLocalAuthUser(admin, runId, "teacher", registry),
      createLocalAuthUser(admin, runId, "unrelated-teacher", registry),
      createLocalAuthUser(admin, runId, "student", registry),
    ]);
    const testOrganizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    registry.organizationIds.push(testOrganizationId, otherOrganizationId);
    await sql.query("begin");
    await sql.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await sql.query(
      "insert into public.organizations (id, name, slug, status) values ($1, $2, $3, 'active'), ($4, $5, $6, 'active')",
      [testOrganizationId, `Local routing smoke ${runId}`, `${runId}-org`, otherOrganizationId, `Local routing other ${runId}`, `${runId}-other`],
    );
    for (const [user, role, organizationId] of [
      [superAdmin, "super_admin", testOrganizationId],
      [teacher, "teacher", testOrganizationId],
      [unrelatedTeacher, "teacher", otherOrganizationId],
      [student, "student", testOrganizationId],
    ]) {
      await sql.query(
        `insert into public.profiles (id, email, role, status, default_organization_id, display_name)
         values ($1, $2, $3, 'active', $4, $5)`,
        [user.id, user.email, role, organizationId, `Local ${role}`],
      );
      if (role !== "super_admin") {
        await sql.query(
          "insert into public.organization_members (organization_id, user_id, role, status) values ($1, $2, $3, 'active')",
          [organizationId, user.id, role === "student" ? "student" : "teacher"],
        );
      }
    }
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
      localProfile({ id: ids.primary, organizationId: testOrganizationId }),
      localProfile({ id: ids.fallback, organizationId: testOrganizationId }),
      localProfile({ id: ids.textOnly, organizationId: testOrganizationId, textOnly: true }),
      localProfile({ id: ids.recover, organizationId: testOrganizationId }),
      localProfile({ id: ids.reopen, organizationId: testOrganizationId }),
      localProfile({ id: ids.disabled, organizationId: testOrganizationId, disabled: true }),
      localProfile({ id: ids.archived, organizationId: testOrganizationId, archived: true }),
      localProfile({ id: ids.wrongScope, organizationId: otherOrganizationId }),
    ];
    registry.profileIds.push(...profiles.map((profile) => profile.id));
    for (const profile of profiles) {
      await sql.query(
        `insert into public.ai_provider_profiles (
          id, organization_id, name, provider, base_url, model, mode, api_key_last4,
          enabled, is_default, supports_pdf_input, supports_vision_images, deleted_at,
          created_by, updated_by
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
        [
          profile.id,
          profile.organization_id,
          profile.name,
          profile.provider,
          profile.base_url,
          profile.model,
          profile.mode,
          profile.api_key_last4,
          profile.enabled,
          profile.is_default,
          profile.supports_pdf_input,
          profile.supports_vision_images,
          profile.deleted_at,
          superAdmin.id,
        ],
      );
    }
    await sql.query("commit");

    const gatewayToken = `local-gateway-${randomUUID()}`;
    registry.gatewayHash = createHash("sha256").update(gatewayToken).digest("hex");
    const setup = await admin.rpc("setup_ai_provider_gateway_token_hash", {
      token_hash: registry.gatewayHash,
      token_label: runId,
    });
    assert(!setup.error, `Local gateway setup failed: ${summarize(setup.error)}`);

    const superAdminClient = localClient(
      env.apiUrl,
      localToken({ role: "authenticated", secret, sub: superAdmin.id }),
      anonToken,
    );
    const teacherClient = localClient(
      env.apiUrl,
      localToken({ role: "authenticated", secret, sub: teacher.id }),
      anonToken,
    );
    const unrelatedClient = localClient(
      env.apiUrl,
      localToken({ role: "authenticated", secret, sub: unrelatedTeacher.id }),
      anonToken,
    );
    const studentClient = localClient(
      env.apiUrl,
      localToken({ role: "authenticated", secret, sub: student.id }),
      anonToken,
    );

    const upsertPolicy = async (profileIdsForPolicy, operationKind = "ai_pdf_extract") => {
      const { data, error } = await superAdminClient.rpc(
        "upsert_ai_provider_routing_policy_for_gateway",
        {
          gateway_token: gatewayToken,
          p_enabled: true,
          p_max_profiles_per_execution: Math.min(3, profileIdsForPolicy.length),
          p_operation_kind: operationKind,
          p_organization_id: testOrganizationId,
          p_provider_profile_ids: profileIdsForPolicy,
        },
      );
      return { data, error };
    };

    for (const blockedProfileId of [ids.disabled, ids.archived, ids.wrongScope]) {
      const { error } = await upsertPolicy([blockedProfileId]);
      assert(error, "Routing policy accepted a disabled, archived, or wrong-scope local profile.");
    }
    console.log("PASS local routing policy rejects disabled, archived, and wrong-scope profiles");

    const { data: policyId, error: policyError } = await upsertPolicy([ids.primary, ids.fallback]);
    assert(!policyError && policyId, `Local super-admin policy save failed: ${summarize(policyError)}`);
    registry.policyIds.push(policyId);

    const { data: listedPolicies, error: listedPoliciesError } = await superAdminClient.rpc(
      "list_ai_provider_routing_policies_for_gateway",
      { gateway_token: gatewayToken },
    );
    assert(!listedPoliciesError, `Local policy list failed: ${summarize(listedPoliciesError)}`);
    const listedPolicy = (listedPolicies ?? []).find((policy) => policy.id === policyId);
    assert(
      JSON.stringify(listedPolicy?.provider_profile_ids) === JSON.stringify([ids.primary, ids.fallback]),
      "Local policy list did not preserve configured provider order.",
    );
    assert(!/cipher|secret|api_key|prompt|source/i.test(JSON.stringify(listedPolicy)), "Local policy list exposed unsafe material.");
    console.log("PASS local super-admin saves ordered, safe routing policy metadata");

    for (const actor of [teacherClient, unrelatedClient, studentClient]) {
      const { data, error } = await actor
        .from("ai_provider_routing_policies")
        .select("id")
        .eq("id", policyId);
      assert(!error && !(data ?? []).length, "Local requester read a protected routing policy row.");
      const workerState = await actor.rpc("list_ai_provider_runtime_states_for_worker", {
        p_operation_kind: "ai_pdf_extract",
        p_provider_profile_ids: [ids.primary],
      });
      assert(workerState.error || !(workerState.data ?? []).length, "Local requester read service-role-only circuit state.");
    }
    console.log("PASS local teacher, unrelated teacher, and student cannot read routing or circuit state");

    await recordOutcome(admin, { operationKind: "ai_pdf_extract", profileId: ids.primary, success: true });
    const healthyState = await runtimeState(admin, ids.primary, "ai_pdf_extract");
    assert(healthyState?.circuit_state === "closed", "Local healthy provider did not remain closed.");

    const routingProfiles = profiles
      .filter((profile) => profile.enabled && !profile.deleted_at)
      .map(({ deleted_at, organization_id, ...profile }) => ({
        ...profile,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    const initialRoute = {
      candidates: (listedPolicy?.provider_profile_ids ?? [])
        .map((profileId) => routingProfiles.find((profile) => profile.id === profileId))
        .filter((profile) => profile?.supports_pdf_input && profile?.supports_vision_images)
        .map((profile, routeOrder) => ({ profile, routeOrder })),
      operationKind: "ai_pdf_extract",
      source: "local_policy_rpc",
    };
    assert(
      initialRoute.candidates.map((candidate) => candidate.profile.id).join(",") === `${ids.primary},${ids.fallback}`,
      "Local route did not select configured primary/fallback order.",
    );
    const attempts = [];
    let fallbackResult = null;
    for (const [candidateIndex, candidate] of initialRoute.candidates.entries()) {
      const budget = {
        candidateIndex,
        maxAttempts: candidateIndex === 0 ? 3 : 1,
        maxTotalAttempts: 4,
        remainingAttemptBudget: candidateIndex === 0 ? 4 : 1,
      };
      try {
        const value = await (async (profile, attemptBudget) => {
          attempts.push({ id: profile.id, maxAttempts: attemptBudget.maxAttempts });
          if (profile.id === ids.primary) throw Object.assign(new Error("synthetic local availability failure"), { status: 503 });
          return "private-review-handoff";
        })(candidate.profile, budget);
        fallbackResult = { fallbackUsed: candidateIndex > 0, profile: candidate.profile, value };
        break;
      } catch (error) {
        if (candidateIndex === initialRoute.candidates.length - 1) throw error;
      }
    }
    assert(fallbackResult.value === "private-review-handoff" && fallbackResult.fallbackUsed, "Local fallback did not complete.");
    assert(
      JSON.stringify(attempts) === JSON.stringify([{ id: ids.primary, maxAttempts: 3 }, { id: ids.fallback, maxAttempts: 1 }]),
      "Local fallback did not receive the bounded retry budget.",
    );
    await recordOutcome(admin, { operationKind: "ai_pdf_extract", profileId: ids.fallback, success: true });
    console.log("PASS local primary/fallback routing uses one bounded attempt budget without a provider call");

    for (const profileId of [ids.primary, ids.recover, ids.reopen]) {
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
    await sql.query(
      "update private.ai_provider_runtime_states set open_until = now() - interval '1 second' where provider_profile_id = any($1::uuid[])",
      [[ids.recover, ids.reopen]],
    );
    const recoveryOwners = Array.from({ length: 5 }, (_, index) => `local-routing-recover-${index + 1}-${runId}`);
    const recoveryClaims = await Promise.all(recoveryOwners.map((owner) => acquireProbe(admin, ids.recover, "ai_pdf_extract", owner)));
    assert(recoveryClaims.filter(Boolean).length === 1, "Exactly one local worker must win the half-open probe.");
    const recoveryOwner = recoveryOwners[recoveryClaims.findIndex(Boolean)];
    const staleOutcome = await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      probeLeaseOwner: `${recoveryOwner}-stale`,
      profileId: ids.recover,
      safeErrorCode: "provider_busy",
      success: false,
    });
    assert(staleOutcome === false, "Local stale half-open lease owner updated circuit state.");
    const recovered = await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      probeLeaseOwner: recoveryOwner,
      profileId: ids.recover,
      success: true,
    });
    assert(recovered === true, "Local valid half-open success was rejected.");
    const recoveredState = await runtimeState(admin, ids.recover, "ai_pdf_extract");
    assert(recoveredState?.circuit_state === "closed", "Local half-open success did not close the circuit.");

    const reopenOwners = Array.from({ length: 4 }, (_, index) => `local-routing-reopen-${index + 1}-${runId}`);
    const reopenClaims = await Promise.all(reopenOwners.map((owner) => acquireProbe(admin, ids.reopen, "ai_pdf_extract", owner)));
    assert(reopenClaims.filter(Boolean).length === 1, "Exactly one local worker must win the failing half-open probe.");
    const reopenOwner = reopenOwners[reopenClaims.findIndex(Boolean)];
    const reopened = await recordOutcome(admin, {
      operationKind: "ai_pdf_extract",
      probeLeaseOwner: reopenOwner,
      profileId: ids.reopen,
      safeErrorCode: "provider_busy",
      success: false,
    });
    assert(reopened === true, "Local valid half-open failure was rejected.");
    const reopenedState = await runtimeState(admin, ids.reopen, "ai_pdf_extract");
    assert(reopenedState?.circuit_state === "open", "Local half-open failure did not reopen the circuit.");
    console.log("PASS local closed/open/half-open, atomic probe, stale lease, recovery, and reopen validation");

    await recordOutcome(admin, { operationKind: "blueprint_analyze_text", profileId: ids.primary, success: true });
    const [pdfPrimaryState, textPrimaryState, fallbackState] = await Promise.all([
      runtimeState(admin, ids.primary, "ai_pdf_extract"),
      runtimeState(admin, ids.primary, "blueprint_analyze_text"),
      runtimeState(admin, ids.fallback, "ai_pdf_extract"),
    ]);
    assert(pdfPrimaryState?.circuit_state === "open", "Local PDF primary isolation fixture was unexpectedly closed.");
    assert(textPrimaryState?.circuit_state === "closed", "Local PDF health incorrectly disabled text analysis.");
    assert(fallbackState?.circuit_state === "closed", "Local profile failure incorrectly opened fallback circuit.");
    assert(
      !/cipher|secret|api_key|prompt|source_object|pdf_bytes/i.test(JSON.stringify([pdfPrimaryState, textPrimaryState, fallbackState])),
      "Local runtime state returned unsafe material.",
    );
    console.log("PASS local operation/provider circuit isolation preserves safe runtime-state metadata");
  } finally {
    await sql.query("begin").catch(() => undefined);
    try {
      if (registry.policyIds.length) {
        await sql.query("delete from public.ai_provider_routing_policies where id = any($1::uuid[])", [registry.policyIds]);
      }
      if (registry.profileIds.length) {
        await sql.query("delete from private.ai_provider_runtime_states where provider_profile_id = any($1::uuid[])", [registry.profileIds]);
        await sql.query("delete from public.ai_provider_profiles where id = any($1::uuid[])", [registry.profileIds]);
      }
      if (registry.gatewayHash) {
        await sql.query("delete from private.ai_provider_gateway_token_hashes where token_hash = $1", [registry.gatewayHash]);
      }
      if (registry.organizationIds.length || registry.userIds.length) {
        await sql.query("delete from public.organization_members where organization_id = any($1::uuid[]) or user_id = any($2::uuid[])", [registry.organizationIds, registry.userIds]);
        await sql.query("delete from public.profiles where id = any($1::uuid[])", [registry.userIds]);
        await sql.query("delete from public.organizations where id = any($1::uuid[])", [registry.organizationIds]);
      }
      await sql.query("commit");
    } catch (error) {
      await sql.query("rollback").catch(() => undefined);
      throw error;
    }
    for (const userId of registry.userIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    const residue = await sql.query(
      `select
        (select count(*)::int from auth.users where id = any($1::uuid[])) as auth_count,
        (select count(*)::int from public.organizations where id = any($2::uuid[])) as organization_count,
        (select count(*)::int from public.ai_provider_profiles where id = any($3::uuid[])) as profile_count,
        (select count(*)::int from public.ai_provider_routing_policies where id = any($4::uuid[])) as policy_count`,
      [registry.userIds, registry.organizationIds, registry.profileIds, registry.policyIds],
    );
    await sql.end();
    const row = residue.rows[0] ?? {};
    assert(
      Number(row.auth_count) + Number(row.organization_count) + Number(row.profile_count) + Number(row.policy_count) === 0,
      "Local routing/circuit smoke cleanup left residue.",
    );
    console.log("PASS local routing/circuit smoke cleanup removed exact synthetic rows");
  }
}

if (checkpointLocalOnly) {
  await runLocalCheckpointChaos();
  process.exit(0);
}

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
