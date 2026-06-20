import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type PageVisit = Database["public"]["Tables"]["page_visits"]["Row"];

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: visits, error } = await supabase
    .from("page_visits")
    .select("id, created_at, country_code, country_name, pathname")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const headers = ["id", "created_at", "country_code", "country_name", "pathname"];
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replaceAll("\"", "\"\"")}"`;
    }
    return str;
  };

  const rows = (visits as PageVisit[]).map((row) =>
    [row.id, row.created_at, row.country_code, row.country_name, row.pathname]
      .map(escape)
      .join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="page-visits.csv"',
    },
  });
}
