"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type AdminReviewBulkSelectionProps = {
  checkboxName?: string;
  formId: string;
};

function getReviewCheckboxes(formId: string, checkboxName: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][form="${formId}"][name="${checkboxName}"]`,
    ),
  );
}

export function AdminReviewBulkSelection({
  checkboxName = "question_id",
  formId,
}: AdminReviewBulkSelectionProps) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const updateCounts = () => {
      const checkboxes = getReviewCheckboxes(formId, checkboxName);

      setTotalCount(checkboxes.length);
      setSelectedCount(checkboxes.filter((checkbox) => checkbox.checked).length);
    };

    updateCounts();
    document.addEventListener("change", updateCounts);

    return () => {
      document.removeEventListener("change", updateCounts);
    };
  }, [checkboxName, formId]);

  function setAllSelected(checked: boolean) {
    const checkboxes = getReviewCheckboxes(formId, checkboxName);

    checkboxes.forEach((checkbox) => {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={!totalCount || selectedCount === totalCount}
        onClick={() => setAllSelected(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        Select all
      </Button>
      <Button
        disabled={!selectedCount}
        onClick={() => setAllSelected(false)}
        size="sm"
        type="button"
        variant="outline"
      >
        Clear
      </Button>
      <span className="text-xs text-muted-foreground">
        {selectedCount} / {totalCount} selected
      </span>
    </div>
  );
}
