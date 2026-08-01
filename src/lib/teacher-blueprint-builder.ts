import "server-only";

import type { BankApprovedQuestion, BankQuestionTaxonomySummary } from "@/lib/question-banks";
import type { Json, QuestionBlueprint } from "@/types/database";

export type BlueprintBuilderSourceExample = {
  bankQuestionId: string;
  difficulty: number | null;
  questionCode: string | null;
  questionId: string;
  questionType: string;
  sourceKind: string | null;
  sourceReviewItemId: string | null;
  taxonomyTargets: Array<{
    facetKey: string | null;
    label: string | null;
    reviewStatus: string;
    tagId: string;
  }>;
  title: string;
};

export type BlueprintBuilderFormInput = {
  answerPattern: string | null;
  description: string | null;
  difficultyMix: string | null;
  distractorPattern: string | null;
  expectedQuestionCount: number | null;
  originalityConstraints: string | null;
  questionTypeMix: string | null;
  requiredElements: string[];
  teacherNotes: string | null;
  title: string;
};

export type BlueprintBuilderReadinessSummary = {
  blockingReasons: string[];
  ready: boolean;
};

export const TEACHER_BLUEPRINT_INPUT_LIMITS = {
  REQUIRED_ELEMENT_CHARS: 240,
  REQUIRED_ELEMENT_ITEMS: 16,
  REQUIRED_ELEMENTS_INPUT_CHARS: 3_855,
} as const;

export class TeacherBlueprintInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeacherBlueprintInputError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function textListFromValue(
  value: string | null | undefined,
  limit = TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENT_ITEMS,
) {
  const rawValue = value ?? "";
  const maxInputLength = Math.min(
    TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENTS_INPUT_CHARS,
    limit * (TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENT_CHARS + 1) - 1,
  );
  if (rawValue.length > maxInputLength) {
    throw new TeacherBlueprintInputError(
      `Required elements must contain at most ${maxInputLength} characters in total.`,
    );
  }

  const items = rawValue
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length > limit) {
    throw new TeacherBlueprintInputError(
      `Required elements must contain at most ${limit} items.`,
    );
  }
  const overlongIndex = items.findIndex(
    (item) => item.length > TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENT_CHARS,
  );
  if (overlongIndex >= 0) {
    throw new TeacherBlueprintInputError(
      `Required element ${overlongIndex + 1} must be ${TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENT_CHARS} characters or fewer.`,
    );
  }
  return items;
}

export function boundedText(value: string | null | undefined, limit: number) {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed.slice(0, limit) : null;
}

export function parseExpectedQuestionCount(value: string | null | undefined) {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 200);
}

export function sourceExampleFromBankQuestion(
  row: BankApprovedQuestion,
): BlueprintBuilderSourceExample | null {
  if (!row.question) return null;

  return {
    bankQuestionId: row.bank_question_id,
    difficulty: Number.isFinite(Number(row.question.difficulty_rating))
      ? Number(row.question.difficulty_rating)
      : null,
    questionCode: row.question.question_code ?? null,
    questionId: row.question.id,
    questionType: row.question.question_type,
    sourceKind: row.question.source_kind ?? row.source_kind ?? null,
    sourceReviewItemId: row.question.source_review_item_id ?? null,
    taxonomyTargets: row.tagSummaries.map((tag) => ({
      facetKey: tag.facet_key ?? null,
      label: tag.label ?? null,
      reviewStatus: tag.review_status,
      tagId: tag.tag_id,
    })),
    title: row.question.title,
  };
}

export function buildTaxonomyTargetsFromExamples(examples: BlueprintBuilderSourceExample[]) {
  const targets = new Map<string, BlueprintBuilderSourceExample["taxonomyTargets"][number]>();

  for (const example of examples) {
    for (const target of example.taxonomyTargets) {
      targets.set(target.tagId, target);
    }
  }

  return Array.from(targets.values()).map((target) => ({
    facet_key: target.facetKey,
    label: target.label,
    review_status: target.reviewStatus,
    tag_id: target.tagId,
  }));
}

function countBy<T extends string | number>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(counts.entries());
}

