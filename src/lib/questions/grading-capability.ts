import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";

export type QuestionGradingCapability =
  | "deterministic"
  | "ai_review"
  | "needs_configuration";

export type QuestionReadinessInput = {
  answerSpec: unknown;
  options?: unknown;
  questionType: string;
  solutionHtml?: string | null;
  solutionSource?: string | null;
};

export type QuestionReadiness = {
  blockingReasons: string[];
  capability: QuestionGradingCapability;
  ready: boolean;
};

function hasReadableText(...values: Array<string | null | undefined>) {
  return values.some((value) =>
    Boolean(
      value
        ?.replace(/<[^>]+>/g, " ")
        .replace(/&(?:nbsp|#160);/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
}

export function getQuestionReadiness(
  input: QuestionReadinessInput,
): QuestionReadiness {
  const answerSpec = normalizeAnswerSpec(input.answerSpec);
  const blockingReasons: string[] = [];

  if (input.questionType === "mcq") {
    const options = normalizeQuestionOptions(input.options);
    const optionIds = new Set(options.map((option) => option.id));
    const correctOptionIds = answerSpec.correct_option_ids ?? [];

    if (options.length < 2) {
      blockingReasons.push("Multiple-choice questions require at least two options.");
    }
    if (
      answerSpec.kind !== "mcq" ||
      !correctOptionIds.length ||
      correctOptionIds.some((id) => !optionIds.has(id))
    ) {
      blockingReasons.push("The correct multiple-choice answer is invalid.");
    }
  } else if (input.questionType === "fill_blank") {
    const acceptedAnswers = [
      ...(answerSpec.final_answers ?? []),
      ...(answerSpec.accepted_answers ?? []),
    ].map((answer) => answer.trim()).filter(Boolean);
    if (answerSpec.kind !== "fill_blank" || !acceptedAnswers.length) {
      blockingReasons.push("Fill-in-the-blank questions require a valid answer.");
    }
  } else if (input.questionType === "frq" || input.questionType === "mixed") {
    if (!hasReadableText(input.solutionHtml, input.solutionSource)) {
      blockingReasons.push("Free-response questions require a solution or rubric for AI review.");
    }
  } else {
    blockingReasons.push("This question type cannot be graded.");
  }

  const capability: QuestionGradingCapability = blockingReasons.length
    ? "needs_configuration"
    : input.questionType === "mcq" || input.questionType === "fill_blank"
      ? "deterministic"
      : "ai_review";

  return {
    blockingReasons: Array.from(new Set(blockingReasons)),
    capability,
    ready: capability !== "needs_configuration",
  };
}

export function getQuestionGradingCapability(
  input: QuestionReadinessInput,
): QuestionGradingCapability {
  return getQuestionReadiness(input).capability;
}
