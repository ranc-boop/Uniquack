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
