"use client";

import { useEffect, useState } from "react";

export function AssignmentSelectionSummary({
  formId,
  helperText = "Choose at least one published question before saving or assigning.",
  inputName = "questionIds",
  totalLabel = "published question(s) available in this view.",
  totalQuestions,
}: {
  formId: string;
  helperText?: string;
  inputName?: string;
  totalLabel?: string;
  totalQuestions: number;
}) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;

    const updateSelectedCount = () => {
      const checked = form.querySelectorAll<HTMLInputElement>(
        `input[name="${inputName}"]:checked`,
      );
      setSelectedCount(checked.length);
    };

    updateSelectedCount();
    form.addEventListener("change", updateSelectedCount);

    return () => {
      form.removeEventListener("change", updateSelectedCount);
    };
  }, [formId, inputName]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-950" aria-live="polite">
        {selectedCount} selected
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        {helperText}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {totalQuestions} {totalLabel}
      </p>
    </div>
  );
}
