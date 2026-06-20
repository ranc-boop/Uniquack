import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS_WINDOW = 30;
const TOP_N = 15;

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().replace("T", " ").replace("Z", "") + "Z";
}

export async function GET() {
  const supabase = await createClient();

  const [
    totalResult,
    countryResult,
    dailyResult,
  ] = await Promise.all([
    supabase
      .from("page_visits")
      .select("*", { count: "exact", head: true })
      .gte("created_at", daysAgo(DAYS_WINDOW)),

    supabase
      .from("page_visit_country_stats")
      .select("*")
      .order("visit_count", { ascending: false })
      .limit(TOP_N),

    supabase
      .from("page_visit_daily_stats")
      .select("*")
      .gte("visit_date", daysAgo(DAYS_WINDOW).slice(0, 10))
      .order("visit_date", { ascending: true }),
  ]);

  const total = totalResult.count ?? 0;

  const allCountryRows = countryResult.data ?? [];
  const uniqueVisitors = allCountryRows.reduce(
    (sum, r) => sum + (r.unique_visitor_count ?? 0),
    0,
  );
  const countriesCount = allCountryRows.filter((r) => r.country_code).length;

  const topCountries = allCountryRows
    .map((r) => ({
      country_code: r.country_code,
      country_name: r.country_name,
      visit_count: r.visit_count ?? 0,
      unique_visitor_count: r.unique_visitor_count ?? 0,
    }))
    .sort((a, b) => b.visit_count - a.visit_count);

  const dailyMap = new Map<
    string,
    { visit_count: number; unique_visitor_count: number }
  >();
  for (const row of dailyResult.data ?? []) {
    const key = String(row.visit_date).slice(0, 10);
    const existing = dailyMap.get(key) ?? {
      visit_count: 0,
      unique_visitor_count: 0,
    };
    existing.visit_count += row.visit_count ?? 0;
    dailyMap.set(key, existing);
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(
    {
      ok: true,
      window_days: DAYS_WINDOW,
      totals: {
        total_visits: total,
        unique_visitors: uniqueVisitors,
        countries_count: countriesCount,
      },
      top_countries: topCountries,
      daily_trend: daily,
    },
    { status: 200 },
  );
}
