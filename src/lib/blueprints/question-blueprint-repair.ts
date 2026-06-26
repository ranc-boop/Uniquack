import "server-only";

import { parseQuestionBlueprintGenerationProviderText } from "@/lib/blueprints/question-blueprint-generation";
import type {
  GeneratedBlueprintQuestionDraft,
  QuestionBlueprintGenerationProvider,
  QuestionBlueprintGenerationRequest,
  QuestionBlueprintGenerationResult,
} from "@/lib/blueprints/question-blueprint-generation";
import type { QuestionBlueprintModelQualityMode } from "@/lib/blueprints/question-blueprint-model-routing";

export type QuestionBlueprintRepairRequest = {
  attemptIndex: number;
  context: "calibration" | "generation";
  failedDraft: GeneratedBlueprintQuestionDraft;
  modelQualityMode: QuestionBlueprintModelQualityMode;
  request: QuestionBlueprintGenerationRequest;
  validatorBlockers: string[];
};

export type QuestionBlueprintRepairAttempt = {
  attemptIndex: number;
  blockerCount: number;
  context: "calibration" | "generation";
  modelName: string;
  modelQualityMode: QuestionBlueprintModelQualityMode;
  provider: "deepseek";
  remainingBlockers: string[];
  repairInstructions: string[];
  repairedDraft?: GeneratedBlueprintQuestionDraft;
  status: "succeeded" | "failed";
};

export type QuestionBlueprintRepairResult = {
  attempt: QuestionBlueprintRepairAttempt;
  draft: GeneratedBlueprintQuestionDraft;
};

const QUESTION_BLUEPRINT_REPAIR_TIMEOUT_MS = 90_000;

