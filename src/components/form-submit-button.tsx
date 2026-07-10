"use client";

import { useFormStatus } from "react-dom";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type FormSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  size?: "default" | "sm" | "lg" | "icon";
  value?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
};

export function FormSubmitButton({
  children,
  pendingLabel = "Saving...",
  className,
  name,
  size,
  value,
  variant,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={className}
      size={size}
      variant={variant}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
      ) : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}
