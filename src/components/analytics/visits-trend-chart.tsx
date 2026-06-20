"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DailyRow = {
  date: string;
  visit_count: number;
  unique_visitor_count: number;
};

export function VisitsTrendChart({ data }: { data: DailyRow[] }) {
  const rows = data.slice(-30);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily visit trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows.map((r) => ({
                date: r.date.slice(5),
                visits: r.visit_count,
              }))}
              margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => [`${value} visits`]}
                labelFormatter={(label) => String(label)}
              />
              <Line
                type="monotone"
                dataKey="visits"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3, fill: "#2563eb" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Showing daily visits for the last {rows.length} days.
        </p>
      </CardContent>
    </Card>
  );
}
