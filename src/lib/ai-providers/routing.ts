import "server-only";

import {
  describeAiPdfProviderInput,
  getAiProviderCapabilities,
  inferAiProviderMode,
  type AiProviderMode,
} from "@/lib/ai-providers/adapters";
import {
  AIProviderError,
  classifyAIProviderError,
  type AIProviderErrorOperation,
} from "@/lib/ai-providers/errors";
import {
  listEnabledAIProviderProfilesForServerUse,
  loadAIProviderProfileForServerUse,
  type SafeAIProviderProfile,
} from "@/lib/ai-providers/profiles";
import { requireAIProviderGatewayToken } from "@/lib/ai-providers/gateway-token";

type SupabaseRoutingClient = any;

export const AI_PROVIDER_ROUTING_OPERATION_KINDS = [
  "ai_pdf_extract",
  "blueprint_generate_questions",
  "blueprint_observe_pdf",
  "blueprint_analyze_text",
] as const;

export type AIProviderRoutingOperationKind =
  (typeof AI_PROVIDER_ROUTING_OPERATION_KINDS)[number];

export type AIProviderRoutingPolicy = {
  enabled: boolean;
  id: string;
  maxProfilesPerExecution: number;
  operationKind: AIProviderRoutingOperationKind;
  organizationId: string | null;
  policyVersion: number;
  providerProfileIds: string[];
  updatedAt: string;
};

type RuntimeState = {
  circuitState: "closed" | "open" | "half_open";
  consecutiveFailureCount: number;
  halfOpenLeaseExpiresAt: string | null;
  openUntil: string | null;
  providerProfileId: string;
};

export type AIProviderRouteCandidate = {
  mode: "normal" | "half_open_probe";
  profile: SafeAIProviderProfile;
  routeOrder: number;
};

export type AIProviderRoute = {
  candidates: AIProviderRouteCandidate[];
  operationKind: AIProviderRoutingOperationKind;
  policy: AIProviderRoutingPolicy | null;
  source: "default_profile" | "explicit_policy" | "requested_profile";
};

export type AIProviderRouteExecution<T> = {
  fallbackUsed: boolean;
  profile: Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>;
  value: T;
};

export type AIProviderRouteAttemptBudget = {
  candidateIndex: number;
  maxAttempts: number;
  maxTotalAttempts: number;
  remainingAttemptBudget: number;
};

// Keep fallback routing inside the existing PR4-I default retry ceiling. Each
// selected profile receives only a share of this budget, so fallbacks cannot
// multiply a single routed provider request into unbounded retries.
export const AI_PROVIDER_ROUTE_TOTAL_ATTEMPT_BUDGET = 4;

export class AIProviderRoutingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderRoutingConfigurationError";
  }
}

export class AIProviderRoutingSchemaMissingError extends Error {
  constructor() {
    super("AI provider routing setup is required before queued AI work can run.");
    this.name = "AIProviderRoutingSchemaMissingError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(3, Math.trunc(parsed)))
    : fallback;
}

function operationErrorOperation(
  operationKind: AIProviderRoutingOperationKind,
): AIProviderErrorOperation {
  return operationKind === "ai_pdf_extract" || operationKind === "blueprint_observe_pdf"
    ? "ai_pdf_extraction"
    : "blueprint_generation";
}

function isRoutingOperationKind(value: unknown): value is AIProviderRoutingOperationKind {
  return AI_PROVIDER_ROUTING_OPERATION_KINDS.includes(
    value as AIProviderRoutingOperationKind,
  );
}

function isRoutingSchemaError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("ai_provider_routing_") ||
    message.includes("ai_provider_runtime_states") ||
    message.includes("provider routing")
  );
}

function safePolicy(value: unknown): AIProviderRoutingPolicy | null {
  const record = asRecord(value);
  const operationKind = text(record.operation_kind);
  const id = text(record.id);

  if (!id || !isRoutingOperationKind(operationKind)) return null;

  const rawProfileIds = Array.isArray(record.provider_profile_ids)
    ? record.provider_profile_ids
    : [];
  const providerProfileIds = rawProfileIds
    .map(text)
    .filter((profileId): profileId is string => Boolean(profileId));

  return {
    enabled: record.enabled === true,
    id,
    maxProfilesPerExecution: boundedPositiveInteger(
      record.max_profiles_per_execution,
      2,
    ),
    operationKind,
    organizationId: text(record.organization_id),
    policyVersion: Math.max(1, Number(record.policy_version) || 1),
    providerProfileIds,
    updatedAt: text(record.updated_at) ?? "",
  };
}

