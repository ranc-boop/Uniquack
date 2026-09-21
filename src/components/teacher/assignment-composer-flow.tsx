"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import {
  publishQuestionBankAssignments,
  type AssignmentComposerActionState,
  type AssignmentComposerErrorField,
} from "@/app/teacher/publish/actions";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { assignmentErrorMessageKey } from "@/lib/teacher-assignment-error";

type ComposerStage = "content" | "target" | "review";

const stages = [
  {
    id: "content",
    labelKey: "assignment.stageSelectContent",
    shortLabelKey: "assignment.stageContent",
  },
  {
    id: "target",
    labelKey: "assignment.stageChooseClassroom",
    shortLabelKey: "assignment.stageClassroom",
  },
  {
    id: "review",
    labelKey: "assignment.stageReviewAssign",
    shortLabelKey: "assignment.stageReview",
  },
] as const;

const initialActionState: AssignmentComposerActionState = { status: "idle" };
const AssignmentActionStateContext =
  createContext<AssignmentComposerActionState>(initialActionState);

function focusStageHeading(stage: ComposerStage) {
  window.requestAnimationFrame(() => {
    document
      .getElementById(`assignment-composer-${stage}-heading`)
      ?.focus({ preventScroll: true });
    document
      .getElementById(`assignment-composer-${stage}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function AssignmentSubmitButtons({
  canSubmit,
}: {
  canSubmit: boolean;
}) {
  const { t } = useLocale();
  const { pending } = useFormStatus();

  return (
    <div aria-busy={pending} className="grid gap-2">
      <Button
        className="min-h-11"
        disabled={!canSubmit || pending}
        name="publishMode"
        type="submit"
        value="assigned"
      >
        {pending ? t("assignment.publishing") : t("assignment.publish")}
      </Button>
      <Button
        className="min-h-11"
        disabled={!canSubmit || pending}
        name="publishMode"
        type="submit"
        value="draft"
        variant="outline"
      >
        {pending ? t("common.saving") : t("assignment.saveDraft")}
      </Button>
      <p aria-live="polite" className="sr-only">
        {pending ? t("assignment.submissionInProgress") : ""}
      </p>
    </div>
  );
}

export function AssignmentComposerFlow({
  bankId,
  clientRequestKey,
  content,
  formId,
  initialStage = "content",
  review,
  sourceType,
  target,
}: {
  bankId: string;
  clientRequestKey: string;
  content: ReactNode;
  formId: string;
  initialStage?: ComposerStage;
  review: ReactNode;
  sourceType: string;
  target: ReactNode;
}) {
  const { t } = useLocale();
  const [actionState, formAction] = useActionState(
    publishQuestionBankAssignments,
    initialActionState,
  );
  const [stage, setStage] = useState<ComposerStage>(initialStage);
  const [selectedClassrooms, setSelectedClassrooms] = useState(0);
  const [selectedQuestions, setSelectedQuestions] = useState(0);
  const [stageError, setStageError] = useState("");
  const rootRef = useRef<HTMLFormElement>(null);

  const syncSelection = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    setSelectedQuestions(
      root.querySelectorAll<HTMLInputElement>(
        'input[name="bankQuestionIds"]:checked',
      ).length,
    );
    setSelectedClassrooms(
      root.querySelectorAll<HTMLInputElement>(
        'input[name="classroomIds"]:checked',
      ).length,
    );
  }, []);

  useEffect(() => {
    syncSelection();
  }, [syncSelection]);

  useEffect(() => {
    if (actionState.status !== "error") return;

    const nextStage =
      actionState.field === "content"
        ? "content"
        : actionState.field === "classroom"
          ? "target"
          : "review";
    window.requestAnimationFrame(() => {
      setStage(nextStage);
      const fieldId =
        actionState.field === "classroom"
          ? "assignment-classroom-options"
          : actionState.field === "content"
            ? "assignment-question-options"
            : actionState.field === "form"
              ? "assignment-composer-action-error"
              : actionState.field;
      const field = document.getElementById(fieldId);
      if (field && actionState.field === "instructions") {
        const disclosure = field.closest("details");
        if (disclosure instanceof HTMLDetailsElement) disclosure.open = true;
      }
      field?.focus({ preventScroll: false });
    });
  }, [actionState]);

  function changeStage(nextStage: ComposerStage) {
    setStageError("");
    setStage(nextStage);
    focusStageHeading(nextStage);
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLInputElement) {
      syncSelection();
    }
  }

  function continueFromContent() {
    syncSelection();
    const count =
      rootRef.current?.querySelectorAll<HTMLInputElement>(
        'input[name="bankQuestionIds"]:checked',
      ).length ?? 0;

    if (!count) {
      setStageError(t("assignment.selectAtLeastOne"));
      window.requestAnimationFrame(() =>
        document.getElementById("assignment-composer-stage-error")?.focus(),
      );
      return;
    }

    changeStage("target");
  }

  function continueFromTarget() {
    syncSelection();
    const count =
      rootRef.current?.querySelectorAll<HTMLInputElement>(
        'input[name="classroomIds"]:checked',
      ).length ?? 0;

    if (!count) {
      setStageError(t("assignment.chooseOneClassroom"));
      window.requestAnimationFrame(() =>
        document.getElementById("assignment-composer-stage-error")?.focus(),
      );
      return;
    }

    changeStage("review");
  }

  return (
    <form
      action={formAction}
      className="space-y-5"
      id={formId}
      onChange={handleChange}
      ref={rootRef}
    >
      <input name="bankId" type="hidden" value={bankId} />
      <input
        name="clientRequestKey"
        type="hidden"
        value={clientRequestKey}
      />
      <input name="sourceType" type="hidden" value={sourceType} />
      <AssignmentActionStateContext.Provider value={actionState}>
      <nav aria-label={t("assignment.creationProgress")} className="teacher-panel p-3">
        <ol className="grid grid-cols-3 gap-2">
          {stages.map((item) => {
            const isCurrent = item.id === stage;
            const isAvailable =
              item.id === "content" ||
              (item.id === "target" && selectedQuestions > 0) ||
              (item.id === "review" &&
                selectedQuestions > 0 &&
                selectedClassrooms > 0);

            return (
              <li key={item.id}>
                <button
                  aria-current={isCurrent ? "step" : undefined}
                  className={`teacher-focus-ring min-h-11 w-full rounded-lg px-2 py-2 text-sm font-bold transition-colors ${
                    isCurrent
                      ? "bg-sky-700 text-white"
                      : isAvailable
                        ? "bg-sky-50 text-sky-900 hover:bg-sky-100"
                        : "cursor-not-allowed bg-slate-50 text-slate-400"
                  }`}
                  disabled={!isAvailable}
                  onClick={() => changeStage(item.id)}
                  type="button"
                >
                  <span className="hidden sm:inline">{t(item.labelKey)}</span>
                  <span className="sm:hidden">{t(item.shortLabelKey)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {actionState.status === "error" ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          id="assignment-composer-action-error"
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">
            {t(assignmentErrorMessageKey(actionState.code))}
          </p>
        </div>
      ) : null}

      {stageError ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
          id="assignment-composer-stage-error"
          role="alert"
          tabIndex={-1}
        >
          {stageError}
        </p>
      ) : null}

      <section
        aria-labelledby="assignment-composer-content-heading"
        className={stage === "content" ? "space-y-4" : "hidden"}
        id="assignment-composer-content"
      >
        <h2
          className="sr-only"
          id="assignment-composer-content-heading"
          tabIndex={-1}
        >
          {t("assignment.selectContent")}
        </h2>
        {content}
        <div className="flex justify-end">
          <Button className="min-h-11" onClick={continueFromContent} type="button">
            {t("assignment.continueToClassroom")}
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="assignment-composer-target-heading"
        className={stage === "target" ? "space-y-4" : "hidden"}
        id="assignment-composer-target"
      >
        <h2
          className="sr-only"
          id="assignment-composer-target-heading"
          tabIndex={-1}
        >
          {t("assignment.chooseAssignmentClassroom")}
        </h2>
        {target}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            className="min-h-11"
            onClick={() => changeStage("content")}
            type="button"
            variant="outline"
          >
            {t("assignment.backToContent")}
          </Button>
          <Button className="min-h-11" onClick={continueFromTarget} type="button">
            {t("assignment.continueToReview")}
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="assignment-composer-review-heading"
        className={stage === "review" ? "space-y-4" : "hidden"}
        id="assignment-composer-review"
      >
        <h2
          className="sr-only"
          id="assignment-composer-review-heading"
          tabIndex={-1}
        >
          {t("assignment.reviewAndCreate")}
        </h2>
        {review}
        <AssignmentSubmitButtons
          canSubmit={selectedQuestions > 0 && selectedClassrooms === 1}
        />
        <div className="flex justify-start">
          <Button
            className="min-h-11"
            onClick={() => changeStage("target")}
            type="button"
            variant="outline"
          >
            {t("assignment.backToClassroom")}
          </Button>
        </div>
      </section>
      </AssignmentActionStateContext.Provider>
    </form>
  );
}

function fieldError(
  state: AssignmentComposerActionState,
  field: AssignmentComposerErrorField,
) {
  return state.status === "error" && state.field === field
    ? "assignment-composer-action-error"
    : undefined;
}

export function AssignmentDetailsFields() {
  const actionState = useContext(AssignmentActionStateContext);
  const { t } = useLocale();
  const titleError = fieldError(actionState, "title");
  const dueAtError = fieldError(actionState, "dueAt");
  const instructionsError = fieldError(actionState, "instructions");

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="title">{t("assignment.title")}</Label>
        <Input
          aria-describedby={titleError}
          aria-invalid={titleError ? true : undefined}
          id="title"
          maxLength={180}
          name="title"
          placeholder={t("assignment.titlePlaceholder")}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dueAt">{t("assignment.dueDateOptional")}</Label>
        <Input
          aria-describedby={dueAtError}
          aria-invalid={dueAtError ? true : undefined}
          id="dueAt"
          name="dueAt"
          type="datetime-local"
        />
      </div>
      <details className="rounded-lg border border-slate-200 bg-slate-50">
        <summary className="teacher-focus-ring min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
          {t("assignment.addInstructions")}
        </summary>
        <div className="border-t border-slate-200 p-4">
          <Label htmlFor="instructions">{t("assignment.instructions")}</Label>
          <Textarea
            aria-describedby={instructionsError}
            aria-invalid={instructionsError ? true : undefined}
            className="mt-2"
            id="instructions"
            maxLength={4000}
            name="instructions"
            placeholder={t("assignment.instructionsPlaceholder")}
            rows={4}
          />
        </div>
      </details>
    </>
  );
}
