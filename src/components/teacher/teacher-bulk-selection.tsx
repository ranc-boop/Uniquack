"use client";

import {
  Archive,
  CheckCircle2,
  Eye,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import {
  createContext,
  use,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { FocusTaskForm } from "@/components/teacher/focus-task-link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  initialTeacherBulkActionState,
  type TeacherBulkActionState,
} from "@/lib/teacher-bulk-actions";
import { cn } from "@/lib/utils";

export type TeacherBulkSelectionItem = {
  disabledReason?: string;
  eligible: boolean;
  id: string;
  label: string;
  previewId?: string;
};

type TeacherBulkAction = (
  previousState: TeacherBulkActionState,
  formData: FormData,
) => Promise<TeacherBulkActionState>;

type SelectionContextValue = {
  actionState: TeacherBulkActionState;
  allEligibleSelected: boolean;
  checkboxName: string;
  clear: () => void;
  eligibleCount: number;
  formId: string;
  isPending: boolean;
  itemById: Map<string, TeacherBulkSelectionItem>;
  selectedIds: string[];
  selectedItems: TeacherBulkSelectionItem[];
  someEligibleSelected: boolean;
  toggle: (id: string, checked: boolean) => void;
  toggleAll: (checked: boolean) => void;
  totalResults: number;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);
const SELECTION_STATE_PREFIX = "edustruct:teacher-selection:v1";
const SELECTION_STATE_TTL_MS = 15 * 60 * 1000;
const MAX_SAVED_SELECTIONS = 25;

type SelectionSnapshot = {
  expiresAt: number;
  restore?: {
    scrollY: number;
    triggerId: string;
  };
  selectedIds: string[];
};

function selectionStorageKey(scopeKey: string) {
  return `${SELECTION_STATE_PREFIX}:${scopeKey}`;
}

function readSelectionSnapshot(key: string): SelectionSnapshot | null {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(key) ?? "null",
    ) as Partial<SelectionSnapshot> | null;

    if (
      !parsed ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now() ||
      !Array.isArray(parsed.selectedIds) ||
      parsed.selectedIds.length > MAX_SAVED_SELECTIONS ||
      !parsed.selectedIds.every((id) => typeof id === "string")
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    const restore =
      parsed.restore &&
      Number.isFinite(parsed.restore.scrollY) &&
      parsed.restore.scrollY >= 0 &&
      typeof parsed.restore.triggerId === "string" &&
      parsed.restore.triggerId.length <= 160
        ? {
            scrollY: parsed.restore.scrollY,
            triggerId: parsed.restore.triggerId,
          }
        : undefined;

    return {
      expiresAt: parsed.expiresAt,
      restore,
      selectedIds: parsed.selectedIds,
    };
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

function writeSelectionSnapshot(
  key: string,
  snapshot: Omit<SelectionSnapshot, "expiresAt">,
) {
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        ...snapshot,
        expiresAt: Date.now() + SELECTION_STATE_TTL_MS,
      } satisfies SelectionSnapshot),
    );
  } catch {
    // Preview remains usable when storage is disabled or full.
  }
}

function useSelection() {
  const context = use(SelectionContext);

  if (!context) {
    throw new Error("Teacher bulk controls require a selection provider.");
  }

  return context;
}

