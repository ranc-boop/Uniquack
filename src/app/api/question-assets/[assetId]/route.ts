import { NextResponse } from "next/server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function deniedResponse(status: 404 | 500) {
  const body =
    status === 500
      ? { error: "Could not process the request." }
      : { error: "Not found." };

  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;

  // The route accepts an asset UUID, never a caller-provided Storage path.
  if (!isUuid(assetId)) {
    return deniedResponse(404);
  }

  // Authorization is deliberately first. The public RPC resolves the canonical
  // asset/question relation inside the database and returns a boolean only. No
  // service-role metadata read happens until the requester is authorized.
  const supabase = await createClient();
  const { data: canRead, error: authError } = await supabase.rpc(
    "can_read_question_asset",
    { p_asset_id: assetId },
  );

  if (authError) {
    return deniedResponse(500);
  }

  if (!canRead) {
    // Unknown and unauthorized asset IDs intentionally share one generic result.
    return deniedResponse(404);
  }

  // Canonical metadata remains server-only. The route never trusts a bucket/path
  // supplied by the caller, and only signs the row that passed authorization.
  const serviceClient = createServiceRoleClient();
  const { data: asset, error: assetError } = await serviceClient
    .from("question_assets")
    .select("id, storage_bucket, storage_path")
    .eq("id", assetId)
    .maybeSingle();

  if (assetError || !asset || !asset.storage_bucket || !asset.storage_path) {
    return deniedResponse(404);
  }

  const { data: signed, error: signError } = await serviceClient.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return deniedResponse(500);
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: NO_STORE_HEADERS,
  });
}
