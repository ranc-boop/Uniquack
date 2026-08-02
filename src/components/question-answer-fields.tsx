"use client";

import { useMemo, useState } from "react";

import { AI_INPUT_LIMITS } from "@/lib/ai-input-limits";
import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";
import type { QuestionOption } from "@/lib/questions/answer-spec";

type QuestionAnswerFieldsProps = {
  answerSpec?: unknown;
  defaultQuestionType?: string;
  options?: unknown;
};

function optionsText(options: QuestionOption[]) {
  return options
    .map((option) => `${option.id}|${option.content_source ?? option.content_html}`)
    .join("\n");
}

export function QuestionAnswerFields({
  answerSpec,
  defaultQuestionType = "frq",
  options,
}: QuestionAnswerFieldsProps) {
  const normalizedOptions = useMemo(
    () => normalizeQuestionOptions(options),
    [options],
  );
  const normalizedAnswerSpec = useMemo(
    () => normalizeAnswerSpec(answerSpec),
    [answerSpec],
  );
  const [questionType, setQuestionType] = useState(defaultQuestionType);

  return (
    <>
      <div className="space-y-1">
        <label className="text-sm font-medium">Type</label>
        <select
          name="question_type"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue={defaultQuestionType}
          onChange={(event) => setQuestionType(event.currentTarget.value)}
        >
          <option value="frq">FRQ</option>
          <option value="mcq">MCQ</option>
          <option value="fill_blank">Fill blank</option>
          <option value="mixed">Mixed</option>
        </select>
      </div>
      <div className="space-y-3 rounded-md border bg-muted/20 p-3 lg:col-span-2">
        <p className="text-sm font-medium">Answer</p>
        {questionType === "mcq" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">Options</label>
              <textarea
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                defaultValue={optionsText(normalizedOptions)}
                maxLength={AI_INPUT_LIMITS.OPTION_TEXT_CHARS}
                name="options_text"
                placeholder={"A|First option\nB|Second option\nC|Third option"}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Correct option IDs</label>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={
                  normalizedAnswerSpec.kind === "mcq"
                    ? normalizedAnswerSpec.correct_option_ids?.join(", ")
                    : ""
                }
                name="correct_option_ids"
                maxLength={AI_INPUT_LIMITS.ANSWER_TEXT_CHARS}
                placeholder="A or A,B"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                defaultChecked={
                  normalizedAnswerSpec.kind === "mcq" &&
                  normalizedAnswerSpec.allow_multiple
                }
                name="allow_multiple"
                type="checkbox"
              />
              Allow multiple correct options
            </label>
          </div>
        ) : null}
        {questionType === "fill_blank" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Final answers</label>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                defaultValue={
                  normalizedAnswerSpec.kind === "fill_blank"
                    ? normalizedAnswerSpec.final_answers?.join("\n")
                    : ""
                }
                name="final_answers"
                maxLength={AI_INPUT_LIMITS.ANSWER_TEXT_CHARS}
                placeholder={"x=2\n2"}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Accepted answers</label>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                defaultValue={
                  normalizedAnswerSpec.kind === "fill_blank"
                    ? normalizedAnswerSpec.accepted_answers?.join("\n")
                    : ""
                }
                name="accepted_answers"
                maxLength={AI_INPUT_LIMITS.ANSWER_TEXT_CHARS}
                placeholder={"2\nx=2\n\\frac{4}{2}"}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Equivalence</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={
                  normalizedAnswerSpec.kind === "fill_blank"
                    ? normalizedAnswerSpec.equivalence ?? "math"
                    : "math"
                }
                name="equivalence"
              >
                <option value="math">Math</option>
                <option value="numeric">Numeric</option>
                <option value="exact">Exact text</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Numeric tolerance</label>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={
                  normalizedAnswerSpec.kind === "fill_blank"
                    ? normalizedAnswerSpec.numeric_tolerance ?? 0
                    : 0
                }
                min="0"
                name="numeric_tolerance"
                step="any"
                type="number"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                defaultChecked={
                  normalizedAnswerSpec.kind === "fill_blank" &&
                  normalizedAnswerSpec.case_sensitive
                }
                name="case_sensitive"
                type="checkbox"
              />
              Case sensitive
            </label>
          </div>
        ) : null}
      </div>
    </>
  );
}