function runtimeState(value: unknown): RuntimeState | null {
  const record = asRecord(value);
  const profileId = text(record.provider_profile_id);
  const circuitState = text(record.circuit_state);

  if (
    !profileId ||
    !["closed", "open", "half_open"].includes(circuitState ?? "")
  ) {
    return null;
  }

  return {
    circuitState: circuitState as RuntimeState["circuitState"],
    consecutiveFailureCount: Math.max(
      0,
      Math.trunc(Number(record.consecutive_failure_count) || 0),
    ),
    halfOpenLeaseExpiresAt: text(record.half_open_lease_expires_at),
    openUntil: text(record.open_until),
    providerProfileId: profileId,
  };
}

function timeIsFuture(value: string | null, now: Date) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function providerSupportsAIProviderRoutingOperation(
  profile: SafeAIProviderProfile,
  operationKind: AIProviderRoutingOperationKind,
) {
  const capabilities = getAiProviderCapabilities(profile);
  const pdfInput = describeAiPdfProviderInput(profile);
  const mode = inferAiProviderMode(profile);

  if (operationKind === "ai_pdf_extract") {
    return pdfInput.supported && pdfInput.implemented;
  }

  if (operationKind === "blueprint_observe_pdf") {
    return (
      pdfInput.implemented &&
      (pdfInput.strategy === "gemini_native_pdf" || pdfInput.strategy === "mock")
    );
  }

  if (operationKind === "blueprint_generate_questions") {
    return capabilities.supportsText && capabilities.supportsJsonMode;
  }

  // The existing analyzer uses the OpenAI-compatible chat-completions adapter.
  // Do not route it to Gemini Native merely because that profile can handle PDF.
  return (
    capabilities.supportsText &&
    capabilities.supportsJsonMode &&
    ["openai_compatible", "deepseek_openai", "gemini_openai"].includes(mode)
  );
}

function routeCandidatesFromPolicy({
  candidates,
  maxProfiles,
  now,
  runtimeStates,
}: {
  candidates: SafeAIProviderProfile[];
  maxProfiles: number;
  now: Date;
  runtimeStates: Map<string, RuntimeState>;
}) {
  const healthy: AIProviderRouteCandidate[] = [];
  const probes: AIProviderRouteCandidate[] = [];

  for (const [routeOrder, profile] of candidates.entries()) {
    const state = runtimeStates.get(profile.id);
    const open = state?.circuitState === "open";
    const halfOpen = state?.circuitState === "half_open";
    const unavailable =
      (open && timeIsFuture(state?.openUntil ?? null, now)) ||
      (halfOpen && timeIsFuture(state?.halfOpenLeaseExpiresAt ?? null, now));

    if (unavailable) continue;

    if (open || halfOpen) {
      probes.push({ mode: "half_open_probe", profile, routeOrder });
    } else {
      healthy.push({ mode: "normal", profile, routeOrder });
    }
  }

  return [...healthy, ...probes].slice(0, maxProfiles);
}

