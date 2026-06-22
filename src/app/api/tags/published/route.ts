import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  headers.set("Cache-Control", "public, max-age=60, s-maxage=60");

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

function parseLimit(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 500;
  }

  return Math.min(1000, Math.max(1, Math.trunc(parsed)));
}

export function OPTIONS() {
  return new Response(null, {
    headers: corsHeaders,
    status: 204,
  });
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return jsonResponse(
      {
        error: "Supabase is not configured.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("taxonomy_nodes")
    .select(
      "tag_id, label, description, node_kind, subject_tag_id, facet_key, is_assignable, status, sort_order",
    )
    .eq("status", "active")
    .eq("is_assignable", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(limit);

  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({
    count: data?.length ?? 0,
    tags: data ?? [],
    usedBy: "taxonomy",
  });
}