export function CurrentPageSelectionProvider({
  action,
  bankId,
  checkboxName,
  children,
  fallbackFocusId,
  formId,
  items,
  returnTo,
  scopeKey,
  totalResults,
}: {
  action: TeacherBulkAction;
  bankId: string;
  checkboxName: string;
  children: ReactNode;
  fallbackFocusId: string;
  formId: string;
  items: TeacherBulkSelectionItem[];
  returnTo: string;
  scopeKey: string;
  totalResults: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [state, formAction, isPending] = useActionState(
    action,
    initialTeacherBulkActionState,
  );
  const handledErrorReceipt = useRef("initial");
  const handledReceipt = useRef("initial");
  const hydratedRef = useRef(false);
  const selectedIdsRef = useRef<string[]>([]);
  const triggerIdRef = useRef("");
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const eligibleIds = useMemo(
    () => items.filter((item) => item.eligible).map((item) => item.id),
    [items],
  );
  const selectedIds = items
    .map((item) => item.id)
    .filter((id) => selected.has(id));
  const selectedItems = selectedIds
    .map((id) => itemById.get(id))
    .filter((item): item is TeacherBulkSelectionItem => Boolean(item));
  const selectedEligibleCount = selectedItems.filter(
    (item) => item.eligible,
  ).length;
  const allEligibleSelected =
    eligibleIds.length > 0 && selectedEligibleCount === eligibleIds.length;
  const someEligibleSelected =
    selectedEligibleCount > 0 && !allEligibleSelected;
  const storageKey = selectionStorageKey(scopeKey);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    const snapshot = readSelectionSnapshot(storageKey);
    const restoredIds =
      snapshot?.selectedIds.filter((id) => itemById.get(id)?.eligible) ?? [];

    const hydrateTimer = window.setTimeout(() => {
      setSelected(new Set(restoredIds));
      selectedIdsRef.current = restoredIds;
      hydratedRef.current = true;
    }, 0);
    const restoreTimer = snapshot?.restore
      ? window.setTimeout(() => {
          window.scrollTo({
            behavior: "auto",
            top: snapshot.restore?.scrollY ?? 0,
          });
          const preferred = document.getElementById(
            snapshot.restore?.triggerId ?? "",
          );
          const fallback = document.getElementById(fallbackFocusId);
          const focusTarget =
            preferred instanceof HTMLElement
              ? preferred
              : fallback instanceof HTMLElement
                ? fallback
                : null;

          focusTarget?.focus({ preventScroll: true });
          if (!(preferred instanceof HTMLElement)) {
            focusTarget?.scrollIntoView({
              block: "center",
              behavior: "auto",
            });
          }
        }, 0)
      : 0;

    writeSelectionSnapshot(storageKey, { selectedIds: restoredIds });
    return () => {
      window.clearTimeout(hydrateTimer);
      window.clearTimeout(restoreTimer);
    };
  }, [fallbackFocusId, itemById, storageKey]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writeSelectionSnapshot(storageKey, { selectedIds });
  }, [selectedIds, storageKey]);

  useEffect(() => {
    function captureTrigger(event: Event) {
      const target =
        event instanceof SubmitEvent && event.submitter
          ? event.submitter
          : event.target;
      if (!(target instanceof Element)) return;

      const trigger = target.closest<HTMLElement>("[data-focus-task-kind]");
      if (trigger?.id) triggerIdRef.current = trigger.id;
    }

    function persistReturnState() {
      if (!triggerIdRef.current) return;
      writeSelectionSnapshot(storageKey, {
        restore: {
          scrollY: Math.max(0, window.scrollY),
          triggerId: triggerIdRef.current,
        },
        selectedIds: selectedIdsRef.current,
      });
    }

    document.addEventListener("click", captureTrigger, true);
    document.addEventListener("submit", captureTrigger, true);
    window.addEventListener("pagehide", persistReturnState);

    return () => {
      persistReturnState();
      document.removeEventListener("click", captureTrigger, true);
      document.removeEventListener("submit", captureTrigger, true);
      window.removeEventListener("pagehide", persistReturnState);
    };
  }, [storageKey]);

  useEffect(() => {
    if (
      state.status !== "error" ||
      state.receipt === handledErrorReceipt.current
    ) {
      return;
    }

    handledErrorReceipt.current = state.receipt;
    setSelected((current) => new Set(current));
  }, [state.receipt, state.status]);

  useEffect(() => {
    if (
      state.status !== "success" ||
      state.receipt === handledReceipt.current
    ) {
      return;
    }

    handledReceipt.current = state.receipt;
    setSelected(new Set());
    window.sessionStorage.removeItem(storageKey);
    const focusTimer = window.setTimeout(() => {
      document.getElementById(fallbackFocusId)?.focus({ preventScroll: true });
    }, 0);
    const refreshTimer = window.setTimeout(() => {
      router.refresh();
    }, 2_500);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(refreshTimer);
    };
  }, [fallbackFocusId, router, state.receipt, state.status, storageKey]);

  function toggle(id: string, checked: boolean) {
    const item = itemById.get(id);
    if (!item?.eligible || isPending) return;

    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (isPending) return;
    setSelected(checked ? new Set(eligibleIds) : new Set());
  }

  const context = {
    actionState: state,
    allEligibleSelected,
    checkboxName,
    clear: () => {
      setSelected(new Set());
      window.sessionStorage.removeItem(storageKey);
    },
    eligibleCount: eligibleIds.length,
    formId,
    isPending,
    itemById,
    selectedIds,
    selectedItems,
    someEligibleSelected,
    toggle,
    toggleAll,
    totalResults,
  } satisfies SelectionContextValue;

  return (
    <SelectionContext.Provider value={context}>
      <form action={formAction} data-selection-scope={scopeKey} id={formId}>
        <input name="bankId" type="hidden" value={bankId} />
        <input name="returnTo" type="hidden" value={returnTo} />
      </form>

      {state.status !== "idle" ? (
        <section
          className={cn(
            "m-4 rounded-lg border px-4 py-3 text-sm font-semibold",
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900",
          )}
          id={`${formId}-result`}
          role={state.status === "error" ? "alert" : "status"}
          tabIndex={-1}
        >
          {state.message}
        </section>
      ) : null}

      {children}
    </SelectionContext.Provider>
  );
}

