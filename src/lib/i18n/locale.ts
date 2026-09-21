export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE_NAME = "edustruct_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function localeCookieOptions(secure = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);
}

export function parseLocaleFormValue(value: FormDataEntryValue | null): Locale | null {
  return isLocale(value) ? value : null;
}

export type ResolveLocaleInput = {
  acceptLanguage?: string | null;
  cookieValue?: string | null;
};

function acceptsChinese(acceptLanguage: string | null | undefined) {
  return (acceptLanguage ?? "")
    .split(",")
    .map((entry) => entry.trim().split(";", 1)[0]?.toLowerCase() ?? "")
    .some((languageTag) => languageTag === "zh" || languageTag.startsWith("zh-"));
}

export function resolveLocale({ cookieValue, acceptLanguage }: ResolveLocaleInput): Locale {
  if (isLocale(cookieValue)) {
    return cookieValue;
  }

  return acceptsChinese(acceptLanguage) ? "zh-CN" : DEFAULT_LOCALE;
}

export function localeForIntl(locale: Locale) {
  return locale === "en" ? "en-US" : locale;
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(localeForIntl(locale), options).format(value);
}

export function formatDate(
  locale: Locale,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const usesStyle = options?.dateStyle !== undefined || options?.timeStyle !== undefined;

  return new Intl.DateTimeFormat(
    localeForIntl(locale),
    usesStyle
      ? options
      : {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          ...options,
        },
  ).format(date);
}

export function formatDateTime(
  locale: Locale,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
) {
  const usesStyle = options?.dateStyle !== undefined || options?.timeStyle !== undefined;

  return formatDate(
    locale,
    value,
    usesStyle
      ? {
          dateStyle: "medium",
          timeStyle: "short",
          ...options,
        }
      : {
          hour: "numeric",
          minute: "2-digit",
          ...options,
        },
  );
}
