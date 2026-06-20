"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CountryRow = {
  country_code: string | null;
  country_name: string | null;
  visit_count: number;
  unique_visitor_count: number;
};

const COUNTRY_COLORS = [
  "#1e40af",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#f59e0b",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#d97706",
  "#6b7280",
];

function labelFor(country_code: string | null, country_name: string | null) {
  if (country_name) return country_name;
  if (country_code) return country_code;
  return "Unknown";
}

export function CountryBarChart({ data }: { data: CountryRow[] }) {
  const rows = data.slice(0, 10);
  const total = rows.reduce((sum, r) => sum + r.visit_count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top countries</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows.map((r, i) => ({
                code: labelFor(r.country_code, r.country_name),
                visits: r.visit_count,
                color: COUNTRY_COLORS[i % COUNTRY_COLORS.length],
              }))}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="code" tick={{ fontSize: 12 }} width={140} />
              <Tooltip
                formatter={(value: number) => [`${value} visits`]}
                labelFormatter={(label) => String(label)}
              />
              <Bar dataKey="visits" radius={[0, 4, 4, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={COUNTRY_COLORS[i % COUNTRY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Showing top {rows.length} countries. Total visits: {total}.
        </p>
      </CardContent>
    </Card>
  );
}
