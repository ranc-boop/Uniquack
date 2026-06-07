"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  testNewAIProviderConnection,
  testSavedAIProviderConnection,
} from "@/app/admin/ai-settings/actions";
import { Button } from "@/components/ui/button";

type AIProviderTestButtonProps = {
  mode: "new" | "saved";
};

export function AIProviderTestButton({ mode }: AIProviderTestButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function testConnection(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;

    if (!form) {
      return;
    }

    const formData = new FormData(form);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result =
        mode === "new"
          ? await testNewAIProviderConnection(formData)
          : await testSavedAIProviderConnection(formData);

      if (result.ok) {
        setMessage(result.message);
        toast.success(result.message);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={testConnection}
      >
        {isPending ? "Testing..." : "Test connection"}
      </Button>
      {message ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
