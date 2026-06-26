import "server-only";

import type { QuestionBlueprintRow } from "@/lib/blueprints/question-blueprint-persistence";

export type QuestionBlueprintVersionSnapshot = {
  blueprintId: string;
  changeReason: string;
  createdAt: string;
  nextVersion: number;
  snapshot: Record<string, unknown>;
  version: number;
};

export type QuestionBlueprintVersionHistorySummary = {
  latestVersion: number;
  versionCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedText(value: unknown, max = 800) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

export function createBlueprintVersionSnapshot({
  blueprint,
  blueprintId,
  changeReason,
}: {
  blueprint: QuestionBlueprintRow;
  blueprintId: string;
  changeReason: string;
}): QuestionBlueprintVersionSnapshot {
  const version = Number.isFinite(Number(blueprint.version))
    ? Math.max(1, Math.trunc(Number(blueprint.version)))
    : 1;

  return {
    blueprintId,
    changeReason: boundedText(changeReason, 800) || "Blueprint changed by admin.",
    createdAt: new Date().toISOString(),
    nextVersion: version + 1,
    snapshot: {
      answer_spec_pattern: asRecord(blueprint.answer_spec_pattern),
      deleted_at: blueprint.deleted_at ?? null,
      difficulty_profile: asRecord(blueprint.difficulty_profile),
      distractor_pattern: blueprint.distractor_pattern ?? [],
      folder_id: blueprint.folder_id ?? null,
      generation_constraints: blueprint.generation_constraints ?? [],
      generation_readiness: blueprint.generation_readiness ?? "uncalibrated",
      last_calibrated_at: blueprint.last_calibrated_at ?? null,
      last_calibration_run_id: blueprint.last_calibration_run_id ?? null,
      originality_constraints: blueprint.originality_constraints ?? [],
      owner_scope: blueprint.owner_scope,
      question_pattern: asRecord(blueprint.question_pattern),
      required_elements: blueprint.required_elements ?? [],
      source_refs: asRecord(blueprint.source_refs),
      status: blueprint.status,
      taxonomy_targets: asRecord(blueprint.taxonomy_targets),
      title: blueprint.title,
      version,
    },
    version,
  };
}

export function summarizeBlueprintVersionHistory(
  versions: Array<{ version?: number | null }>,
): QuestionBlueprintVersionHistorySummary {
  const versionNumbers = versions
    .map((entry) => Number(entry.version))
    .filter(Number.isFinite)
    .map((version) => Math.trunc(version));

  return {
    latestVersion: versionNumbers.length ? Math.max(...versionNumbers) : 0,
    versionCount: versionNumbers.length,
  };
}
