"use client";

import { useFormStatus } from "react-dom";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";

type FormSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  form?: string;
  formAction?: React.ButtonHTMLAttributes<HTMLButtonElement>["formAction"];
  name?: string;
  size?: "default" | "sm" | "lg" | "icon";
  value?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
};

export function FormSubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
  form,
  formAction,
  name,
  size,
  value,
  variant,
}: FormSubmitButtonProps) {
  const { t } = useLocale();
  const { action, pending } = useFormStatus();
  const isActiveSubmitter =
    pending && (formAction === undefined || action === formAction);
  const resolvedPendingLabel = pendingLabel ?? t("common.saving");

  return (
    <Button
      type="submit"
      aria-busy={isActiveSubmitter || undefined}
      name={name}
      value={value}
      disabled={disabled || pending}
      form={form}
      formAction={formAction}
      className={className}
      size={size}
      variant={variant}
    >
      {isActiveSubmitter ? (
        <LoaderCircle
          aria-hidden="true"
          className="h-4 w-4 motion-safe:animate-spin"
        />
      ) : null}
      <span aria-live={isActiveSubmitter ? "polite" : undefined}>
        {isActiveSubmitter ? resolvedPendingLabel : children}
      </span>
    </Button>
  );
}
