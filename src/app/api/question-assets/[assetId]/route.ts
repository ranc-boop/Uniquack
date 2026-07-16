import { NextResponse } from "next/server";

import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60;

// Applied to every response from this route, success or failure, so intermediaries
// (browser cache, CDN, shared proxy) never cache an authorization decision or a
// signed URL across requests/users.
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

// Deliberately generic: never echoes a Postgres/Supabase error message, a table or
// column name, or anything else that could help an attacker distinguish "this asset
// doesn't exist" from "this asset exists but you can't read it" from "the server had
// an internal problem." The route logs nothing about the failure beyond what
// Next.js's own request logging already captures (no signed URLs, JWTs, cookies, or
// service-role credentials are ever included in a log line or a response body).
function deniedResponse(status: 403 | 404 | 500) {
  const body =
    status === 500
      ? { error: "Could not process the request." }
      : { error: "Not found." };

  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;

  // Metadata lookup uses the service role because `question_assets` table RLS
  // (question_assets_public_read / question_assets_staff_access) is narrower than
  // private.can_read_question() — it has no bank-member or assignment-scoped read
  // policy. storage_path/question_id alone are not sensitive; the actual grant
  // decision is made exclusively by can_read_question() below, never by this lookup.
  const serviceClient = createServiceRoleClient();
  const { data: asset, error: assetError } = await serviceClient
    .from("question_assets")
    .select("id, question_id, storage_bucket, storage_path")
    .eq("id", assetId)
    .maybeSingle();

  if (assetError || !asset || !asset.question_id || !asset.storage_path) {
    // Unknown asset ID and a lookup error are both reported identically (404) —
    // there is nothing legitimate to distinguish here for the caller.
    return deniedResponse(404);
  }

  // Authorization: the single reused primitive, and the ONLY authorization decision
  // in this route. Called via the requesting user's own session client (anon
  // included, since can_read_question() covers the public/published path without a
  // session) so auth.uid() resolves exactly as it would for direct RLS-scoped access
  // to the `questions` table. This is never called with a service-role/userless
  // client — doing so would make auth.uid() null and silently deny every caller,
  // which is the opposite of what a userless RPC-for-authorization mistake usually
  // causes, but is called out here so it's never "fixed" into the wrong direction.
  const supabase = await createClient();
  const { data: canRead, error: authError } = await supabase.rpc(
    "can_read_question",
    { p_question_id: asset.question_id },
  );

  if (authError) {
    return deniedResponse(500);
  }

  if (!canRead) {
    // The asset exists (we already resolved it above) but the caller is not
    // authorized to read the question it belongs to — reported as a plain,
    // detail-free 403, matching the same "don't reveal resource specifics" policy
    // as the 404 case above.
    return deniedResponse(403);
  }

  // Only after authorization succeeds is a signed URL ever created. Nothing above
  // this point touches Storage at all.
  const { data: signed, error: signError } = await serviceClient.storage
    .from(asset.storage_bucket || QUESTION_ASSETS_BUCKET)
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return deniedResponse(500);
  }

  // The signed URL is used exactly once, as the redirect target, and is never
  // logged, stored, or included in the JSON body of any response.
  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: NO_STORE_HEADERS,
  });
}
