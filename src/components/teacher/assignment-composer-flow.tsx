"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type ComposerStage = "content" | "target" | "review";

const stages: Array<{
  id: ComposerStage;
  label: string;
  shortLabel: string;
}> = [
  { id: "content", label: "1. Select content", shortLabel: "Content" },
  { id: "target", label: "2. Choose classroom", shortLabel: "Classroom" },
  { id: "review", label: "3. Review and assign", shortLabel: "Review" },
];

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
        {pending ? "Creating Assignment…" : "Assign now"}
      </Button>
      <Button
        className="min-h-11"
        disabled={!canSubmit || pending}
        name="publishMode"
        type="submit"
        value="draft"
        variant="outline"
      >
        {pending ? "Saving…" : "Save draft"}
      </Button>
      <p aria-live="polite" className="sr-only">
        {pending ? "Assignment submission is in progress." : ""}
      </p>
    </div>
  );
}

export function AssignmentComposerFlow({
  content,
  initialStage = "content",
  review,
  target,
}: {
  content: ReactNode;
  initialStage?: ComposerStage;
  review: ReactNode;
  target: ReactNode;
}) {
  const [stage, setStage] = useState<ComposerStage>(initialStage);
  const [selectedClassrooms, setSelectedClassrooms] = useState(0);
  const [selectedQuestions, setSelectedQuestions] = useState(0);
  const [stageError, setStageError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

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

  function changeStage(nextStage: ComposerStage) {
    setStageError("");
    setStage(nextStage);
    focusStageHeading(nextStage);
  }

  function handleChange(event: FormEvent<HTMLDivElement>) {
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
      setStageError("Select at least one reviewed Library question to continue.");
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
      setStageError("Choose one classroom to continue.");
      window.requestAnimationFrame(() =>
        document.getElementById("assignment-composer-stage-error")?.focus(),
      );
      return;
    }

    changeStage("review");
  }

  return (
    <div
      className="space-y-5"
      onChange={handleChange}
      ref={rootRef}
    >
      <nav aria-label="Assignment creation progress" className="teacher-panel p-3">
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
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

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
          Select Assignment content
        </h2>
        {content}
        <div className="flex justify-end">
          <Button className="min-h-11" onClick={continueFromContent} type="button">
            Continue to classroom
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
          Choose Assignment classroom
        </h2>
        {target}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            className="min-h-11"
            onClick={() => changeStage("content")}
            type="button"
            variant="outline"
          >
            Back to content
          </Button>
          <Button className="min-h-11" onClick={continueFromTarget} type="button">
            Continue to review
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
          Review and create Assignment
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
            Back to classroom
          </Button>
        </div>
      </section>
    </div>
  );
}
