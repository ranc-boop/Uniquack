"use client";

import { useState } from "react";

type QuestionStatusSelectProps = {
  defaultValue: string;
  isReadyToPublish: boolean;
  name?: string;
};

export function QuestionStatusSelect({
  defaultValue,
  isReadyToPublish,
  name = "status",
}: QuestionStatusSelectProps) {
  const [status, setStatus] = useState(defaultValue);

  return (
    <div className="space-y-2">
      <select
        name={name}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        defaultValue={defaultValue}
        onChange={(event) => setStatus(event.target.value)}
      >
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      {status === "published" && !isReadyToPublish ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This question may not be ready to publish yet.
        </p>
      ) : null}
    </div>
  );
}