async function readRoutingPolicy({
  operationKind,
  organizationId,
  supabase,
}: {
  operationKind: AIProviderRoutingOperationKind;
  organizationId: string;
  supabase: SupabaseRoutingClient;
}) {
  const query = (organizationId: string | null) => {
    let request = supabase
      .from("ai_provider_routing_policies")
      .select(
        "id, organization_id, operation_kind, enabled, max_profiles_per_execution, policy_version, updated_at, ai_provider_routing_policy_members(provider_profile_id, route_order)",
      )
      .eq("operation_kind", operationKind);

    request = organizationId
      ? request.eq("organization_id", organizationId)
      : request.is("organization_id", null);

    return request.maybeSingle();
  };

  const scoped = await query(organizationId);
  if (isRoutingSchemaError(scoped.error)) throw new AIProviderRoutingSchemaMissingError();
  if (scoped.error) throw new Error(scoped.error.message);

  const scopedPolicy = asRecord(scoped.data);
  if (scoped.data) {
    return {
      ...scopedPolicy,
      provider_profile_ids: (Array.isArray(
        scopedPolicy.ai_provider_routing_policy_members,
      )
        ? scopedPolicy.ai_provider_routing_policy_members
        : [])
        .sort(
          (left, right) =>
            Number(asRecord(left).route_order) - Number(asRecord(right).route_order),
        )
        .map((member) => asRecord(member).provider_profile_id),
    };
  }

  const shared = await query(null);
  if (isRoutingSchemaError(shared.error)) throw new AIProviderRoutingSchemaMissingError();
  if (shared.error) throw new Error(shared.error.message);
  if (!shared.data) return null;

  const sharedPolicy = asRecord(shared.data);
  return {
    ...sharedPolicy,
    provider_profile_ids: (Array.isArray(
      sharedPolicy.ai_provider_routing_policy_members,
    )
      ? sharedPolicy.ai_provider_routing_policy_members
      : [])
      .sort(
        (left, right) =>
          Number(asRecord(left).route_order) - Number(asRecord(right).route_order),
      )
      .map((member) => asRecord(member).provider_profile_id),
  };
}

async function readRuntimeStates({
  operationKind,
  profileIds,
  supabase,
}: {
  operationKind: AIProviderRoutingOperationKind;
  profileIds: string[];
  supabase: SupabaseRoutingClient;
}) {
  if (!profileIds.length) return new Map<string, RuntimeState>();

  const { data, error } = await supabase.rpc(
    "list_ai_provider_runtime_states_for_worker",
    {
      p_operation_kind: operationKind,
      p_provider_profile_ids: profileIds,
    },
  );
  if (isRoutingSchemaError(error)) throw new AIProviderRoutingSchemaMissingError();
  if (error) throw new Error(error.message);

  return new Map(
    (Array.isArray(data) ? data : [])
      .map(runtimeState)
      .filter((state): state is RuntimeState => Boolean(state))
      .map((state) => [state.providerProfileId, state]),
  );
}

export async function listAIProviderRoutingPoliciesForGateway(
  supabase: SupabaseRoutingClient,
) {
  const { data, error } = await supabase.rpc(
    "list_ai_provider_routing_policies_for_gateway",
    { gateway_token: requireAIProviderGatewayToken() },
  );
  if (isRoutingSchemaError(error)) throw new AIProviderRoutingSchemaMissingError();
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : [])
    .map(safePolicy)
    .filter((policy): policy is AIProviderRoutingPolicy => Boolean(policy));
}

export async function upsertAIProviderRoutingPolicyForGateway({
  enabled,
  maxProfilesPerExecution,
  operationKind,
  providerProfileIds,
  supabase,
}: {
  enabled: boolean;
  maxProfilesPerExecution: number;
  operationKind: AIProviderRoutingOperationKind;
  providerProfileIds: string[];
  supabase: SupabaseRoutingClient;
}) {
  const { data, error } = await supabase.rpc(
    "upsert_ai_provider_routing_policy_for_gateway",
    {
      gateway_token: requireAIProviderGatewayToken(),
      p_enabled: enabled,
      p_max_profiles_per_execution: Math.max(
        1,
        Math.min(3, Math.trunc(maxProfilesPerExecution)),
      ),
      p_operation_kind: operationKind,
      p_organization_id: null,
      p_provider_profile_ids: providerProfileIds,
    },
  );
  if (isRoutingSchemaError(error)) throw new AIProviderRoutingSchemaMissingError();
  if (error) throw new Error(error.message);
  return text(data);
}

