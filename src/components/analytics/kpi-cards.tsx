import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Kpi = {
  total_visits: number;
  unique_visitors: number;
  countries_count: number;
  window_days: number;
};

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function KpiCards({ totals, windowDays }: { totals: Kpi; windowDays: number }) {
  const cards = [
    {
      title: "Total visits",
      value: formatNumber(totals.total_visits),
      hint: `Last ${windowDays} days`,
    },
    {
      title: "Unique visitors",
      value: formatNumber(totals.unique_visitors),
      hint: `By distinct IP hash`,
    },
    {
      title: "Countries",
      value: formatNumber(totals.countries_count),
      hint: `Distinct countries represented`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">
              {card.value}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{card.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
