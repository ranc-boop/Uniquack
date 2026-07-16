import { NextResponse } from "next/server";

import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;

  // Metadata lookup uses the service role because `question_assets` RLS
  // (question_assets_public_read / question_assets_staff_access) is narrower than
  // private.can_read_question() — it has no bank-member or assignment-scoped read
  // policy. storage_path/question_id alone are not sensitive; the actual grant
  // decision below is made exclusively by can_read_question(), not by this lookup.
  const serviceClient = createServiceRoleClient();
  const { data: asset, error: assetError } = await serviceClient
    .from("question_assets")
    .select("id, question_id, storage_bucket, storage_path")
    .eq("id", assetId)
    .maybeSingle();

  if (assetError) {
    return NextResponse.json({ error: assetError.message }, { status: 500 });
  }

  if (!asset || !asset.question_id || !asset.storage_path) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  // Authorization: the single reused primitive. Called under the requesting user's
  // own session (anon included) so auth.uid() resolves the same way it would for
  // direct RLS-scoped access to the `questions` table.
  const supabase = await createClient();
  const { data: canRead, error: authError } = await supabase.rpc(
    "can_read_question",
    { p_question_id: asset.question_id },
  );

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  if (!canRead) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: signed, error: signError } = await serviceClient.storage
    .from(asset.storage_bucket || QUESTION_ASSETS_BUCKET)
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message ?? "Could not sign asset URL." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
