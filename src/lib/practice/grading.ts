import "server-only";

import { normalizeAnswerSpec } from "@/lib/questions/answer-spec";
import { getQuestionReadiness } from "@/lib/questions/grading-capability";
import type { PracticeAttemptInput, PracticeGradeResult } from "@/lib/practice/types";
import type { Question } from "@/types/database";

function asArray(value: string | string[]) {
  return Array.isArray(value) ? value : [value];
}

function normalizeText(value: string, caseSensitive = false) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function compareSets(left: string[], right: string[]) {
  const leftSet = new Set(left.map((value) => value.trim()).filter(Boolean));
  const rightSet = new Set(right.map((value) => value.trim()).filter(Boolean));

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const value of leftSet) {
    if (!rightSet.has(value)) {
      return false;
    }
  }

  return true;
}

function numericValue(value: string) {
  const cleaned = value.trim().replace(/,/g, "");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function gradeMcq({
  answer,
  correctOptionIds,
}: {
  answer: string | string[];
  correctOptionIds: string[];
}) {
  const selected = asArray(answer).map((item) => item.trim()).filter(Boolean);
  const isCorrect = compareSets(selected, correctOptionIds);

  return {
    explanation: isCorrect
      ? "Correct option selection."
      : `Expected option${correctOptionIds.length > 1 ? "s" : ""}: ${correctOptionIds.join(", ")}.`,
    isCorrect,
    score: isCorrect ? 1 : 0,
  };
}

function gradeFillBlank({
  answer,
  acceptedAnswers,
  caseSensitive,
  equivalence,
  numericTolerance,
}: {
  acceptedAnswers: string[];
  answer: string | string[];
  caseSensitive: boolean;
  equivalence: "exact" | "numeric" | "math";
  numericTolerance: number;
}) {
  const submitted = asArray(answer).join(" ").trim();

  if (!submitted) {
    return {
      explanation: "No answer submitted.",
      isCorrect: false,
      score: 0,
    };
  }

  if (equivalence === "numeric") {
    const submittedNumber = numericValue(submitted);
    const matched = acceptedAnswers.some((accepted) => {
      const acceptedNumber = numericValue(accepted);
      return (
        submittedNumber !== null &&
        acceptedNumber !== null &&
        Math.abs(submittedNumber - acceptedNumber) <= numericTolerance
      );
    });

    return {
      explanation: matched
        ? "Numeric answer is within tolerance."
        : `Expected one of: ${acceptedAnswers.join(", ")}.`,
      isCorrect: matched,
      score: matched ? 1 : 0,
    };
  }

  const normalizedSubmitted = normalizeText(submitted, caseSensitive);
  const matched = acceptedAnswers.some(
    (accepted) => normalizeText(accepted, caseSensitive) === normalizedSubmitted,
  );

  return {
    explanation: matched
      ? "Answer matches an accepted final answer."
      : `Expected one of: ${acceptedAnswers.join(", ")}.`,
    isCorrect: matched,
    score: matched ? 1 : 0,
  };
}

export function gradePracticeAttempt({
  attempt,
  question,
}: {
  attempt: PracticeAttemptInput;
  question: Pick<
    Question,
    "answer_spec" | "id" | "options" | "question_type" | "solution_html" | "solution_source"
  >;
}): PracticeGradeResult {
  const spec = normalizeAnswerSpec(question.answer_spec);
  const readiness = getQuestionReadiness({
    answerSpec: question.answer_spec,
    options: question.options,
    questionType: question.question_type,
    solutionHtml: question.solution_html,
    solutionSource: question.solution_source,
  });

  if (readiness.capability === "needs_configuration") {
    return {
      explanation: readiness.blockingReasons.join(" "),
      gradingCapability: readiness.capability,
      gradingMode: "manual",
      isCorrect: null,
      questionId: question.id,
      score: null,
      solutionHtml: question.solution_html,
    };
  }

  if (question.question_type === "mcq") {
    const correctOptionIds = spec.correct_option_ids ?? [];
    const result = gradeMcq({ answer: attempt.answer, correctOptionIds });

    return {
      correctOptionIds,
      explanation: result.explanation,
      gradingCapability: readiness.capability,
      gradingMode: "auto",
      isCorrect: result.isCorrect,
      questionId: question.id,
      score: result.score,
      solutionHtml: question.solution_html,
    };
  }

  if (question.question_type === "fill_blank") {
    const acceptedAnswers = [
      ...(spec.final_answers ?? []),
      ...(spec.accepted_answers ?? []),
    ];
    const result = gradeFillBlank({
      acceptedAnswers,
      answer: attempt.answer,
      caseSensitive: Boolean(spec.case_sensitive),
      equivalence: spec.equivalence === "numeric" ? "numeric" : "exact",
      numericTolerance: spec.numeric_tolerance ?? 0,
    });

    return {
      acceptedAnswers,
      explanation: result.explanation,
      gradingCapability: readiness.capability,
      gradingMode: "auto",
      isCorrect: result.isCorrect,
      questionId: question.id,
      score: result.score,
      solutionHtml: question.solution_html,
    };
  }

  return {
    explanation: "Free-response answer is queued for AI review.",
    gradingCapability: readiness.capability,
    gradingMode: "manual",
    isCorrect: null,
    questionId: question.id,
    score: null,
    solutionHtml: question.solution_html,
  };
}
