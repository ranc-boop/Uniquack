import type { AIProviderProfile } from "@/types/database";
import {
  apiKeyLast4,
  decryptSecret,
  encryptSecret,
} from "@/lib/ai-providers/encryption";

type SupabaseLike = {
  from: (table: string) => any;
};

type SupabaseRpcLike = SupabaseLike & {
  rpc: (functionName: string, args?: Record<string, unknown>) => any;
};

export type SafeAIProviderProfile = Pick<
  AIProviderProfile,
  | "id"
  | "name"
  | "provider"
  | "base_url"
  | "model"
  | "enabled"
  | "is_default"
  | "supports_pdf_input"
  | "supports_vision_images"
  | "api_key_last4"
  | "created_at"
  | "updated_at"
>;

export async function listSafeAIProviderProfiles(supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from("ai_provider_profiles")
    .select(
      "id, name, provider, base_url, model, enabled, is_default, supports_pdf_input, supports_vision_images, api_key_last4, created_at, updated_at",
    )
    .order("name", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SafeAIProviderProfile[];
}

export async function listEnabledAIProviderProfiles(supabase: SupabaseLike) {
  const { data, error } = await (supabase as SupabaseRpcLike).rpc(
    "list_enabled_ai_provider_profiles",
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SafeAIProviderProfile[];
}

export async function loadAIProviderProfileForUse({
  profileId,
  supabase,
}: {
  profileId: string;
  supabase: SupabaseLike;
}) {
  const { data, error } = await supabase
    .from("ai_provider_profiles")
    .select("*")
    .eq("id", profileId)
    .eq("enabled", true)
    .not("api_key_ciphertext", "is", null)
    .not("api_key_iv", "is", null)
    .not("api_key_tag", "is", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const profile = data as AIProviderProfile | null;

  if (!profile) {
    throw new Error("AI provider profile is not available for import.");
  }

  return {
    ...profile,
    apiKey: decryptSecret({
      ciphertext: profile.api_key_ciphertext,
      iv: profile.api_key_iv,
      tag: profile.api_key_tag,
    }),
  };
}

export async function clearDefaultProfile({
  exceptId,
  supabase,
}: {
  exceptId?: string;
  supabase: SupabaseLike;
}) {
  let request = supabase
    .from("ai_provider_profiles")
    .update({ is_default: false })
    .eq("is_default", true);

  if (exceptId) {
    request = request.neq("id", exceptId);
  }

  const { error } = await request;

  if (error) {
    throw new Error(error.message);
  }
}

export function encryptedKeyPatch(apiKey: string | undefined) {
  if (!apiKey) {
    return {};
  }

  const encrypted = encryptSecret(apiKey);

  return {
    api_key_ciphertext: encrypted.ciphertext,
    api_key_iv: encrypted.iv,
    api_key_tag: encrypted.tag,
    api_key_last4: apiKeyLast4(apiKey),
  };
}