export function BulkSelectAllCheckbox({
  label,
}: {
  label: string;
}) {
  const {
    allEligibleSelected,
    eligibleCount,
    isPending,
    someEligibleSelected,
    toggleAll,
  } = useSelection();
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someEligibleSelected;
    }
  }, [someEligibleSelected]);

  return (
    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2">
      <input
        aria-checked={someEligibleSelected ? "mixed" : allEligibleSelected}
        aria-label={label}
        checked={allEligibleSelected}
        className="h-5 w-5 rounded border-slate-300"
        disabled={!eligibleCount || isPending}
        onChange={(event) => toggleAll(event.currentTarget.checked)}
        ref={checkboxRef}
        type="checkbox"
      />
    </label>
  );
}

export function BulkRowCheckbox({ itemId }: { itemId: string }) {
  const {
    checkboxName,
    formId,
    isPending,
    itemById,
    selectedIds,
    toggle,
  } = useSelection();
  const item = itemById.get(itemId);

  if (!item) return null;

  const reasonId = `${formId}-${itemId}-selection-reason`;

  return (
    <>
      <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
        <input
          aria-describedby={!item.eligible ? reasonId : undefined}
          aria-label={`Select ${item.label}`}
          checked={selectedIds.includes(itemId)}
          className="h-5 w-5 rounded border-slate-300"
          disabled={!item.eligible || isPending}
          form={formId}
          name={checkboxName}
          onChange={(event) => toggle(itemId, event.currentTarget.checked)}
          type="checkbox"
          value={itemId}
        />
      </label>
      {!item.eligible && item.disabledReason ? (
        <span className="sr-only" id={reasonId}>
          {item.disabledReason}
        </span>
      ) : null}
    </>
  );
}

function BulkConfirmDialog({
  children,
  confirmLabel,
  description,
  formId,
  operation,
  requireLicense = false,
  title,
}: {
  children: ReactNode;
  confirmLabel: string;
  description: string;
  formId: string;
  operation: string;
  requireLicense?: boolean;
  title: string;
}) {
  const { actionState, isPending, selectedIds } = useSelection();
  const [open, setOpen] = useState(false);
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const failureClosePendingRef = useRef(false);
  const handledReceipt = useRef("initial");

  useEffect(() => {
    if (
      !open ||
      actionState.status === "idle" ||
      actionState.receipt === handledReceipt.current
    ) {
      return;
    }

    handledReceipt.current = actionState.receipt;
    failureClosePendingRef.current = actionState.status === "error";
    setOpen(false);
  }, [actionState.receipt, actionState.status, formId, open]);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setLicenseConfirmed(false);
      }}
      open={open}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          if (!failureClosePendingRef.current) return;

          event.preventDefault();
          failureClosePendingRef.current = false;
          window.requestAnimationFrame(() => {
            const result = document.getElementById(`${formId}-result`);
            result?.scrollIntoView({ block: "center", behavior: "auto" });
            result?.focus({ preventScroll: true });
          });
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="leading-6">
          {description}
        </DialogDescription>
        {requireLicense ? (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-slate-800">
            <input
              checked={licenseConfirmed}
              className="mt-1 h-5 w-5 shrink-0"
              form={formId}
              name="publicLicenseConfirmed"
              onChange={(event) =>
                setLicenseConfirmed(event.currentTarget.checked)
              }
              type="checkbox"
              value="confirmed"
            />
            <span>
              I confirm that the selected questions and reviewed images may be
              submitted for independent public publication review. Private PDFs
              and source files are excluded.
            </span>
          </label>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            className="min-h-11"
            disabled={isPending}
            onClick={() => setOpen(false)}
            ref={cancelRef}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="min-h-11"
            disabled={
              isPending ||
              !selectedIds.length ||
              (requireLicense && !licenseConfirmed)
            }
            form={formId}
            name="operation"
            type="submit"
            value={operation}
            variant={operation === "archive" ? "destructive" : "default"}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkBarShell({ children }: { children: ReactNode }) {
  const { clear, selectedIds, totalResults } = useSelection();
  const barRef = useRef<HTMLElement>(null);
  const [barHeight, setBarHeight] = useState(160);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const updateHeight = () => {
      setBarHeight(Math.ceil(bar.getBoundingClientRect().height));
    };
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [selectedIds.length]);

  if (!selectedIds.length) return null;

  return (
    <section
      aria-label="Bulk actions"
      className="sticky z-30 mx-3 mt-3 flex flex-col gap-3 rounded-xl border border-sky-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:mx-4 sm:flex-row sm:items-center sm:justify-between"
      ref={barRef}
      role="region"
      style={{
        bottom: "max(12px, env(safe-area-inset-bottom))",
        marginBottom: `calc(${barHeight}px + max(24px, env(safe-area-inset-bottom)))`,
      }}
    >
      <p
        aria-atomic="true"
        aria-live="polite"
        className="text-sm font-bold text-slate-950"
      >
        {selectedIds.length} selected on this page
        <span className="ml-2 font-normal text-slate-500">
          · {totalResults} results
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button
          className="min-h-11"
          onClick={clear}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
          Clear
        </Button>
      </div>
    </section>
  );
}

export function ReviewBulkActionBar({
  bankId,
  returnTo,
}: {
  bankId: string;
  returnTo: string;
}) {
  const { formId, selectedItems } = useSelection();
  const previewIds = selectedItems
    .map((item) => item.previewId)
    .filter((id): id is string => Boolean(id));

  return (
    <BulkBarShell>
      <FocusTaskForm
        bankId={bankId}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "min-h-11 whitespace-normal",
        )}
        destination="review_preview"
        fallbackFocusId="review-draft-results-focus"
        returnTo={returnTo}
        selectedIds={previewIds}
        taskKind="review-batch"
        triggerId="review-bulk-preview"
      >
        <Eye aria-hidden="true" />
        Preview selected
      </FocusTaskForm>
      <BulkConfirmDialog
        confirmLabel={`Approve ${selectedItems.length} into Library`}
        description="All selected pending drafts will enter this Library in one atomic operation. This does not publish them publicly or create an Assignment; if any draft is stale or invalid, none are changed."
        formId={formId}
        operation="approve"
        title={`Approve ${selectedItems.length} Review Draft${selectedItems.length === 1 ? "" : "s"}?`}
      >
        <Button className="min-h-11" type="button">
          <CheckCircle2 aria-hidden="true" />
          Approve selected
        </Button>
      </BulkConfirmDialog>
    </BulkBarShell>
  );
}

