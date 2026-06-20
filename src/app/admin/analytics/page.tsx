import { Suspense } from "react";

import { AdminAnalyticsActions } from "@/components/analytics/admin-actions";
import { CountryBarChart } from "@/components/analytics/country-bar-chart";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { VisitsTrendChart } from "@/components/analytics/visits-trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type StatsResponse = {
  ok: boolean;
  window_days: number;
  totals: {
    total_visits: number;
    unique_visitors: number;
    countries_count: number;
  };
  top_countries: Array<{
    country_code: string | null;
    country_name: string | null;
    visit_count: number;
    unique_visitor_count: number;
  }>;
  daily_trend: Array<{ date: string; visit_count: number; unique_visitor_count: number }>;
};

type VisitRow = Database["public"]["Tables"]["page_visits"]["Row"];

async function loadStats(): Promise<StatsResponse | null> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const res = await fetch(`${base}/api/page-visits/stats`, {
      cache: "no-store",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as StatsResponse;
    if (!data?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadRecent(): Promise<VisitRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("page_visits")
      .select("id, created_at, country_code, country_name, pathname")
      .order("created_at", { ascending: false })
      .limit(100);
    return (data as VisitRow[]) || [];
  } catch {
    return [];
  }
}

function labelFor(country_code: string | null, country_name: string | null) {
  if (country_name) return country_name;
  if (country_code) return country_code;
  return "Unknown";
}

function formatDate(val: string | null) {
  if (!val) return "-";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return val;
  }
}

export default async function AdminAnalyticsPage() {
  const [stats, recent] = await Promise.all([loadStats(), loadRecent()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visitor analytics</h1>
        <p className="text-sm text-muted-foreground">
          Page visit counts by country, aggregated from hashed IPs.
        </p>
      </div>

      <AdminAnalyticsActions />

      <Suspense
        fallback={
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Loading analytics...
            </CardContent>
          </Card>
        }
      >
        {!stats ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No data yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Analytics are loading or the migration has not been applied yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <KpiCards totals={stats.totals} windowDays={stats.window_days} />
            <div className="grid gap-4 md:grid-cols-2">
              <CountryBarChart data={stats.top_countries} />
              <VisitsTrendChart data={stats.daily_trend} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Country breakdown</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                          Country
                        </th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">
                          Visits
                        </th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">
                          Unique visitors
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.top_countries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-6 text-center text-muted-foreground"
                          >
                            No visits recorded yet.
                          </td>
                        </tr>
                      ) : (
                        stats.top_countries.map((r) => (
                          <tr
                            key={r.country_code || "unknown"}
                            className="border-b border-border/60"
                          >
                            <td className="py-2 pr-4">
                              {labelFor(r.country_code, r.country_name)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {r.visit_count}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {r.unique_visitor_count}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Recent visits <span className="text-muted-foreground text-sm font-normal">(last {recent.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                          Time
                        </th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                          Country
                        </th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                          Path
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-6 text-center text-muted-foreground"
                          >
                            No visits yet.
                          </td>
                        </tr>
                      ) : (
                        recent.map((r) => (
                          <tr key={r.id} className="border-b border-border/60">
                            <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
                              {formatDate(r.created_at)}
                            </td>
                            <td className="py-2 pr-4">
                              {labelFor(r.country_code, r.country_name)}
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                              {r.pathname || "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </Suspense>
    </div>
  );
}
