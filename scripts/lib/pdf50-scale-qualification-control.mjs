import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const controlPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "pdf50-scale-qualification-control.json",
);

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`invalid_pdf50_scale_control:${name}`);
  }
  return value;
}

function nonnegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid_pdf50_scale_control:${name}`);
  }
  return value;
}

function stageControl(value, stage) {
  const parsed = value && typeof value === "object" ? value : {};
  return Object.freeze({
    cancelled: nonnegativeInteger(parsed.cancelled, `${stage}.cancelled`),
    checkpointInterruption: parsed.checkpointInterruption === true,
    completed: positiveInteger(parsed.completed, `${stage}.completed`),
    files: positiveInteger(parsed.files, `${stage}.files`),
    providerAttempts: positiveInteger(
      parsed.providerAttempts,
      `${stage}.providerAttempts`,
    ),
  });
}

export async function loadPDF50ScaleQualificationControl() {
  const parsed = JSON.parse(await readFile(controlPath, "utf8"));
  const control = Object.freeze({
    approvedBudgetUsd: positiveInteger(
      parsed.approvedBudgetUsd,
      "approvedBudgetUsd",
    ),
    cleanupConfirmation: String(parsed.cleanupConfirmation ?? ""),
    conservativeInputTokensPerProviderAttempt: positiveInteger(
      parsed.conservativeInputTokensPerProviderAttempt,
      "conservativeInputTokensPerProviderAttempt",
    ),
    environment: String(parsed.environment ?? ""),
    maxExpectedQueueDepth: positiveInteger(
      parsed.maxExpectedQueueDepth,
      "maxExpectedQueueDepth",
    ),
    releaseLimit: positiveInteger(parsed.releaseLimit, "releaseLimit"),
    schema: String(parsed.schema ?? ""),
    stages: Object.freeze({
      4: stageControl(parsed.stages?.["4"], "4"),
      10: stageControl(parsed.stages?.["10"], "10"),
      50: stageControl(parsed.stages?.["50"], "50"),
    }),
  });

  if (
    control.schema !== "edustruct.pdf50-scale-qualification-control.v1" ||
    control.environment !== "DISPOSABLE_PDF50_SCALE_QUALIFICATION" ||
    control.cleanupConfirmation !==
      "DELETE_PDF50_SCALE_QUALIFICATION_FIXTURES" ||
    control.approvedBudgetUsd !== 2 ||
    control.releaseLimit > 4 ||
    control.maxExpectedQueueDepth > 5 ||
    control.stages[4].files !== 4 ||
    control.stages[10].files !== 10 ||
    control.stages[50].files !== 50 ||
    control.stages[10].completed + control.stages[10].cancelled !== 10 ||
    control.stages[4].cancelled !== 0 ||
    control.stages[50].cancelled !== 0
  ) {
    throw new Error("invalid_pdf50_scale_control:safety_boundary");
  }

  return control;
}

export function estimatePDF50ScaleStageCostMicros({
  control,
  outputTokensPerAttempt,
  stage,
  inputMicrosPerMillion,
  outputMicrosPerMillion,
}) {
  const stageControlValue = control.stages[stage];
  if (!stageControlValue) {
    throw new Error("invalid_pdf50_scale_control:stage");
  }
  const inputCost = Math.ceil(
    (control.conservativeInputTokensPerProviderAttempt *
      inputMicrosPerMillion) /
      1_000_000,
  );
  const outputCost = Math.ceil(
    (outputTokensPerAttempt * outputMicrosPerMillion) / 1_000_000,
  );
  return stageControlValue.providerAttempts * (inputCost + outputCost);
}

export function parsePriorConservativeMicros(value) {
  if (!/^(0|[1-9][0-9]{0,7})$/.test(String(value ?? ""))) {
    throw new Error("invalid_pdf50_scale_control:prior_cost");
  }
  return Number(value);
}
