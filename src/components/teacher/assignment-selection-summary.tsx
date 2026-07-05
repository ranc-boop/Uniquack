"use client";

import { useEffect, useState } from "react";

export function AssignmentSelectionSummary({
  formId,
  totalQuestions,
}: {
  formId: string;
  totalQuestions: number;
}) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;

    const updateSelectedCount = () => {
      const checked = form.querySelectorAll<HTMLInputElement>(
        'input[name="questionIds"]:checked',
      );
      setSelectedCount(checked.length);
    };

    updateSelectedCount();
    form.addEventListener("change", updateSelectedCount);

    return () => {
      form.removeEventListener("change", updateSelectedCount);
    };
  }, [formId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-950" aria-live="polite">
        {selectedCount} selected
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Choose at least one published question before saving or assigning.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {totalQuestions} published question(s) available in this view.
      </p>
    </div>
  );
}