export function QuestionBulkActionBar({
  bankId,
  readiness,
  returnTo,
}: {
  bankId: string;
  readiness: "active" | "archived";
  returnTo: string;
}) {
  const { formId, selectedIds } = useSelection();
  return (
    <BulkBarShell>
      <FocusTaskForm
        bankId={bankId}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "min-h-11 whitespace-normal",
        )}
        destination="question_preview"
        fallbackFocusId="library-question-results-focus"
        returnTo={returnTo}
        selectedIds={selectedIds}
        taskKind="question-preview"
        triggerId="question-bulk-preview"
      >
        <Eye aria-hidden="true" />
        Preview selected
      </FocusTaskForm>

      {readiness === "active" ? (
        <>
          <form
            action="/api/teacher/focus-selections"
            className="inline-flex"
            method="post"
          >
            <input name="bankId" type="hidden" value={bankId} />
            <input name="destination" type="hidden" value="assignment" />
            <input name="returnTo" type="hidden" value={returnTo} />
            {selectedIds.map((selectedId) => (
              <input
                key={selectedId}
                name="selectedId"
                type="hidden"
                value={selectedId}
              />
            ))}
            <Button className="min-h-11" type="submit">
              Create assignment
            </Button>
          </form>
          <BulkConfirmDialog
            confirmLabel={`Submit ${selectedIds.length} for Public Review`}
            description="This creates immutable review snapshots. It does not publish immediately and does not change the private Library originals."
            formId={formId}
            operation="public_review"
            requireLicense
            title={`Submit ${selectedIds.length} question${selectedIds.length === 1 ? "" : "s"} for Public Review?`}
          >
            <Button className="min-h-11" type="button" variant="outline">
              <Send aria-hidden="true" />
              Public Review
            </Button>
          </BulkConfirmDialog>
          <BulkConfirmDialog
            confirmLabel={`Archive ${selectedIds.length} questions`}
            description="Archived questions stop appearing in new Assignment selection. Existing Assignments and student evidence remain unchanged, and manually archived items can be restored."
            formId={formId}
            operation="archive"
            title={`Archive ${selectedIds.length} Library question${selectedIds.length === 1 ? "" : "s"}?`}
          >
            <Button className="min-h-11" type="button" variant="outline">
              <Archive aria-hidden="true" />
              Archive
            </Button>
          </BulkConfirmDialog>
        </>
      ) : (
        <BulkConfirmDialog
          confirmLabel={`Restore ${selectedIds.length} questions`}
          description="Restored questions become available for new Assignments again. Superseded revisions remain blocked and the whole operation fails safely if any selected item is no longer eligible."
          formId={formId}
          operation="restore"
          title={`Restore ${selectedIds.length} Library question${selectedIds.length === 1 ? "" : "s"}?`}
        >
          <Button className="min-h-11" type="button">
            <RotateCcw aria-hidden="true" />
            Restore
          </Button>
        </BulkConfirmDialog>
      )}
    </BulkBarShell>
  );
}
