"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  encryptedKeyPatch,
  listSafeAIProviderProfiles,
} from "@/lib/ai-providers/profiles";
import {
  providerSupportsAIProviderRoutingOperation,
  upsertAIProviderRoutingPolicyForGateway,
} from "@/lib/ai-providers/routing";
import { decryptSecret } from "@/lib/ai-providers/encryption";
import { requireAIProviderGatewayToken } from "@/lib/ai-providers/gateway-token";
import { testAIProviderConnection } from "@/lib/ai-providers/chat";
import { createClient } from "@/lib/supabase/server";
import type { AIProviderProfile } from "@/types/database";
import {
  aiProviderProfileDeleteSchema,
  aiProviderProfileFormSchema,
  aiProviderRoutingPolicyFormSchema,
  aiProviderProfileUpdateSchema,
} from "@/lib/validations/ai-provider";

const path = "/admin/ai-settings";

function boundedInteger(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.trunc(parsed)))
    : fallback;
}

function checkboxValue(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function formValues(formData: FormData) {
  return {
    ...Object.fromEntries(formData),
    enabled: checkboxValue(formData, "enabled"),
    is_default: checkboxValue(formData, "is_default"),
    supports_pdf_input: checkboxValue(formData, "supports_pdf_input"),
    supports_vision_images: checkboxValue(formData, "supports_vision_images"),
  };
}

function requireApiKey(value: string | undefined) {
  const apiKey = value?.trim();

  if (!apiKey) {
    throw new Error("API key is required to test a new provider connection.");
  }

  return apiKey;
}

async function loadSavedProvider({
  id,
  supabase,
}: {
  id: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data, error } = await supabase.rpc(
    "get_ai_provider_profile_for_gateway",
    {
      gateway_token: requireAIProviderGatewayToken(),
      profile_id: id,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const profile = (Array.isArray(data) ? data[0] : data) as AIProviderProfile | null;

  if (!profile) {
    throw new Error("AI provider profile is not available.");
  }

  return profile;
}

export async function createAIProviderProfile(formData: FormData) {
  try {
    const profile = await requireSuperAdmin();
    const parsed = aiProviderProfileFormSchema.parse(formValues(formData));
    const supabase = await createClient();
    const encrypted = encryptedKeyPatch(parsed.api_key);

    void profile;
    const { error } = await supabase.rpc("create_ai_provider_profile_for_gateway", {
      gateway_token: requireAIProviderGatewayToken(),
      profile_api_key_ciphertext: encrypted.api_key_ciphertext ?? null,
      profile_api_key_iv: encrypted.api_key_iv ?? null,
      profile_api_key_last4: encrypted.api_key_last4 ?? null,
      profile_api_key_tag: encrypted.api_key_tag ?? null,
      profile_base_url: parsed.base_url,
      profile_enabled: parsed.enabled,
      profile_is_default: parsed.is_default,
      profile_model: parsed.model,
      profile_name: parsed.name,
      profile_provider: parsed.provider,
      profile_supports_pdf_input: parsed.supports_pdf_input,
      profile_supports_vision_images: parsed.supports_vision_images,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "AI provider profile created.");
}

export async function testNewAIProviderConnection(formData: FormData) {
  try {
    await requireSuperAdmin();
    const parsed = aiProviderProfileFormSchema.parse(formValues(formData));
    const result = await testAIProviderConnection({
      apiKey: requireApiKey(parsed.api_key),
      base_url: parsed.base_url,
      model: parsed.model,
      name: parsed.name,
      provider: parsed.provider,
    });

    return result;
  } catch (error) {
    return {
      error: formatActionError(error),
      ok: false as const,
    };
  }
}

export async function updateAIProviderProfile(formData: FormData) {
  try {
    const profile = await requireSuperAdmin();
    const parsed = aiProviderProfileUpdateSchema.parse(formValues(formData));
    const supabase = await createClient();
    const encrypted = encryptedKeyPatch(parsed.api_key);

    void profile;
    const { error } = await supabase.rpc("update_ai_provider_profile_for_gateway", {
      gateway_token: requireAIProviderGatewayToken(),
      profile_api_key_ciphertext: encrypted.api_key_ciphertext ?? null,
      profile_api_key_iv: encrypted.api_key_iv ?? null,
      profile_api_key_last4: encrypted.api_key_last4 ?? null,
      profile_api_key_tag: encrypted.api_key_tag ?? null,
      profile_base_url: parsed.base_url,
      profile_enabled: parsed.enabled,
      profile_id: parsed.id,
      profile_is_default: parsed.is_default,
      profile_model: parsed.model,
      profile_name: parsed.name,
      profile_provider: parsed.provider,
      profile_supports_pdf_input: parsed.supports_pdf_input,
      profile_supports_vision_images: parsed.supports_vision_images,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "AI provider profile updated.");
}

export async function testSavedAIProviderConnection(formData: FormData) {
  try {
    await requireSuperAdmin();
    const parsed = aiProviderProfileUpdateSchema.parse(formValues(formData));
    const supabase = await createClient();
    const saved = await loadSavedProvider({ id: parsed.id, supabase });
    const apiKey =
      parsed.api_key?.trim() ||
      decryptSecret({
        ciphertext: saved.api_key_ciphertext,
        iv: saved.api_key_iv,
        tag: saved.api_key_tag,
      });
    const result = await testAIProviderConnection({
      apiKey,
      base_url: parsed.base_url,
      model: parsed.model,
      name: parsed.name,
      provider: parsed.provider,
    });

    return result;
  } catch (error) {
    return {
      error: formatActionError(error),
      ok: false as const,
    };
  }
}

export async function deleteAIProviderProfile(formData: FormData) {
  try {
    await requireSuperAdmin();
    const parsed = aiProviderProfileDeleteSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_ai_provider_profile_for_gateway", {
      gateway_token: requireAIProviderGatewayToken(),
      profile_id: parsed.id,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "AI provider profile deleted.");
}

export async function saveAIProviderRoutingPolicy(formData: FormData) {
  try {
    await requireSuperAdmin();
    const parsed = aiProviderRoutingPolicyFormSchema.parse({
      enabled: formData.get("enabled") === "on",
      max_profiles_per_execution: formData.get("max_profiles_per_execution"),
      operation_kind: formData.get("operation_kind"),
      provider_profile_ids: formData
        .getAll("provider_profile_id")
        .filter((value): value is string => typeof value === "string" && Boolean(value)),
    });
    const supabase = await createClient();
    const profiles = await listSafeAIProviderProfiles(supabase);
    const invalidProfile = parsed.provider_profile_ids
      .map((id) => profiles.find((profile) => profile.id === id))
      .find(
        (profile) =>
          !profile ||
          !profile.enabled ||
          !profile.api_key_last4 ||
          !providerSupportsAIProviderRoutingOperation(
            profile,
            parsed.operation_kind,
          ),
      );
    if (invalidProfile) {
      throw new Error(
        "Each selected provider must be enabled, have saved key metadata, and support this AI operation.",
      );
    }

    await upsertAIProviderRoutingPolicyForGateway({
      enabled: parsed.enabled,
      maxProfilesPerExecution: parsed.max_profiles_per_execution,
      operationKind: parsed.operation_kind,
      providerProfileIds: parsed.provider_profile_ids,
      supabase,
    });
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "AI provider routing policy saved.");
}

export async function saveAIOperationsControl(formData: FormData) {
  try {
    const profile = await requireSuperAdmin();
    const supabase = await createClient();
    const controlPatch = {
          alert_circuit_open_seconds: boundedInteger(
            formData.get("alert_circuit_open_seconds"),
            900,
            60,
            86_400,
          ),
          alert_fallback_rate_basis_points: boundedInteger(
            formData.get("alert_fallback_rate_basis_points"),
            2500,
            0,
            10_000,
          ),
          alert_oldest_queue_seconds: boundedInteger(
            formData.get("alert_oldest_queue_seconds"),
            900,
            60,
            86_400,
          ),
          alert_queue_depth: boundedInteger(formData.get("alert_queue_depth"), 10, 1, 1000),
          alert_worker_stale_seconds: boundedInteger(
            formData.get("alert_worker_stale_seconds"),
            600,
            60,
            86_400,
          ),
          daily_estimated_cost_micros: boundedInteger(
            formData.get("daily_estimated_cost_micros"),
            10_000_000,
            0,
            10_000_000_000,
          ),
          max_jobs_per_invocation: boundedInteger(
            formData.get("max_jobs_per_invocation"),
            2,
            1,
            2,
          ),
          max_provider_calls_per_execution: boundedInteger(
            formData.get("max_provider_calls_per_execution"),
            4,
            1,
            4,
          ),
          monthly_estimated_cost_micros: boundedInteger(
            formData.get("monthly_estimated_cost_micros"),
            50_000_000,
            0,
            100_000_000_000,
          ),
          operation_kind: null,
          organization_id: null,
          pause_new_enqueues: formData.get("pause_new_enqueues") === "on",
          pause_worker_claims: formData.get("pause_worker_claims") === "on",
          queue_cost_reservation_micros: boundedInteger(
            formData.get("queue_cost_reservation_micros"),
            100_000,
            0,
            1_000_000_000,
          ),
      updated_by: profile.id,
    };
    const { data: existing, error: existingError } = await supabase
      .from("ai_operations_controls")
      .select("id")
      .is("organization_id", null)
      .is("operation_kind", null)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    const { error } = existing
      ? await supabase
          .from("ai_operations_controls")
          .update(controlPatch)
          .eq("id", existing.id)
      : await supabase.from("ai_operations_controls").insert({
          ...controlPatch,
          created_by: profile.id,
        });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "AI operations controls saved.");
}

export async function resetAIProviderCircuit(formData: FormData) {
  try {
    await requireSuperAdmin();
    const providerProfileId = String(formData.get("provider_profile_id") ?? "").trim();
    const operationKind = String(formData.get("operation_kind") ?? "").trim();
    if (!providerProfileId || !operationKind) {
      throw new Error("Provider circuit reference is required.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "reset_ai_provider_runtime_state_for_admin",
      {
        p_operation_kind: operationKind,
        p_provider_profile_id: providerProfileId,
      },
    );
    if (error) throw new Error(error.message);
    if (data !== true) throw new Error("The provider circuit was not found.");
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "Provider circuit reset.");
}

export async function setAIOperationPause(formData: FormData) {
  try {
    const profile = await requireSuperAdmin();
    const operationKind = String(formData.get("operation_kind") ?? "").trim();
    if (![
      "ai_pdf_extract",
      "blueprint_generate_questions",
      "blueprint_observe_pdf",
      "blueprint_analyze_text",
    ].includes(operationKind)) {
      throw new Error("Supported AI operation is required.");
    }
    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("ai_operations_controls")
      .select("id")
      .is("organization_id", null)
      .eq("operation_kind", operationKind)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    const pause_new_enqueues = formData.get("pause_new_enqueues") === "on";
    const { error } = existing
      ? await supabase
          .from("ai_operations_controls")
          .update({ pause_new_enqueues, updated_by: profile.id })
          .eq("id", existing.id)
      : await supabase.from("ai_operations_controls").insert({
          created_by: profile.id,
          operation_kind: operationKind,
          organization_id: null,
          pause_new_enqueues,
          updated_by: profile.id,
        });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "AI operation pause state saved.");
}

export async function cancelQueuedAIJobAsAdmin(formData: FormData) {
  try {
    await requireSuperAdmin();
    const jobId = String(formData.get("job_id") ?? "").trim();
    if (!jobId) throw new Error("Queued job reference is required.");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_ai_provider_job", {
      p_job_id: jobId,
    });
    if (error) throw new Error(error.message);
    if (data !== true) throw new Error("Only queued or retry-wait jobs can be cancelled.");
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "Queued AI job cancelled safely.");
}