export async function resolveAIProviderRoute({
  now = new Date(),
  operationKind,
  organizationId,
  requestedProfileId = null,
  supabase,
}: {
  now?: Date;
  operationKind: AIProviderRoutingOperationKind;
  organizationId: string;
  requestedProfileId?: string | null;
  supabase: SupabaseRoutingClient;
}): Promise<AIProviderRoute> {
  if (!organizationId) {
    throw new AIProviderRoutingConfigurationError(
      "AI provider routing requires an organization-scoped job.",
    );
  }

  const [rawPolicy, profiles] = await Promise.all([
    readRoutingPolicy({ operationKind, organizationId, supabase }),
    listEnabledAIProviderProfilesForServerUse(supabase),
  ]);
  const policy = safePolicy(rawPolicy);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));

  let source: AIProviderRoute["source"];
  let configuredCandidates: SafeAIProviderProfile[];
  let maxProfiles: number;

  if (policy) {
    if (!policy.enabled) {
      throw new AIProviderRoutingConfigurationError(
        "This AI operation is disabled by its administrator routing policy.",
      );
    }

    source = "explicit_policy";
    maxProfiles = policy.maxProfilesPerExecution;
    configuredCandidates = policy.providerProfileIds
      .map((profileId) => byId.get(profileId))
      .filter((profile): profile is SafeAIProviderProfile => Boolean(profile));
  } else if (requestedProfileId) {
    source = "requested_profile";
    maxProfiles = 1;
    configuredCandidates = [byId.get(requestedProfileId)].filter(
      (profile): profile is SafeAIProviderProfile => Boolean(profile),
    );
  } else {
    source = "default_profile";
    maxProfiles = 1;
    configuredCandidates = profiles.filter((profile) => profile.is_default);
  }

  const compatibleCandidates = configuredCandidates.filter((profile) =>
    providerSupportsAIProviderRoutingOperation(profile, operationKind),
  );

  if (!compatibleCandidates.length) {
    throw new AIProviderRoutingConfigurationError(
      "No explicitly configured provider route can safely run this AI operation.",
    );
  }

  const runtimeStates = await readRuntimeStates({
    operationKind,
    profileIds: compatibleCandidates.map((profile) => profile.id),
    supabase,
  });
  const candidates = routeCandidatesFromPolicy({
    candidates: compatibleCandidates,
    maxProfiles,
    now,
    runtimeStates,
  });

  if (!candidates.length) {
    throw new AIProviderError({
      code: "provider_busy",
      operation: operationErrorOperation(operationKind),
      retryable: true,
      safeMessage:
        "AI providers for this operation are temporarily recovering. Your work is safe and will retry automatically.",
    });
  }

  return { candidates, operationKind, policy, source };
}

function circuitEligibleError(error: unknown, operationKind: AIProviderRoutingOperationKind) {
  const classified = classifyAIProviderError({
    error,
    operation: operationErrorOperation(operationKind),
  });
  return {
    classified,
    eligible: [
      "provider_busy",
      "provider_rate_limited",
      "provider_timeout",
      "provider_network_error",
    ].includes(classified.code),
  };
}

async function acquireHalfOpenProbe({
  candidate,
  leaseOwner,
  operationKind,
  supabase,
}: {
  candidate: AIProviderRouteCandidate;
  leaseOwner: string;
  operationKind: AIProviderRoutingOperationKind;
  supabase: SupabaseRoutingClient;
}) {
  if (candidate.mode !== "half_open_probe") return true;
  const { data, error } = await supabase.rpc(
    "acquire_ai_provider_half_open_probe",
    {
      p_lease_owner: leaseOwner,
      p_operation_kind: operationKind,
      p_provider_profile_id: candidate.profile.id,
    },
  );
  if (isRoutingSchemaError(error)) throw new AIProviderRoutingSchemaMissingError();
  if (error) throw new Error(error.message);
  return data === true;
}

async function recordRouteOutcome({
  candidate,
  circuitEligible,
  leaseOwner,
  operationKind,
  safeErrorCode,
  success,
  supabase,
}: {
  candidate: AIProviderRouteCandidate;
  circuitEligible: boolean;
  leaseOwner: string | null;
  operationKind: AIProviderRoutingOperationKind;
  safeErrorCode?: string | null;
  success: boolean;
  supabase: SupabaseRoutingClient;
}) {
  const { error } = await supabase.rpc("record_ai_provider_route_outcome", {
    p_circuit_eligible: circuitEligible,
    p_operation_kind: operationKind,
    p_probe_lease_owner:
      candidate.mode === "half_open_probe" ? leaseOwner : null,
    p_provider_profile_id: candidate.profile.id,
    p_safe_error_code: safeErrorCode ?? null,
    p_success: success,
  });
  if (isRoutingSchemaError(error)) throw new AIProviderRoutingSchemaMissingError();
  if (error) throw new Error(error.message);
}

