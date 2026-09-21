import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function UnauthorizedPage() {
  const locale = await getRequestLocale();

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{translate(locale, "unauthorized.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {translate(locale, "unauthorized.description")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/">{translate(locale, "unauthorized.backHome")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/questions">{translate(locale, "unauthorized.publicQuestions")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/auth/login">{translate(locale, "unauthorized.signInAnother")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
