"use client";

import { Check, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocale } from "@/app/i18n/actions";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n/locale";

export function LocaleSwitcher() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { locale, t } = useLocale();

  function chooseLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;

    startTransition(() => {
      void setLocale(nextLocale).then(() => router.refresh());
    });
  }

  const options: Array<{ locale: Locale; label: string }> = [
    { locale: "zh-CN", label: t("chrome.chinese") },
    { locale: "en", label: t("chrome.english") },
  ];

  return (
    <details className="group relative">
      <summary
        aria-label={t("chrome.language")}
        className="workspace-control min-h-11 list-none gap-1.5 px-2.5 text-sm"
      >
        <Languages aria-hidden="true" className="size-4 text-[#6E6E73]" />
        <span>{locale === "zh-CN" ? t("chrome.chinese") : t("chrome.english")}</span>
      </summary>
      <div className="workspace-switcher-menu right-0 left-auto min-w-36">
        <p className="workspace-menu-label">{t("chrome.language")}</p>
        {options.map((option) => {
          const active = option.locale === locale;
          return (
            <button
              aria-pressed={active}
              className="workspace-menu-item w-full text-left"
              disabled={active || isPending}
              key={option.locale}
              onClick={() => chooseLocale(option.locale)}
              type="button"
            >
              <span>{option.label}</span>
              {active ? <Check aria-hidden="true" className="size-4 text-[#0071E3]" /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}
