"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function DeleteLibraryQuestionButton({
  questionTitle,
}: {
  questionTitle: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            `Delete “${questionTitle}” from this Library? Existing Assignments will not change.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      type="submit"
    >
      <Trash2 aria-hidden="true" className="size-4" />
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
