"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";

type DeleteSubmitButtonProps = {
  label: string;
};

export function DeleteSubmitButton({ label }: DeleteSubmitButtonProps) {
  const { t } = useLocale();
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant="destructive"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(t("common.deleteConfirm", { label }))) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 className="size-4" />
      <span className="sr-only">{t("common.delete")} {label}</span>
    </Button>
  );
}
