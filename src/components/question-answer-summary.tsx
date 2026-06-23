import {
  InlineMathText,
  OptionText,
} from "@/components/math-content";
import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";

type QuestionAnswerSummaryProps = {
  answerSpec?: unknown;
  options?: unknown;
  questionType: string;
};

export function QuestionAnswerSummary({
  answerSpec,
  options,
  questionType,
}: QuestionAnswerSummaryProps) {
  const normalizedOptions = normalizeQuestionOptions(options);
  const normalizedAnswerSpec = normalizeAnswerSpec(answerSpec);

  return (
    <details className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Answer information</summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <p>
          Type: <span className="font-medium text-foreground">{questionType}</span>
        </p>
        {normalizedOptions.length ? (
          <div>
            <p className="font-medium text-foreground">Options</p>
            <ul className="mt-1 space-y-1">
              {normalizedOptions.map((option) => (
                <li key={option.id}>
                  <span className="font-mono">{option.id}</span>.{" "}
                  <OptionText
                    className="inline border-none bg-transparent p-0 text-muted-foreground"
                    inline
                    value={option.content_source ?? option.content_html}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {normalizedAnswerSpec.kind === "mcq" ? (
          <p>
            Correct option IDs:{" "}
            <span className="font-mono text-foreground">
              {normalizedAnswerSpec.correct_option_ids?.join(", ") || "Not set"}
            </span>
          </p>
        ) : null}
        {normalizedAnswerSpec.kind === "fill_blank" ? (
          <div className="space-y-1">
            <p>
              Final answers:{" "}
              <InlineMathText
                className="font-mono text-foreground"
                value={normalizedAnswerSpec.final_answers?.join(", ") || "Not set"}
              />
            </p>
            <p>
              Accepted answers:{" "}
              <InlineMathText
                className="font-mono text-foreground"
                value={normalizedAnswerSpec.accepted_answers?.join(", ") || "Not set"}
              />
            </p>
            <p>Equivalence: {normalizedAnswerSpec.equivalence ?? "math"}</p>
          </div>
        ) : null}
        {normalizedAnswerSpec.kind === "frq" || normalizedAnswerSpec.kind === "mixed" ? (
          <p>Manual or AI-assisted grading.</p>
        ) : null}
      </div>
    </details>
  );
}
