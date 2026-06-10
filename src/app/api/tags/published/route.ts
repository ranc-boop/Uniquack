import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const tagSelect =
  "id,parent_id,name,slug,description,tag_type,status,sort_order,created_at,updated_at";

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
  const usedBy = searchParams.get("usedBy");
  const limit = parseLimit(searchParams.get("limit"));
  const supabase = await createClient();

  if (usedBy && usedBy !== "questions") {
    return jsonResponse(
      {
        error: 'Unsupported usedBy value. Use "questions" or omit the parameter.',
      },
      { status: 400 },
    );
  }

  if (usedBy === "questions") {
    const { data: bindings, error: bindingsError } = await supabase
      .from("question_tags")
      .select("tag_id")
      .limit(10000);

    if (bindingsError) {
      return jsonResponse({ error: bindingsError.message }, { status: 500 });
    }

    const tagIds = Array.from(new Set((bindings ?? []).map((row) => row.tag_id)));

    if (!tagIds.length) {
      return jsonResponse({
        count: 0,
        tags: [],
        usedBy,
      });
    }

    const { data: tags, error: tagsError } = await supabase
      .from("tags")
      .select(tagSelect)
      .eq("status", "published")
      .in("id", tagIds)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(limit);

    if (tagsError) {
      return jsonResponse({ error: tagsError.message }, { status: 500 });
    }

    return jsonResponse({
      count: tags?.length ?? 0,
      tags: tags ?? [],
      usedBy,
    });
  }

  const { data: tags, error } = await supabase
    .from("tags")
    .select(tagSelect)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({
    count: tags?.length ?? 0,
    tags: tags ?? [],
    usedBy: null,
  });
}
