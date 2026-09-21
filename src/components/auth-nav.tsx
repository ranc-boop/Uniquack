import Link from "next/link";
import { ChevronDown, UserRound } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentAuthContext } from "@/lib/auth/guards";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

export async function AuthNav() {
  const [authContext, locale] = await Promise.all([
    getCurrentAuthContext(),
    getRequestLocale(),
  ]);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  if (!authContext) {
    return (
      <Button asChild className="min-h-11" variant="outline" size="sm">
        <Link href="/auth/login">{t("auth.signIn")}</Link>
      </Button>
    );
  }

  const { email, profile } = authContext;

  return (
    <details className="group relative shrink-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[#D2D2D7] bg-white px-3 py-2 text-sm font-semibold text-[#1D1D1F] transition-colors duration-200 hover:bg-[#F5F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] focus-visible:ring-offset-2">
        <UserRound aria-hidden="true" className="h-4 w-4" />
        <span className="hidden max-w-36 truncate lg:inline">
          {profile?.username ?? email}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="collapsible-chevron h-4 w-4 text-slate-500"
        />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 rounded-[14px] border border-[#D2D2D7] bg-white p-3 shadow-[0_12px_34px_rgba(0,0,0,0.12)]">
        <div className="min-w-0 border-b border-slate-200 pb-3">
          <p className="truncate text-sm font-semibold text-slate-950">
            {profile?.username ?? email}
          </p>
          {profile?.role ? (
            <Badge className="mt-2" variant="secondary">
              {profile.role}
            </Badge>
          ) : null}
        </div>
        <form action={signOut} className="pt-3">
          <Button className="min-h-11 w-full" type="submit" variant="outline" size="sm">
            {t("auth.signOut")}
          </Button>
        </form>
      </div>
      {/* "Teacher Workspace preview" was removed because the primary navigation
          already exposes the Teacher workspace to authorized roles. */}
    </details>
  );
}
