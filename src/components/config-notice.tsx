import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

export async function SupabaseConfigNotice() {
  const locale = await getRequestLocale();

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{translate(locale, "config.supabaseTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {translate(locale, "config.supabaseDescription")}
        </p>
      </CardContent>
    </Card>
  );
}
