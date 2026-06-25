import "server-only";

import type { QuestionBlueprintRow } from "@/lib/blueprints/question-blueprint-persistence";

export type BlueprintQualityValidationInput = {
  blueprint: Pick<
    QuestionBlueprintRow,
    | "answer_spec_pattern"
    | "distractor_pattern"
    | "originality_constraints"
    | "question_pattern"
    | "required_elements"
    | "status"
    | "taxonomy_targets"
  > & {
    deleted_at?: string | null;
  };
  evidenceSnippets?: string[];
  knownAssignableTagIds?: ReadonlySet<string>;
  requestedQuestionType?: string | null;
};

export type BlueprintQualityValidationResult = {
  approvalBlockingReasons: string[];
  approvalReady: boolean;
  generationBlockingReasons: string[];
  generationReady: boolean;
};

const FACETS = ["curriculum", "concept", "method", "task", "form"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function taxonomyTargets(blueprint: BlueprintQualityValidationInput["blueprint"]) {
  const targets = asRecord(blueprint.taxonomy_targets);

  return Object.fromEntries(
    FACETS.map((facet) => [facet, stringList(targets[facet])]),
  ) as Record<(typeof FACETS)[number], string[]>;
}

function assignableIds({
  ids,
  knownAssignableTagIds,
}: {
  ids: string[];
  knownAssignableTagIds?: ReadonlySet<string>;
}) {
  if (!knownAssignableTagIds) {
    return ids;
  }

  return ids.filter((id) => knownAssignableTagIds.has(id));
}

function questionPatternText(blueprint: BlueprintQualityValidationInput["blueprint"]) {
  const pattern = asRecord(blueprint.question_pattern);
  const value = typeof pattern.pattern === "string"
    ? pattern.pattern
    : typeof blueprint.question_pattern === "string"
      ? blueprint.question_pattern
      : "";

  return value.replace(/\s+/g, " ").trim();
}

function hasSpecificQuestionPattern(blueprint: BlueprintQualityValidationInput["blueprint"]) {
  const pattern = questionPatternText(blueprint).toLowerCase();

  return (
    pattern.length >= 30 &&
    !/^(no |generic|reusable pattern|question pattern|blueprint draft)/i.test(pattern)
  );
}

function answerSpecKind(blueprint: BlueprintQualityValidationInput["blueprint"]) {
  const kind = asRecord(blueprint.answer_spec_pattern).kind;

  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function answerGuidance(blueprint: BlueprintQualityValidationInput["blueprint"]) {
  const answerSpec = asRecord(blueprint.answer_spec_pattern);

  return [
    ...stringList(answerSpec.acceptedAnswerGuidance),
    ...stringList(answerSpec.requiredAnswerFields),
    ...stringList(answerSpec.correctAnswerGuidance),
    ...stringList(answerSpec.optionGuidance),
  ];
}

function requestedKind({
  blueprint,
  requestedQuestionType,
}: {
  blueprint: BlueprintQualityValidationInput["blueprint"];
  requestedQuestionType?: string | null;
}) {
  return (requestedQuestionType?.trim().toLowerCase() || answerSpecKind(blueprint));
}

export function validateQuestionBlueprintQuality({
  blueprint,
  evidenceSnippets = [],
  knownAssignableTagIds,
  requestedQuestionType,
}: BlueprintQualityValidationInput): BlueprintQualityValidationResult {
  const targets = taxonomyTargets(blueprint);
  const conceptLeafIds = assignableIds({
    ids: targets.concept,
    knownAssignableTagIds,
  });
  const methodLeafIds = assignableIds({
    ids: targets.method,
    knownAssignableTagIds,
  });
  const taskLeafIds = assignableIds({
    ids: targets.task,
    knownAssignableTagIds,
  });
  const formLeafIds = assignableIds({
    ids: targets.form,
    knownAssignableTagIds,
  });
  const approvalBlockingReasons: string[] = [];

  if (!conceptLeafIds.length) {
    approvalBlockingReasons.push("At least one active assignable concept leaf is required.");
  }
  if (!methodLeafIds.length && !taskLeafIds.length) {
    approvalBlockingReasons.push("At least one active assignable method or task leaf is required.");
  }
  if (!formLeafIds.length) {
    approvalBlockingReasons.push("At least one active assignable form leaf is required.");
  }
  if (!hasSpecificQuestionPattern(blueprint)) {
    approvalBlockingReasons.push("Question pattern must be specific enough to reuse.");
  }
  if (!stringList(blueprint.required_elements).length) {
    approvalBlockingReasons.push("Required elements must be provided.");
  }
  if (!stringList(blueprint.originality_constraints).length) {
    approvalBlockingReasons.push("Originality constraints must be provided.");
  }
  if (!evidenceSnippets.length) {
    approvalBlockingReasons.push("Bounded source evidence is required.");
  }

  const generationBlockingReasons = [...approvalBlockingReasons];
  const kind = requestedKind({ blueprint, requestedQuestionType });
  const guidance = answerGuidance(blueprint);

  if (blueprint.status !== "approved") {
    generationBlockingReasons.push("Blueprint must be approved before generation.");
  }
  if (blueprint.deleted_at) {
    generationBlockingReasons.push("Blueprint is in trash and cannot generate questions.");
  }
  if (kind === "mcq" || answerSpecKind(blueprint) === "mcq") {
    if (answerSpecKind(blueprint) !== "mcq") {
      generationBlockingReasons.push("MCQ generation requires an MCQ answer spec pattern.");
    }
    if (!guidance.length) {
      generationBlockingReasons.push("MCQ option and correct-answer guidance is required.");
    }
    if (!stringList(blueprint.distractor_pattern).length) {
      generationBlockingReasons.push("MCQ distractor pattern is required.");
    }
  }
  if ((kind === "fill_blank" || answerSpecKind(blueprint) === "fill_blank") && !guidance.length) {
    generationBlockingReasons.push("Fill-blank answer structure guidance is required.");
  }

  return {
    approvalBlockingReasons,
    approvalReady: approvalBlockingReasons.length === 0,
    generationBlockingReasons,
    generationReady: generationBlockingReasons.length === 0,
  };
}

export function formatBlueprintQualityError({
  heading,
  reasons,
}: {
  heading: string;
  reasons: string[];
}) {
  return [heading, ...reasons.map((reason) => `- ${reason}`)].join("\n");
}
