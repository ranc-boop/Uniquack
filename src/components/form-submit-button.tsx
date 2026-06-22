"use client";

import { useFormStatus } from "react-dom";

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
      {pending ? pendingLabel : children}
    </Button>
  );
}