export function buildDifficultyProfile({
  examples,
  teacherMix,
}: {
  examples: BlueprintBuilderSourceExample[];
  teacherMix: string | null;
}) {
  const difficulties = examples
    .map((example) => example.difficulty)
    .filter((difficulty): difficulty is number => typeof difficulty === "number");
  const average = difficulties.length
    ? Math.round(difficulties.reduce((sum, value) => sum + value, 0) / difficulties.length)
    : null;

  return {
    average,
    distribution: countBy(difficulties),
    max: difficulties.length ? Math.max(...difficulties) : null,
    min: difficulties.length ? Math.min(...difficulties) : null,
    teacherMix: teacherMix ?? null,
  };
}

export function buildQuestionTypeMix({
  examples,
  teacherMix,
}: {
  examples: BlueprintBuilderSourceExample[];
  teacherMix: string | null;
}) {
  return {
    observed: countBy(examples.map((example) => example.questionType)),
    teacherMix: teacherMix ?? null,
  };
}

export function buildTeacherBlueprintReadiness(input: {
  answerPattern: string | null;
  examples: BlueprintBuilderSourceExample[];
  requiredElements: string[];
  taxonomyTargetCount: number;
}) {
  const blockingReasons: string[] = [];

  if (!input.examples.length) {
    blockingReasons.push("Select at least one approved source question from the Library.");
  }
  if (!input.taxonomyTargetCount) {
    blockingReasons.push("Source examples need existing taxonomy targets before generation readiness.");
  }
  if (!input.requiredElements.length) {
    blockingReasons.push("Add required elements so the reusable pattern is specific.");
  }
  if (!input.answerPattern) {
    blockingReasons.push("Describe the expected answer pattern before generation readiness.");
  }

  return {
    blockingReasons,
    ready: blockingReasons.length === 0,
  } satisfies BlueprintBuilderReadinessSummary;
}

export function buildTeacherBlueprintPayload({
  bankId,
  bankName,
  examples,
  input,
}: {
  bankId: string | null;
  bankName: string | null;
  examples: BlueprintBuilderSourceExample[];
  input: BlueprintBuilderFormInput;
}) {
  const taxonomyTargets = buildTaxonomyTargetsFromExamples(examples);
  const readiness = buildTeacherBlueprintReadiness({
    answerPattern: input.answerPattern,
    examples,
    requiredElements: input.requiredElements,
    taxonomyTargetCount: taxonomyTargets.length,
  });

  return {
    answerSpecPattern: {
      guidance: input.answerPattern,
      source: "teacher_blueprint_builder",
    },
    difficultyProfile: buildDifficultyProfile({
      examples,
      teacherMix: input.difficultyMix,
    }),
    distractorPattern: {
      guidance: input.distractorPattern,
      source: "teacher_blueprint_builder",
    },
    generationBlockingReasons: readiness.ready
      ? ["Run calibration and Review Draft generation in a later gated workflow."]
      : readiness.blockingReasons,
    generationConstraints: {
      expectedQuestionCount: input.expectedQuestionCount,
      noDirectStudentDelivery: true,
      questionTypeMix: buildQuestionTypeMix({
        examples,
        teacherMix: input.questionTypeMix,
      }),
      reviewDraftGateRequired: true,
    },
    metadata: {
      builderCore: {
        sourceBankId: bankId,
        sourceBankName: bankName,
        sourceQuestionCount: examples.length,
        sourceQuestionIds: examples.map((example) => example.questionId),
        version: 1,
      },
      productSurface: "teacher_blueprint_builder_core",
      safety: {
        noAutoPublish: true,
        noDirectStudentDelivery: true,
        noProviderCall: true,
        noReviewDraftCreation: true,
        reviewDraftGateRequired: true,
      },
      teacherNotes: input.teacherNotes,
    },
    originalityConstraints: {
      guidance: input.originalityConstraints,
      source: "teacher_blueprint_builder",
    },
    questionPattern: {
      purpose: input.description,
      sourceExampleCount: examples.length,
      summary: input.description || "Reusable pattern built from selected Library questions.",
    },
    requiredElements: input.requiredElements,
    sourceRefs: examples.map((example) => ({
      bank_question_id: example.bankQuestionId,
      kind: "bank_question",
      question_code: example.questionCode,
      question_id: example.questionId,
      question_type: example.questionType,
      source_kind: example.sourceKind,
      source_review_item_id: example.sourceReviewItemId,
      title: example.title,
    })),
    taxonomyTargets,
  };
}

export function mergeTeacherBlueprintMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): Json {
  return {
    ...asRecord(existing),
    builderCore: {
      ...asRecord(asRecord(existing).builderCore),
      ...asRecord(patch.builderCore),
    },
    safety: {
      ...asRecord(asRecord(existing).safety),
      ...asRecord(patch.safety),
    },
    ...Object.fromEntries(
      Object.entries(patch).filter(([key]) => key !== "builderCore" && key !== "safety"),
    ),
  } as Json;
}

export function sourceExampleCount(blueprint: Pick<QuestionBlueprint, "metadata" | "source_refs">) {
  const metadata = asRecord(blueprint.metadata);
  const builderCore = asRecord(metadata.builderCore);
  const sourceQuestionCount = Number(builderCore.sourceQuestionCount);

  if (Number.isFinite(sourceQuestionCount) && sourceQuestionCount > 0) {
    return sourceQuestionCount;
  }

  return asArray(blueprint.source_refs).length;
}

export function selectedSourceQuestionTitles(blueprint: Pick<QuestionBlueprint, "source_refs">) {
  return asArray(blueprint.source_refs)
    .map((item) => {
      const record = asRecord(item);
      return stringValue(record.title) || stringValue(record.question_code);
    })
    .filter(Boolean)
    .slice(0, 6);
}

export function readinessChecklist(blueprint: QuestionBlueprint) {
  const requiredElements = asArray(blueprint.required_elements);
  const taxonomyTargets = asArray(blueprint.taxonomy_targets);
  const answerSpec = asRecord(blueprint.answer_spec_pattern);
  const generationConstraints = asRecord(blueprint.generation_constraints);
  const originalityConstraints = asRecord(blueprint.originality_constraints);
  const sourceCount = sourceExampleCount(blueprint);
  const answerGuidance = stringValue(answerSpec.guidance);
  const answerKind = stringValue(answerSpec.kind);
  const originalityGuidance = stringValue(originalityConstraints.guidance);

  return [
    {
      label: "Source examples selected",
      passed: sourceCount > 0,
      value: sourceCount ? `${sourceCount} source question${sourceCount === 1 ? "" : "s"}` : "Missing",
    },
    {
      label: "Taxonomy coverage",
      passed: taxonomyTargets.length > 0,
      value: taxonomyTargets.length ? `${taxonomyTargets.length} target${taxonomyTargets.length === 1 ? "" : "s"}` : "Missing",
    },
    {
      label: "Required elements",
      passed: requiredElements.length > 0,
      value: requiredElements.length ? `${requiredElements.length} item${requiredElements.length === 1 ? "" : "s"}` : "Missing",
    },
    {
      label: "Answer expectations",
      passed: Boolean(answerGuidance || answerKind),
      value: answerGuidance || answerKind || "Missing",
    },
    {
      label: "Originality constraints",
      passed: Boolean(originalityGuidance),
      value: originalityGuidance || "Missing",
    },
    {
      label: "Generation remains gated",
      passed: generationConstraints.reviewDraftGateRequired === true,
      value: "Review Draft and Library approval required",
    },
  ];
}

export function readinessWarnings(blueprint: QuestionBlueprint) {
  const warnings = readinessChecklist(blueprint)
    .filter((item) => !item.passed)
    .map((item) => `${item.label} is missing.`);
  const storedReasons = asArray(blueprint.generation_blocking_reasons)
    .map((reason) => stringValue(reason))
    .filter(Boolean);

  return Array.from(new Set([...warnings, ...storedReasons])).slice(0, 8);
}

export function displayTextFromPattern(value: unknown, key: string) {
  const record = asRecord(value);
  return stringValue(record[key]);
}
