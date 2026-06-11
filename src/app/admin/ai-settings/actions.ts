"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  clearDefaultProfile,
  encryptedKeyPatch,
} from "@/lib/ai-providers/profiles";
import { decryptSecret } from "@/lib/ai-providers/encryption";
import { testAIProviderConnection } from "@/lib/ai-providers/chat";
import { createClient } from "@/lib/supabase/server";
import type { AIProviderProfile } from "@/types/database";
import {
  aiProviderProfileDeleteSchema,
  aiProviderProfileFormSchema,
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
  const { data, error } = await supabase
    .from("ai_provider_profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AIProviderProfile;
}

export async function createAIProviderProfile(formData: FormData) {
  try {
    const profile = await requireSuperAdmin();
    const parsed = aiProviderProfileFormSchema.parse(formValues(formData));
    const supabase = await createClient();

    if (parsed.is_default) {
      await clearDefaultProfile({ supabase });
    }

    const { error } = await supabase.from("ai_provider_profiles").insert({
      name: parsed.name,
      provider: parsed.provider,
      base_url: parsed.base_url,
      model: parsed.model,
      enabled: parsed.enabled,
      is_default: parsed.is_default,
      supports_pdf_input: parsed.supports_pdf_input,
      supports_vision_images: parsed.supports_vision_images,
      ...encryptedKeyPatch(parsed.api_key),
      created_by: profile.id,
      updated_by: profile.id,
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

    if (parsed.is_default) {
      await clearDefaultProfile({ exceptId: parsed.id, supabase });
    }

    const { error } = await supabase
      .from("ai_provider_profiles")
      .update({
        name: parsed.name,
        provider: parsed.provider,
        base_url: parsed.base_url,
        model: parsed.model,
        enabled: parsed.enabled,
        is_default: parsed.is_default,
        supports_pdf_input: parsed.supports_pdf_input,
        supports_vision_images: parsed.supports_vision_images,
        ...encryptedKeyPatch(parsed.api_key),
        updated_by: profile.id,
      })
      .eq("id", parsed.id);

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
    const { error } = await supabase
      .from("ai_provider_profiles")
      .delete()
      .eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError(path, formatActionError(error));
  }

  revalidatePath(path);
  redirectWithSaved(path, "AI provider profile deleted.");
}
