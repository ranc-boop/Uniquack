import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/locale";

export const getRequestLocale = cache(async () => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    acceptLanguage: requestHeaders.get("accept-language"),
    cookieValue: cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null,
  });
});
