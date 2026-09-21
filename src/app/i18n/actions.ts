"use server";

import { cookies } from "next/headers";

import {
  LOCALE_COOKIE_NAME,
  localeCookieOptions,
  parseLocaleFormValue,
} from "@/lib/i18n/locale";

export async function setLocale(value: string) {
  const locale = parseLocaleFormValue(value);
  if (!locale) return;

  (await cookies()).set(LOCALE_COOKIE_NAME, locale, localeCookieOptions());
}
