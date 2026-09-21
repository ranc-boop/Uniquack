"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  translate,
  type MessageKey,
  type TranslationValues,
} from "@/lib/i18n/messages";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  type Locale,
} from "@/lib/i18n/locale";

type LocaleContextValue = {
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  locale: Locale;
  t: (key: MessageKey, values?: TranslationValues) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children, locale }: { children: ReactNode; locale: Locale }) {
  const value = useMemo<LocaleContextValue>(
    () => ({
      formatDate: (date, options) => formatDate(locale, date, options),
      formatDateTime: (date, options) => formatDateTime(locale, date, options),
      formatNumber: (number, options) => formatNumber(locale, number, options),
      locale,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }

  return context;
}
