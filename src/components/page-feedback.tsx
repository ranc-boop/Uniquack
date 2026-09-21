"use client";

import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/i18n/locale-provider";

type PageFeedbackProps = {
  error?: string;
  saved?: string;
};

export function PageFeedback({ error, saved }: PageFeedbackProps) {
  const { t } = useLocale();
  if (error) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (saved) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        <Badge className="bg-green-700">{t("common.saved")}</Badge>
        <span>{saved}</span>
      </div>
    );
  }

  return null;
}