export async function runWithAIProviderRoute<T>({
  execute,
  leaseOwner,
  maxTotalAttempts = AI_PROVIDER_ROUTE_TOTAL_ATTEMPT_BUDGET,
  route,
  supabase,
}: {
  execute: (
    profile: Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>,
    attemptBudget: AIProviderRouteAttemptBudget,
  ) => Promise<T>;
  leaseOwner: string;
  maxTotalAttempts?: number;
  route: AIProviderRoute;
  supabase: SupabaseRoutingClient;
}): Promise<AIProviderRouteExecution<T>> {
  let lastError: unknown = null;
  const totalAttemptBudget = Math.max(
    1,
    Math.min(AI_PROVIDER_ROUTE_TOTAL_ATTEMPT_BUDGET, Math.trunc(maxTotalAttempts)),
  );
  let remainingAttemptBudget = totalAttemptBudget;
  const executableCandidates = route.candidates.slice(0, totalAttemptBudget);

  for (const [candidateIndex, candidate] of executableCandidates.entries()) {
    const candidateLeaseOwner = `${leaseOwner}:${candidate.profile.id}`.slice(0, 160);
    const acquired = await acquireHalfOpenProbe({
      candidate,
      leaseOwner: candidateLeaseOwner,
      operationKind: route.operationKind,
      supabase,
    });
    if (!acquired) continue;

    // Reserve at least one attempt for every remaining configured candidate.
    // A skipped half-open candidate does not consume budget, but an executed
    // primary cannot leave every fallback with the full PR4-I retry ceiling.
    const remainingCandidates = executableCandidates.length - candidateIndex - 1;
    const maxAttempts = Math.max(1, remainingAttemptBudget - remainingCandidates);
    remainingAttemptBudget = Math.max(0, remainingAttemptBudget - maxAttempts);

    try {
      const profile = await loadAIProviderProfileForServerUse({
        profileId: candidate.profile.id,
        supabase,
      });
      const value = await execute(profile, {
        candidateIndex,
        maxAttempts,
        maxTotalAttempts: totalAttemptBudget,
        remainingAttemptBudget,
      });
      await recordRouteOutcome({
        candidate,
        circuitEligible: false,
        leaseOwner: candidateLeaseOwner,
        operationKind: route.operationKind,
        success: true,
        supabase,
      });
      return {
        fallbackUsed: candidate.routeOrder > 0,
        profile,
        value,
      };
    } catch (error) {
      const { classified, eligible } = circuitEligibleError(
        error,
        route.operationKind,
      );
      await recordRouteOutcome({
        candidate,
        circuitEligible: eligible,
        leaseOwner: candidateLeaseOwner,
        operationKind: route.operationKind,
        safeErrorCode: classified.code,
        success: false,
        supabase,
      }).catch(() => undefined);
      lastError = error;

      if (!eligible) throw error;
    }
  }

  if (lastError) throw lastError;

  throw new AIProviderError({
    code: "provider_busy",
    operation: operationErrorOperation(route.operationKind),
    retryable: true,
    safeMessage:
      "AI providers for this operation are temporarily recovering. Your work is safe and will retry automatically.",
  });
}

export function aiProviderRoutingOperationLabel(
  operationKind: AIProviderRoutingOperationKind,
) {
  const labels: Record<AIProviderRoutingOperationKind, string> = {
    ai_pdf_extract: "AI PDF extraction",
    blueprint_analyze_text: "Blueprint text analysis",
    blueprint_generate_questions: "Blueprint question generation",
    blueprint_observe_pdf: "Blueprint PDF observation",
  };
  return labels[operationKind];
}

export function providerModeForRoute(profile: SafeAIProviderProfile): AiProviderMode {
  return inferAiProviderMode(profile);
}
