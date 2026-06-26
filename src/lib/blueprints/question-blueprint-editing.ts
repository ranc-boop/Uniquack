import "server-only";

import {
  validateQuestionBlueprintQuality,
  type BlueprintQualityValidationResult,
} from "@/lib/blueprints/question-blueprint-quality";
import type { QuestionBlueprintRow } from "@/lib/blueprints/question-blueprint-persistence";

export type BlueprintEditInput = {
  answerSpecKind: string;
  answerSpecNotes: string[];
  difficultyDrivers: string[];
  difficultyEstimate: number | null;
  distractorPattern: string[];
  generationConstraints: string[];
  originalityConstraints: string[];
  questionPattern: string;
  requiredElements: string[];
  sourceEvidenceNotes: string[];
  taxonomyTargets: Record<"curriculum" | "concept" | "method" | "task" | "form", string[]>;
  title: string;
};

export type BlueprintEditResult = {
  changed: boolean;
  nextBlueprint: QuestionBlueprintRow;
  quality: BlueprintQualityValidationResult;
  updatePayload: Record<string, unknown>;
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

function boundedText(value: unknown, max = 800) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function stringList(value: unknown, max = 24) {
  return asArray(value)
    .flatMap((item) => (typeof item === "string" ? item.split(/\r?\n|,/g) : []))
    .map((item) => boundedText(item, 320))
    .filter(Boolean)
    .slice(0, max);
}

function uniqueStrings(values: string[], max = 24) {
  return Array.from(new Set(values.map((value) => boundedText(value, 320)).filter(Boolean))).slice(0, max);
}

function normalizeTargets(value: Record<string, string[]>) {
  return Object.fromEntries(
    FACETS.map((facet) => [facet, uniqueStrings(value[facet] ?? [], 16)]),
  ) as BlueprintEditInput["taxonomyTargets"];
}

function answerSpecPattern(input: BlueprintEditInput) {
  return {
    acceptedAnswerGuidance: input.answerSpecNotes,
    kind: ["mcq", "fill_blank", "frq", "mixed"].includes(input.answerSpecKind)
      ? input.answerSpecKind
      : "unknown",
    requiredAnswerFields: input.answerSpecNotes,
  };
}

function difficultyProfile(input: BlueprintEditInput) {
  return {
    difficultyDrivers: input.difficultyDrivers,
    estimatedDifficulty: input.difficultyEstimate,
  };
}

function sourceRefsWithNotes(blueprint: QuestionBlueprintRow, input: BlueprintEditInput) {
  return {
    ...asRecord(blueprint.source_refs),
    adminEvidenceNotes: input.sourceEvidenceNotes,
  };
}

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

function blueprintComparableFields(blueprint: QuestionBlueprintRow) {
  return {
    answer_spec_pattern: blueprint.answer_spec_pattern,
    difficulty_profile: blueprint.difficulty_profile,
    distractor_pattern: blueprint.distractor_pattern,
    generation_constraints: blueprint.generation_constraints,
    originality_constraints: blueprint.originality_constraints,
    question_pattern: blueprint.question_pattern,
    required_elements: blueprint.required_elements,
    source_refs: blueprint.source_refs,
    taxonomy_targets: blueprint.taxonomy_targets,
    title: blueprint.title,
  };
}

export function validateBlueprintEdit({
  input,
  knownAssignableTagIds,
}: {
  input: BlueprintEditInput;
  knownAssignableTagIds?: ReadonlySet<string>;
}) {
  const errors: string[] = [];

  if (!input.title.trim()) errors.push("Blueprint title is required.");
  if (!input.questionPattern.trim()) errors.push("Question pattern is required.");
  if (!input.requiredElements.length) errors.push("Required elements are required.");
  if (!input.originalityConstraints.length) errors.push("Originality constraints are required.");

  for (const facet of FACETS) {
    for (const tagId of input.taxonomyTargets[facet]) {
      if (knownAssignableTagIds && !knownAssignableTagIds.has(tagId)) {
        errors.push(`${tagId} is not an active assignable ${facet} leaf.`);
      }
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

export function blueprintEditInputFromParts(input: {
  answerSpecKind?: unknown;
  answerSpecNotes?: unknown;
  difficultyDrivers?: unknown;
  difficultyEstimate?: unknown;
  distractorPattern?: unknown;
  generationConstraints?: unknown;
  originalityConstraints?: unknown;
  questionPattern?: unknown;
  requiredElements?: unknown;
  sourceEvidenceNotes?: unknown;
  taxonomyTargets: Record<string, string[]>;
  title?: unknown;
}): BlueprintEditInput {
  const difficulty = Number(input.difficultyEstimate);

  return {
    answerSpecKind: boundedText(input.answerSpecKind, 40),
    answerSpecNotes: stringList(input.answerSpecNotes, 12),
    difficultyDrivers: stringList(input.difficultyDrivers, 12),
    difficultyEstimate: Number.isFinite(difficulty)
      ? Math.min(1000, Math.max(0, Math.round(difficulty)))
      : null,
    distractorPattern: stringList(input.distractorPattern, 12),
    generationConstraints: stringList(input.generationConstraints, 16),
    originalityConstraints: stringList(input.originalityConstraints, 16),
    questionPattern: boundedText(input.questionPattern, 1200),
    requiredElements: stringList(input.requiredElements, 16),
    sourceEvidenceNotes: stringList(input.sourceEvidenceNotes, 8),
    taxonomyTargets: normalizeTargets(input.taxonomyTargets),
    title: boundedText(input.title, 180),
  };
}

export function applyBlueprintEdit({
  blueprint,
  input,
  knownAssignableTagIds,
}: {
  blueprint: QuestionBlueprintRow;
  input: BlueprintEditInput;
  knownAssignableTagIds?: ReadonlySet<string>;
}): BlueprintEditResult {
  const validation = validateBlueprintEdit({ input, knownAssignableTagIds });

  if (!validation.valid) {
    throw new Error(["Blueprint edit is invalid:", ...validation.errors.map((error) => `- ${error}`)].join("\n"));
  }

  const nextBlueprint: QuestionBlueprintRow = {
    ...blueprint,
    answer_spec_pattern: answerSpecPattern(input),
    difficulty_profile: difficultyProfile(input),
    distractor_pattern: input.distractorPattern,
    generation_constraints: input.generationConstraints,
    generation_readiness: "uncalibrated",
    last_calibrated_at: null,
    last_calibration_run_id: null,
    originality_constraints: input.originalityConstraints,
    question_pattern: {
      pattern: input.questionPattern,
    },
    required_elements: input.requiredElements,
    source_refs: sourceRefsWithNotes(blueprint, input),
    taxonomy_targets: input.taxonomyTargets,
    title: input.title,
    version: Math.max(1, Number(blueprint.version) || 1) + 1,
  };
  const changed =
    stableJson(blueprintComparableFields(nextBlueprint)) !==
    stableJson(blueprintComparableFields(blueprint));
  const quality = validateQuestionBlueprintQuality({
    blueprint: nextBlueprint,
    evidenceSnippets: input.sourceEvidenceNotes,
    knownAssignableTagIds,
  });

  return {
    changed,
    nextBlueprint,
    quality,
    updatePayload: {
      answer_spec_pattern: nextBlueprint.answer_spec_pattern,
      difficulty_profile: nextBlueprint.difficulty_profile,
      distractor_pattern: nextBlueprint.distractor_pattern,
      generation_constraints: nextBlueprint.generation_constraints,
      generation_readiness: "uncalibrated",
      last_calibrated_at: null,
      last_calibration_run_id: null,
      originality_constraints: nextBlueprint.originality_constraints,
      question_pattern: nextBlueprint.question_pattern,
      required_elements: nextBlueprint.required_elements,
      source_refs: nextBlueprint.source_refs,
      taxonomy_targets: nextBlueprint.taxonomy_targets,
      title: nextBlueprint.title,
      version: nextBlueprint.version,
    },
  };
}

export function buildBlueprintSplitDrafts({
  blueprint,
  titles,
}: {
  blueprint: QuestionBlueprintRow;
  titles: string[];
}) {
  return uniqueStrings(titles, 5).map((title, index) => ({
    answer_spec_pattern: blueprint.answer_spec_pattern,
    difficulty_profile: blueprint.difficulty_profile,
    distractor_pattern: blueprint.distractor_pattern,
    generation_constraints: blueprint.generation_constraints,
    generation_readiness: "uncalibrated",
    originality_constraints: blueprint.originality_constraints,
    owner_scope: blueprint.owner_scope,
    question_pattern: {
      ...asRecord(blueprint.question_pattern),
      splitNote: `Draft split ${index + 1} from source blueprint.`,
    },
    required_elements: blueprint.required_elements,
    source_refs: {
      ...asRecord(blueprint.source_refs),
      splitFromBlueprintId: asRecord(blueprint.source_refs).blueprintId ?? null,
    },
    status: "draft",
    taxonomy_targets: blueprint.taxonomy_targets,
    title,
    version: 1,
  }));
}

export function buildBlueprintMergePreview({
  source,
  target,
}: {
  source: QuestionBlueprintRow & { id?: string };
  target: QuestionBlueprintRow & { id?: string };
}) {
  const mergedTargets = Object.fromEntries(
    FACETS.map((facet) => [
      facet,
      uniqueStrings([
        ...((source.taxonomy_targets?.[facet] ?? []) as string[]),
        ...((target.taxonomy_targets?.[facet] ?? []) as string[]),
      ], 16),
    ]),
  );

  return {
    answer_spec_pattern: target.answer_spec_pattern,
    difficulty_profile: target.difficulty_profile,
    distractor_pattern: uniqueStrings([
      ...target.distractor_pattern,
      ...source.distractor_pattern,
    ], 16),
    generation_constraints: uniqueStrings([
      ...target.generation_constraints,
      ...source.generation_constraints,
    ], 20),
    generation_readiness: "uncalibrated",
    originality_constraints: uniqueStrings([
      ...target.originality_constraints,
      ...source.originality_constraints,
    ], 20),
    owner_scope: target.owner_scope,
    question_pattern: {
      ...asRecord(target.question_pattern),
      mergedFromBlueprintIds: [source.id, target.id].filter(Boolean),
      sourcePattern: asRecord(source.question_pattern).pattern ?? source.question_pattern,
    },
    required_elements: uniqueStrings([
      ...target.required_elements,
      ...source.required_elements,
    ], 24),
    source_refs: {
      ...asRecord(target.source_refs),
      mergedFromBlueprintIds: [source.id, target.id].filter(Boolean),
      sourceRefs: [source.source_refs, target.source_refs],
    },
    status: "draft",
    taxonomy_targets: mergedTargets,
    title: `Merged: ${target.title}`,
    version: 1,
  };
}

export function createMergedBlueprintDraft(args: {
  source: QuestionBlueprintRow & { id?: string };
  target: QuestionBlueprintRow & { id?: string };
}) {
  return buildBlueprintMergePreview(args);
}

export function markBlueprintReplacement({
  blueprint,
  replacementBlueprintId,
}: {
  blueprint: QuestionBlueprintRow;
  replacementBlueprintId: string;
}) {
  return {
    deleted_at: null,
    source_refs: {
      ...asRecord(blueprint.source_refs),
      replacedByBlueprintId: replacementBlueprintId,
      replacementMarkedAt: new Date().toISOString(),
    },
    status: "deprecated",
  };
}
