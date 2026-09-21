"use client";

import { useLocale } from "@/components/i18n/locale-provider";

export function PublishSelectionControls({
  formId,
  inputName,
}: {
  formId: string;
  inputName: string;
}) {
  const { t } = useLocale();
  function setVisibleSelection(checked: boolean) {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const inputs = form?.querySelectorAll<HTMLInputElement>(
      `input[name="${inputName}"]`,
    );

    for (const input of inputs ?? []) {
      if (!input.disabled) {
        input.checked = checked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        onClick={() => setVisibleSelection(true)}
        type="button"
      >
        {t("assignment.selectVisible")}
      </button>
      <button
        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        onClick={() => setVisibleSelection(false)}
        type="button"
      >
        {t("assignment.clearSelection")}
      </button>
    </div>
  );
}
