import "server-only";

import type { AIProviderProfile } from "@/types/database";
import {
  apiKeyLast4,
  decryptSecret,
  encryptSecret,
} from "@/lib/ai-providers/encryption";
import { requireAIProviderGatewayToken } from "@/lib/ai-providers/gateway-token";
import { createServiceRoleClient } from "@/lib/supabase/server";

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
> & {
  // The Admin gateway projection predates organization scoping and may omit
  // this field. Server-role provider resolution always selects it so routing
  // can enforce global/current-organization profile boundaries.
  organization_id?: string | null;
};

const safeProviderProfileSelect = `
  id,
  organization_id,
  name,
  provider,
  base_url,
  model,
  enabled,
  is_default,
  supports_pdf_input,
  supports_vision_images,
  api_key_last4,
  created_at,
  updated_at
`;

export async function listSafeAIProviderProfiles(supabase: SupabaseLike) {
  const { data, error } = await (supabase as SupabaseRpcLike).rpc(
    "list_ai_provider_profiles_for_gateway",
    { gateway_token: requireAIProviderGatewayToken() },
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SafeAIProviderProfile[];
}

export async function listEnabledAIProviderProfiles(supabase: SupabaseLike) {
  const { data, error } = await (supabase as SupabaseRpcLike).rpc(
    "list_enabled_ai_provider_profiles_for_gateway",
    { gateway_token: requireAIProviderGatewayToken() },
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SafeAIProviderProfile[];
}

async function listSafeAIProviderProfilesWithServiceRole({
  enabledOnly = false,
}: {
  enabledOnly?: boolean;
}) {
  let query = (createServiceRoleClient() as any)
    .from("ai_provider_profiles")
    .select(safeProviderProfileSelect)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (enabledOnly) {
    query = query.eq("enabled", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const profiles = ((data ?? []) as SafeAIProviderProfile[]).filter((profile) =>
    enabledOnly ? Boolean(profile.api_key_last4) : true,
  );

  if (enabledOnly) {
    return profiles.sort((left, right) => {
      if (left.is_default !== right.is_default) {
        return left.is_default ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
  }

  return profiles;
}

export async function listEnabledAIProviderProfilesForServerUse() {
  // Provider execution must not depend on a user-session gateway RPC. This
  // module is server-only and resolves shared provider metadata with the
  // service-role client used by trusted execution paths.
  return listSafeAIProviderProfilesWithServiceRole({ enabledOnly: true });
}

async function loadAIProviderProfileForUseWithServiceRole(profileId: string) {
  const { data, error } = await createServiceRoleClient()
    .from("ai_provider_profiles")
    .select("*")
    .eq("id", profileId)
    .eq("enabled", true)
    .is("deleted_at", null)
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

export async function loadAIProviderProfileForServerUse({
  profileId,
}: {
  profileId: string;
}) {
  return loadAIProviderProfileForUseWithServiceRole(profileId);
}

// Existing server-only callers retain this name while credential resolution
// moves off the authenticated gateway RPC. Callers remain responsible for
// their own authorization before invoking a provider.
export async function loadAIProviderProfileForUse({
  profileId,
}: {
  profileId: string;
  supabase?: SupabaseLike;
}) {
  return loadAIProviderProfileForUseWithServiceRole(profileId);
}

export async function loadSafeAIProviderProfileForServerUse({
  profileId,
}: {
  profileId: string;
}) {
  const profiles = await listSafeAIProviderProfilesWithServiceRole({
    enabledOnly: true,
  });
  const profile = profiles.find((item) => item.id === profileId);

  if (!profile) {
    throw new Error("AI provider profile is not available for import.");
  }

  return profile;
}

// Existing server-only callers retain the safe-profile API while all provider
// metadata resolution avoids the authenticated gateway RPC.
export async function loadSafeAIProviderProfileForUse({
  profileId,
}: {
  profileId: string;
  supabase?: SupabaseLike;
}) {
  return loadSafeAIProviderProfileForServerUse({ profileId });
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