function boundedText(value: unknown, max = 800) {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionIds(options: unknown[]) {
  return options
    .map((option) => asRecord(option).id)
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
}

function answerSpecKind(value: unknown) {
  const kind = asRecord(value).kind;

  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function correctOptionReference(answerSpec: unknown) {
  const record = asRecord(answerSpec);
  const candidates = [
    record.correctOptionId,
    record.correct_option_id,
    record.correctAnswer,
    record.correct_answer,
    record.answer,
  ];

  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function blockerText(blockers: string[]) {
  return blockers.join(" ").toLowerCase();
}

function repairInstructionsFor({
  failedDraft,
  request,
  validatorBlockers,
}: {
  failedDraft: GeneratedBlueprintQuestionDraft;
  request: QuestionBlueprintGenerationRequest;
  validatorBlockers: string[];
}) {
  const blockers = blockerText(validatorBlockers);
  const instructions = [
    "Repair only this draft. Do not change the approved blueprint.",
    "Return JSON only with exactly one repaired draft question.",
    "Use only the existing valid taxonomyTagIds supplied in the request.",
    "Do not include raw source text, provider responses, private URLs, image bytes, base64, or secrets.",
  ];

  if (
    failedDraft.questionType === "mcq" ||
    request.questionType === "mcq" ||
    /mcq|option|correct option|distractor/.test(blockers)
  ) {
    instructions.push(
      "Return a complete MCQ draft with a clear question stem.",
      "Include exactly four answer options with stable A/B/C/D ids.",
      "Mark exactly one correct option through answerSpec.kind = \"mcq\" and answerSpec.correctOptionId.",
      "Include plausible distractor guidance in answerSpec and a concise explanation in solutionHtml.",
    );
  }

  if (request.questionType !== "frq" && failedDraft.questionType === "frq") {
    instructions.push(
      "Do not silently convert this blueprint to FRQ; preserve the requested question type.",
    );
  }

  if (/taxonomy|tag/.test(blockers)) {
    instructions.push(
      "Do not invent taxonomy ids. Reuse only the provided taxonomyTagIds.",
    );
  }

  if (/originality|copy|copied|evidence|wording|numbers/.test(blockers)) {
    instructions.push(
      "Change scenario, wording, and numeric surface details while preserving the same assessment structure.",
    );
  }

  return uniqueStrings(instructions);
}

export function buildBlueprintRepairPrompt(repairRequest: QuestionBlueprintRepairRequest) {
  const { failedDraft, request, validatorBlockers } = repairRequest;
  const payload = {
    answerSpecPattern: request.blueprint.answer_spec_pattern,
    blueprintTitle: request.blueprint.title,
    distractorPattern: request.blueprint.distractor_pattern,
    failedSamplePreview: {
      answerSpec: failedDraft.answerSpec,
      contentHtmlPreview: boundedText(failedDraft.contentHtml, 1000),
      difficulty: failedDraft.difficulty,
      options: failedDraft.options.slice(0, 6),
      questionType: failedDraft.questionType,
      solutionHtmlPreview: boundedText(failedDraft.solutionHtml, 1000),
      taxonomyTagIds: failedDraft.taxonomyTagIds.slice(0, 12),
      title: boundedText(failedDraft.title, 240),
    },
    generationConstraints: request.blueprint.generation_constraints,
    originalityConstraints: request.blueprint.originality_constraints,
    outputSchema: {
      questions: [
        {
          answerSpec: {},
          contentHtml: "<p>...</p>",
          difficulty: failedDraft.difficulty || request.difficultyTarget || 500,
          options: [],
          questionType: request.questionType,
          solutionHtml: "<p>...</p>",
          taxonomyTagIds: request.taxonomyTagIds,
          title: "Repaired draft title",
        },
      ],
    },
    questionPattern: request.blueprint.question_pattern,
    questionType: request.questionType,
    repairInstructions: repairInstructionsFor({
      failedDraft,
      request,
      validatorBlockers,
    }),
    requiredElements: request.blueprint.required_elements,
    sourceEvidenceSnippetsForDoNotCopy: request.sourceEvidenceSnippets.slice(0, 6),
    taxonomyTagIds: request.taxonomyTagIds,
    validatorBlockers: validatorBlockers.slice(0, 12),
  };

  return [
    "You are repairing one generated draft question that failed deterministic app validation.",
    "You are not the final judge. The app will re-run local validators after this repair.",
    "Do not weaken, reinterpret, or bypass validation blockers.",
    "Do not change the blueprint question type, taxonomy targets, or source constraints.",
    "Return a single JSON object matching outputSchema.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

export function validateRepairedBlueprintDraft({
  draft,
  originalDraft,
  request,
}: {
  draft: GeneratedBlueprintQuestionDraft;
  originalDraft: GeneratedBlueprintQuestionDraft;
  request: QuestionBlueprintGenerationRequest;
}) {
  const warnings = [...draft.validationWarnings];
  const allowedTags = new Set(request.taxonomyTagIds);
  const invalidTags = draft.taxonomyTagIds.filter((tagId) => !allowedTags.has(tagId));

  if (draft.blocked) {
    warnings.push("Repaired draft is still blocked by generation validation.");
  }
  if (draft.questionType !== request.questionType) {
    warnings.push("Repaired draft changed the requested question type.");
  }
  if (request.questionType !== "frq" && draft.questionType !== originalDraft.questionType) {
    warnings.push("Repaired draft changed question type instead of repairing the sample.");
  }
  if (invalidTags.length) {
    warnings.push(`Repaired draft invented taxonomy ids: ${invalidTags.slice(0, 6).join(", ")}.`);
  }
  if (!draft.taxonomyTagIds.length) {
    warnings.push("Repaired draft is missing taxonomy tags.");
  }
  if (request.questionType === "mcq") {
    const ids = optionIds(draft.options);
    const correctRef = correctOptionReference(draft.answerSpec);

    if (answerSpecKind(draft.answerSpec) !== "mcq") {
      warnings.push("Repaired MCQ draft needs answerSpec kind mcq.");
    }
    if (draft.options.length < 2) {
      warnings.push("Repaired MCQ draft requires at least two options.");
    }
    if (!correctRef || !ids.includes(correctRef)) {
      warnings.push("Repaired MCQ draft needs a valid correct option reference.");
    }
  }

  return {
    valid: uniqueStrings(warnings).length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function summarizeBlueprintRepairAttempt(attempt: QuestionBlueprintRepairAttempt) {
  return {
    attemptIndex: attempt.attemptIndex,
    blockerCount: attempt.blockerCount,
    context: attempt.context,
    modelName: attempt.modelName,
    modelQualityMode: attempt.modelQualityMode,
    provider: attempt.provider,
    remainingBlockers: attempt.remainingBlockers.slice(0, 8),
    repairInstructionCount: attempt.repairInstructions.length,
    status: attempt.status,
  };
}

export async function runBlueprintDraftRepair({
  provider,
  repairRequest,
}: {
  provider: QuestionBlueprintGenerationProvider;
  repairRequest: QuestionBlueprintRepairRequest;
}): Promise<QuestionBlueprintRepairResult> {
  const response = await fetch(endpoint(provider.base_url), {
    body: JSON.stringify({
      messages: [
        {
          content: buildBlueprintRepairPrompt(repairRequest),
          role: "user",
        },
      ],
      model: provider.model,
      response_format: { type: "json_object" },
      temperature: repairRequest.modelQualityMode === "quality" ? 0.25 : 0.35,
    }),
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(QUESTION_BLUEPRINT_REPAIR_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek blueprint repair failed with provider status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const providerText = payload.choices?.[0]?.message?.content;

  if (!providerText) {
    throw new Error("DeepSeek blueprint repair returned no message content.");
  }

  const generationResult = parseQuestionBlueprintGenerationProviderText({
    providerText,
    request: {
      ...repairRequest.request,
      count: 1,
    },
  });
  const repairedDraft =
    generationResult.acceptedDrafts[0] ??
    generationResult.blockedDrafts[0] ??
    repairRequest.failedDraft;
  const validation = validateRepairedBlueprintDraft({
    draft: repairedDraft,
    originalDraft: repairRequest.failedDraft,
    request: repairRequest.request,
  });
  const repairInstructions = repairInstructionsFor({
    failedDraft: repairRequest.failedDraft,
    request: repairRequest.request,
    validatorBlockers: repairRequest.validatorBlockers,
  });
  const attempt: QuestionBlueprintRepairAttempt = {
    attemptIndex: repairRequest.attemptIndex,
    blockerCount: repairRequest.validatorBlockers.length,
    context: repairRequest.context,
    modelName: provider.model,
    modelQualityMode: repairRequest.modelQualityMode,
    provider: "deepseek",
    remainingBlockers: validation.warnings,
    repairInstructions,
    repairedDraft,
    status: validation.valid ? "succeeded" : "failed",
  };

  return {
    attempt,
    draft: validation.valid
      ? {
          ...repairedDraft,
          validationWarnings: uniqueStrings([
            ...repairedDraft.validationWarnings,
            "Draft was repaired after deterministic validation blockers.",
          ]),
        }
      : {
          ...repairedDraft,
          blocked: true,
          validationWarnings: uniqueStrings(validation.warnings),
        },
  };
}

export async function repairQuestionBlueprintGenerationResult({
  generationResult,
  modelQualityMode,
  provider,
  repairEnabled,
}: {
  generationResult: QuestionBlueprintGenerationResult;
  modelQualityMode: QuestionBlueprintModelQualityMode;
  provider: QuestionBlueprintGenerationProvider;
  repairEnabled: boolean;
}): Promise<QuestionBlueprintGenerationResult> {
  if (!repairEnabled || !generationResult.blockedDrafts.length) {
    return {
      ...generationResult,
      repairAttempts: [],
      stats: {
        ...generationResult.stats,
        repairAttemptCount: 0,
      },
    };
  }

  const acceptedDrafts = [...generationResult.acceptedDrafts];
  const blockedDrafts: GeneratedBlueprintQuestionDraft[] = [];
  const repairAttempts: QuestionBlueprintRepairAttempt[] = [];

  for (const draft of generationResult.blockedDrafts) {
    const repairResult = await runBlueprintDraftRepair({
      provider,
      repairRequest: {
        attemptIndex: repairAttempts.length + 1,
        context: "generation",
        failedDraft: draft,
        modelQualityMode,
        request: generationResult.request,
        validatorBlockers: draft.validationWarnings,
      },
    });
    repairAttempts.push(repairResult.attempt);

    if (repairResult.attempt.status === "succeeded" && !repairResult.draft.blocked) {
      acceptedDrafts.push(repairResult.draft);
    } else {
      blockedDrafts.push(repairResult.draft);
    }
  }

  return {
    ...generationResult,
    acceptedDrafts,
    blockedDrafts,
    repairAttempts,
    stats: {
      ...generationResult.stats,
      acceptedCount: acceptedDrafts.length,
      blockedCount: blockedDrafts.length,
      providerCallCount:
        generationResult.stats.providerCallCount + repairAttempts.length,
      repairAttemptCount: repairAttempts.length,
    },
    warnings: uniqueStrings([
      ...generationResult.warnings,
      ...repairAttempts
        .filter((attempt) => attempt.status === "failed")
        .map(() => "Blueprint repair was attempted but validation blockers remain."),
    ]),
  };
}
