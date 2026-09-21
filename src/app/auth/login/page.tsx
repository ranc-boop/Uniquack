import { LockKeyhole } from "lucide-react";

import { signInWithUsername } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginErrorMessageKey } from "@/lib/auth/login-error";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [params, locale] = await Promise.all([searchParams, getRequestLocale()]);
  const errorKey = loginErrorMessageKey(params.error);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex size-10 items-center justify-center rounded-md border">
            <LockKeyhole className="size-5" />
          </div>
          <CardTitle>{t("auth.signIn")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={signInWithUsername} className="space-y-4">
            <input type="hidden" name="next" value={params.next ?? ""} />
            <div className="space-y-2">
              <Label htmlFor="username">{t("auth.username")}</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder={t("auth.usernamePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {errorKey ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t(errorKey)}
              </p>
            ) : null}
            <Button className="w-full" type="submit">
              {t("auth.signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
