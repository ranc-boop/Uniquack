"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type DeleteSubmitButtonProps = {
  label: string;
};

export function DeleteSubmitButton({ label }: DeleteSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant="destructive"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 className="size-4" />
      <span className="sr-only">Delete {label}</span>
    </Button>
  );
}
