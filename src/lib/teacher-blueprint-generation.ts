import "server-only";

import { randomUUID } from "node:crypto";

import { parsePossiblyMalformedJson } from "@/lib/ai-providers/json-repair";
import {
  getAiProviderCapabilities,
  inferAiProviderMode,
} from "@/lib/ai-providers/adapters";
import {
  generateWithGeminiNativeText,
  type GeminiNativeUsage,
} from "@/lib/ai-providers/gemini-native";
import {
  classifyAIProviderError,
  isAIProviderError,
  safeAIProviderErrorState,
} from "@/lib/ai-providers/errors";
import { runWithAIProviderRetry } from "@/lib/ai-providers/resilience";
import {
  resolveAIProviderRoute,
  runWithAIProviderRoute,
} from "@/lib/ai-providers/routing";
import {
  isMockAIProviderUrl,
  assertMockAIProviderAllowed,
} from "@/lib/ai-providers/mock";
import { assertSafeAIProviderBaseUrl } from "@/lib/ai-providers/network-safety";
import { readResponseJsonWithLimit } from "@/lib/ai-providers/response-limits";
import {
  listEnabledAIProviderProfilesForServerUse,
  loadAIProviderProfileForServerUse,
  type SafeAIProviderProfile,
} from "@/lib/ai-providers/profiles";
import {
  importBatchImportJson,
  resolveImportOrganizationContext,
} from "@/lib/batch-import/service";
import { normalizeAnswerSpec } from "@/lib/questions/answer-spec";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
  listBankApprovedQuestions,
} from "@/lib/question-banks";
import {
  displayTextFromPattern,
  readinessChecklist,
  sourceExampleCount,
} from "@/lib/teacher-blueprint-builder";
import type {
  QuestionBlueprint,
  QuestionType,
} from "@/types/database";

type SupabaseLike = {
  from: (table: string) => any;
};

type ProviderForUse = Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>;

type BlueprintSourceExample = {
  content: string;
  difficulty: number | null;
  id: string;
  questionType: string;
  title: string;
};

type BlueprintGenerationRequest = {
  answerPattern: string;
  blueprintId: string;
  count: number;
  difficultyMix: string;
  distractorPattern: string;
  originalityConstraints: string;
  questionPattern: string;
  questionType: QuestionType;
  requiredElements: string[];
  sourceExamples: BlueprintSourceExample[];
  taxonomyTagIds: string[];
  title: string;
};

type GeneratedBlueprintQuestion = {
  answerSpec: unknown;
  contentSource: string;
  difficulty: number;
  options: Array<{
    content_html: string;
    content_source: string;
    id: string;
    label?: string;
  }>;
  questionType: QuestionType;
  solutionSource: string | null;
  tagIds: string[];
  title: string;
  warnings: string[];
};

type GeneratedBlueprintImportItem = {
  ai_metadata: Record<string, unknown>;
  answer_spec: unknown;
  code: string;
  content_source: string;
  content_source_format: "markdown_latex";
  difficulty_rating: number;
  options: GeneratedBlueprintQuestion["options"];
  question_type: QuestionType;
  solution_source: string;
  solution_source_format: "markdown_latex";
  status: "draft";
  tag_ids: string[];
  title: string;
};

export type TeacherBlueprintGenerationGate = {
  blockingReasons: string[];
  expectedDraftCount: number;
  providerAvailable: boolean;
  ready: boolean;
  targetBankId: string | null;
};

export type TeacherBlueprintGenerationSummary = {
  batchId: string | null;
  blockedDraftCount: number;
  createdDraftCount: number;
  fallbackUsed: boolean;
  providerStrategy: string;
  safeProviderId?: string;
  safeProviderModel?: string;
  providerRoutePolicyVersion?: number | null;
  providerRoutePosition?: number | null;
  providerSafeName?: string;
  reviewRoute: string;
  targetBankId: string;
  warningCount: number;
};

export const TEACHER_BLUEPRINT_TRANSIENT_PROVIDER_FAILURE_MESSAGE =
  "The AI provider is temporarily busy. No questions were published or assigned. The Blueprint and target Library were preserved; retry later.";

const SUPPORTED_QUESTION_TYPES = new Set<QuestionType>([
  "mcq",
  "fill_blank",
  "frq",
  "mixed",
]);
const BLUEPRINT_GENERATION_TIMEOUT_MS = 120_000;
const BLUEPRINT_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown, limit = 16) {
  return asArray(value)
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, limit);
}

function boundedText(value: unknown, limit: number) {
  return stringValue(value).replace(/\s+/g, " ").slice(0, limit);
}

function clampCount(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.min(5, Math.max(1, Math.trunc(parsed)));
}

function clampDifficulty(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 500;
  }

  return Math.min(1000, Math.max(0, Math.trunc(parsed)));
}

function normalizeQuestionType(value: unknown): QuestionType {
  const normalized = stringValue(value).toLowerCase();

  return SUPPORTED_QUESTION_TYPES.has(normalized as QuestionType)
    ? (normalized as QuestionType)
    : "frq";
}

function normalizeHtmlToSource(value: unknown) {
  return stringValue(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function safeCodePart(value: string) {
  return (
    value
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "draft"
  );
}

function questionCode({
  blueprintId,
  index,
  requestId,
  title,
}: {
  blueprintId: string;
  index: number;
  requestId: string;
  title: string;
}) {
  return `BP-${blueprintId.slice(0, 8)}-${requestId.slice(0, 8)}-${index + 1}-${safeCodePart(title)}`.slice(0, 80);
}

function blueprintExpectedDraftCount(blueprint: QuestionBlueprint) {
  const constraints = asRecord(blueprint.generation_constraints);

  return clampCount(constraints.expectedQuestionCount);
}

function blueprintQuestionType(blueprint: QuestionBlueprint): QuestionType {
  const constraints = asRecord(blueprint.generation_constraints);
  const questionTypeMix = asRecord(constraints.questionTypeMix);
  const teacherMix = stringValue(questionTypeMix.teacherMix).toLowerCase();

  if (teacherMix.includes("mcq") || teacherMix.includes("multiple")) {
    return "mcq";
  }
  if (teacherMix.includes("fill")) {
    return "fill_blank";
  }
  if (teacherMix.includes("mixed")) {
    return "mixed";
  }
  if (teacherMix.includes("frq") || teacherMix.includes("free")) {
    return "frq";
  }

  const observed = asRecord(questionTypeMix.observed);
  const [firstObserved] = Object.keys(observed);

  return normalizeQuestionType(firstObserved);
}

function taxonomyTagIdsFromBlueprint(blueprint: QuestionBlueprint) {
  const targets = blueprint.taxonomy_targets;
  const values = Array.isArray(targets)
    ? targets.flatMap((item) => {
        if (typeof item === "string") return [item];
        const record = asRecord(item);

        return [
          record.tag_id,
          record.tagId,
          record.id,
        ].map((value) => stringValue(value));
      })
    : Object.values(asRecord(targets)).flatMap((value) =>
        Array.isArray(value)
          ? value.map((item) => stringValue(item))
          : [stringValue(value)],
      );

  return Array.from(new Set(values.filter(Boolean)));
}

async function activeAssignableTagIds({
  tagIds,
  supabase,
}: {
  tagIds: string[];
  supabase: SupabaseLike;
}) {
  if (!tagIds.length) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("taxonomy_nodes")
    .select("tag_id")
    .in("tag_id", tagIds)
    .eq("status", "active")
    .eq("is_assignable", true)
    .eq("node_kind", "tag")
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row: { tag_id: string }) => row.tag_id));
}

export async function listTeacherBlueprintGenerationProviderStatus(
  supabase: SupabaseLike,
) {
  try {
    const profiles = await listEnabledAIProviderProfilesForServerUse();

    return {
      available: profiles.some((profile) => providerSupportsBlueprintGeneration(profile)),
      enabledCount: profiles.length,
    };
  } catch {
    return {
      available: false,
      enabledCount: 0,
    };
  }
}

function providerSupportsBlueprintGeneration(profile: SafeAIProviderProfile) {
  const capabilities = getAiProviderCapabilities(profile);

  return capabilities.supportsText && capabilities.supportsJsonMode;
}

async function resolveTeacherBlueprintGenerationProvider(supabase: SupabaseLike) {
  let profiles: SafeAIProviderProfile[];

  try {
    profiles = await listEnabledAIProviderProfilesForServerUse();
  } catch {
    throw new Error("AI generation is not enabled. Ask an admin to check AI Settings.");
  }

  const candidate = profiles.find(providerSupportsBlueprintGeneration);

  if (!candidate) {
    throw new Error("AI generation is not enabled. Ask an admin to enable a shared text-capable provider.");
  }

  return loadAIProviderProfileForServerUse({
    profileId: candidate.id,
  });
}

function sourceQuestionIdsFromBlueprint(blueprint: QuestionBlueprint) {
  return Array.from(
    new Set(
      asArray(blueprint.source_refs)
        .map((item) => stringValue(asRecord(item).question_id))
        .filter(Boolean),
    ),
  );
}

async function loadBlueprintSourceExamples({
  bankId,
  blueprint,
  supabase,
}: {
  bankId: string;
  blueprint: QuestionBlueprint;
  supabase: SupabaseLike;
}) {
  const sourceIds = sourceQuestionIdsFromBlueprint(blueprint);

  if (!sourceIds.length) {
    throw new Error("Blueprint needs at least one selected approved source question.");
  }

  const approvedQuestions = await listBankApprovedQuestions({
    bankId,
    supabase: supabase as never,
  });
  const approvedSourceIds = new Set(
    approvedQuestions
      .filter((row) => row.status === "active")
      .map((row) => row.question?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const approvedSelectedIds = sourceIds.filter((id) => approvedSourceIds.has(id));

  if (!approvedSelectedIds.length) {
    throw new Error("Blueprint source questions must still be approved in the linked Library.");
  }

  const { data, error } = await supabase
    .from("questions")
    .select("id, title, question_type, difficulty_rating, content_source, content_html")
    .in("id", approvedSelectedIds)
    .eq("owner_bank_id", bankId)
    .eq("status", "draft")
    .is("published_at", null)
    .limit(12);

  if (error) {
    throw new Error(error.message);
  }

  const examples = ((data ?? []) as Array<{
    content_html: string | null;
    content_source: string | null;
    difficulty_rating: number | null;
    id: string;
    question_type: string;
    title: string;
  }>).map((question) => ({
    content:
      boundedText(question.content_source, 700) ||
      boundedText(normalizeHtmlToSource(question.content_html), 700),
    difficulty: question.difficulty_rating,
    id: question.id,
    questionType: question.question_type,
    title: question.title,
  }));

  if (!examples.length) {
    throw new Error("Blueprint source examples could not be loaded from the linked Library.");
  }

  return examples;
}

export function buildTeacherBlueprintGenerationGate({
  blueprint,
  providerAvailable,
  targetBankId,
}: {
  blueprint: QuestionBlueprint;
  providerAvailable: boolean;
  targetBankId: string | null;
}): TeacherBlueprintGenerationGate {
  const blockingReasons = new Set<string>();

  for (const item of readinessChecklist(blueprint)) {
    if (!item.passed) {
      blockingReasons.add(`${item.label}: ${item.value}`);
    }
  }

  if (!targetBankId) {
    blockingReasons.add("Blueprint must be linked to a target Library.");
  }
  if (blueprint.deleted_at) {
    blockingReasons.add("Archived or deleted Blueprints cannot generate Review Drafts.");
  }
  if (
    ![
      "pending_review",
      "approved",
    ].includes(blueprint.status)
  ) {
    blockingReasons.add("Blueprint must be an active draft or approved planning asset.");
  }
  if (!providerAvailable) {
    blockingReasons.add("A shared AI generation provider is not enabled yet.");
  }

  return {
    blockingReasons: Array.from(blockingReasons),
    expectedDraftCount: blueprintExpectedDraftCount(blueprint),
    providerAvailable,
    ready: blockingReasons.size === 0,
    targetBankId,
  };
}

async function validateTeacherBlueprintGenerationReadiness({
  bankId,
  blueprint,
  supabase,
}: {
  bankId: string;
  blueprint: QuestionBlueprint;
  supabase: SupabaseLike;
}) {
  const providerStatus = await listTeacherBlueprintGenerationProviderStatus(supabase);
  const gate = buildTeacherBlueprintGenerationGate({
    blueprint,
    providerAvailable: providerStatus.available,
    targetBankId: bankId,
  });

  if (!gate.ready) {
    throw new Error(`Blueprint is not ready for generation: ${gate.blockingReasons.join(" ")}`);
  }

  const tagIds = taxonomyTagIdsFromBlueprint(blueprint);
  const activeTagIds = await activeAssignableTagIds({ tagIds, supabase });
  const invalidTagIds = tagIds.filter((tagId) => !activeTagIds.has(tagId));

  if (!tagIds.length || invalidTagIds.length) {
    throw new Error(
      invalidTagIds.length
        ? `Blueprint contains taxonomy targets that are not active assignable leaves: ${invalidTagIds.join(", ")}.`
        : "Blueprint needs active assignable taxonomy targets before generation.",
    );
  }

  return {
    tagIds,
  };
}

function buildGenerationRequest({
  blueprint,
  sourceExamples,
  tagIds,
}: {
  blueprint: QuestionBlueprint;
  sourceExamples: BlueprintSourceExample[];
  tagIds: string[];
}): BlueprintGenerationRequest {
  return {
    answerPattern: displayTextFromPattern(blueprint.answer_spec_pattern, "guidance"),
    blueprintId: blueprint.id,
    count: blueprintExpectedDraftCount(blueprint),
    difficultyMix: displayTextFromPattern(blueprint.difficulty_profile, "teacherMix"),
    distractorPattern: displayTextFromPattern(blueprint.distractor_pattern, "guidance"),
    originalityConstraints: displayTextFromPattern(blueprint.originality_constraints, "guidance"),
    questionPattern:
      displayTextFromPattern(blueprint.question_pattern, "summary") ||
      displayTextFromPattern(blueprint.question_pattern, "purpose") ||
      blueprint.description ||
      blueprint.title,
    questionType: blueprintQuestionType(blueprint),
    requiredElements: textList(blueprint.required_elements, 20),
    sourceExamples,
    taxonomyTagIds: tagIds,
    title: blueprint.title,
  };
}

export function buildTeacherBlueprintGenerationPrompt(
  request: BlueprintGenerationRequest,
) {
  const payload = {
    blueprintId: request.blueprintId,
    expectedQuestionCount: request.count,
    outputSchema: {
      questions: [
        {
          answer_spec: {
            kind: request.questionType,
          },
          content_source: "Markdown/LaTeX question prompt.",
          difficulty: 500,
          options:
            request.questionType === "mcq"
              ? [
                  { id: "A", content_source: "Option A" },
                  { id: "B", content_source: "Option B" },
                ]
              : [],
          question_type: request.questionType,
          solution_source: "Concise solution or explanation.",
          tag_ids: request.taxonomyTagIds,
          title: "Original draft title",
        },
      ],
      warnings: [],
    },
    pattern: {
      answerPattern: request.answerPattern,
      difficultyMix: request.difficultyMix,
      distractorPattern: request.distractorPattern,
      originalityConstraints: request.originalityConstraints,
      questionPattern: request.questionPattern,
      questionType: request.questionType,
      requiredElements: request.requiredElements,
      taxonomyTagIds: request.taxonomyTagIds,
    },
    sourceExamplesForStructureOnly: request.sourceExamples.map((example) => ({
      content: boundedText(example.content, 600),
      difficulty: example.difficulty,
      questionType: example.questionType,
      title: example.title,
    })),
  };

  return [
    "You generate original teacher Review Draft questions from a reusable assessment Blueprint.",
    "Do not copy source question wording, numbers, names, scenarios, diagrams, or surface details.",
    "Preserve only the assessment structure, required elements, taxonomy targets, answer pattern, and cognitive demand.",
    "Every output question must be private draft material for human review. Do not mark anything published or assigned.",
    "Return JSON only. Do not wrap the response in Markdown.",
    "For MCQ, include options and answer_spec.kind = \"mcq\" with correct_option_ids matching option ids.",
    "For fill_blank, include answer_spec.kind = \"fill_blank\" with final_answers or accepted_answers.",
    "Use Markdown/LaTeX in content_source and solution_source.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

function chatEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function mockBlueprintProviderText(request: BlueprintGenerationRequest) {
  return JSON.stringify({
    questions: Array.from({ length: request.count }).map((_, index) => ({
      answer_spec:
        request.questionType === "fill_blank"
          ? { accepted_answers: ["5"], final_answers: ["5"], kind: "fill_blank" }
          : { grading_mode: "manual_or_ai", kind: "frq" },
      content_source: `Create an original ${request.questionType} question following ${request.title}. What is 2 + 3?`,
      difficulty: 500,
      options: [],
      question_type: request.questionType === "mcq" ? "frq" : request.questionType,
      solution_source: "2 + 3 = 5.",
      tag_ids: request.taxonomyTagIds,
      title: `Mock Blueprint draft ${index + 1}`,
    })),
    warnings: ["Mock Blueprint generation provider response used."],
  });
}

async function callTeacherBlueprintGenerationProvider({
  profile,
  prompt,
  request,
}: {
  profile: ProviderForUse;
  prompt: string;
  request: BlueprintGenerationRequest;
}): Promise<{ text: string; usage: GeminiNativeUsage | null }> {
  if (isMockAIProviderUrl(profile.base_url)) {
    assertMockAIProviderAllowed();

    return { text: mockBlueprintProviderText(request), usage: null };
  }

  const mode = inferAiProviderMode(profile);

  if (mode === "gemini_native") {
    return generateWithGeminiNativeText({
        apiKey: profile.apiKey,
        baseUrl: profile.base_url,
        debugContext: {
          adapter: "gemini_native",
          blueprintId: request.blueprintId,
          operation: "teacher_blueprint_generation",
        },
        model: profile.model,
        prompt,
      });
  }

  let response: Response;

  try {
    await assertSafeAIProviderBaseUrl(profile.base_url);
    response = await fetch(chatEndpoint(profile.base_url), {
      body: JSON.stringify({
        messages: [{ content: prompt, role: "user" }],
        model: profile.model,
        response_format: { type: "json_object" },
        temperature: 0.35,
      }),
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(BLUEPRINT_GENERATION_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `AI provider request could not be reached: ${
        error instanceof Error ? error.message : "Unknown network error."
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(`AI provider request failed with status ${response.status}.`);
  }

  const payload = await readResponseJsonWithLimit<{
    choices?: { message?: { content?: string } }[];
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      total_tokens?: number;
    };
  }>(response, BLUEPRINT_RESPONSE_MAX_BYTES);
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI provider response did not include generated content.");
  }

  return {
    text: content,
    usage: payload.usage
      ? {
          cachedInputTokens: null,
          inputTokens: payload.usage.prompt_tokens ?? null,
          outputTokens: payload.usage.completion_tokens ?? null,
          totalTokens: payload.usage.total_tokens ?? null,
        }
      : null,
  };
}

function normalizeOption(
  option: unknown,
  index: number,
): GeneratedBlueprintQuestion["options"][number] | null {
  const record = asRecord(option);
  const id = boundedText(record.id ?? record.label, 16) || String.fromCharCode(65 + index);
  const source =
    boundedText(record.content_source, 2000) ||
    normalizeHtmlToSource(record.content_html) ||
    boundedText(record.text ?? record.label, 2000);

  return source
    ? {
        content_html: source,
        content_source: source,
        id,
        label: boundedText(record.label, 16) || id,
      }
    : null;
}

function normalizedAnswerSpec({
  answerSpec,
  options,
  questionType,
}: {
  answerSpec: unknown;
  options: GeneratedBlueprintQuestion["options"];
  questionType: QuestionType;
}) {
  const record = asRecord(answerSpec);

  if (questionType === "mcq") {
    const candidates = [
      ...asArray(record.correct_option_ids).map((value) => stringValue(value)),
      stringValue(record.correct_option_id),
      stringValue(record.correctOptionId),
      stringValue(record.correctAnswer),
      stringValue(record.correct_answer),
      stringValue(record.answer),
    ].filter(Boolean);
    const optionIds = new Set(options.map((option) => option.id));
    const correctOptionIds = candidates.filter((candidate) => optionIds.has(candidate));

    return normalizeAnswerSpec({
      allow_multiple: correctOptionIds.length > 1,
      correct_option_ids: correctOptionIds,
      kind: "mcq",
    });
  }

  if (questionType === "fill_blank") {
    const finalAnswers = [
      ...asArray(record.final_answers).map((value) => stringValue(value)),
      ...asArray(record.accepted_answers).map((value) => stringValue(value)),
      stringValue(record.answer),
      stringValue(record.final_answer),
    ].filter(Boolean);

    return normalizeAnswerSpec({
      accepted_answers: finalAnswers,
      final_answers: finalAnswers.slice(0, 8),
      kind: "fill_blank",
    });
  }

  return normalizeAnswerSpec({
    ...record,
    kind: questionType,
  });
}

function parseGeneratedQuestions({
  providerText,
  request,
}: {
  providerText: string;
  request: BlueprintGenerationRequest;
}) {
  const parsed = parsePossiblyMalformedJson(providerText);
  const root = asRecord(parsed);
  const items = asArray(root.questions ?? root.draftQuestions);
  const rootWarnings = textList(root.warnings, 12);
  const accepted: GeneratedBlueprintQuestion[] = [];
  const blockedWarnings: string[] = [];

  for (const item of items.slice(0, request.count)) {
    const record = asRecord(item);
    const questionType = normalizeQuestionType(record.question_type ?? record.questionType ?? request.questionType);
    const title = boundedText(record.title, 240);
    const contentSource =
      boundedText(record.content_source, 12_000) ||
      normalizeHtmlToSource(record.content_html);
    const solutionSource =
      boundedText(record.solution_source, 12_000) ||
      normalizeHtmlToSource(record.solution_html) ||
      null;
    const options = asArray(record.options)
      .map(normalizeOption)
      .filter((option): option is GeneratedBlueprintQuestion["options"][number] => Boolean(option));
    const answerSpec = normalizedAnswerSpec({
      answerSpec: record.answer_spec ?? record.answerSpec,
      options,
      questionType,
    });
    const providerTagIds = textList(record.tag_ids ?? record.taxonomyTagIds, 40);
    const tagIds = providerTagIds.filter((tagId) => request.taxonomyTagIds.includes(tagId));
    const warnings = textList(record.warnings, 8);
    const blockingReasons: string[] = [];

    if (!title) blockingReasons.push("Generated draft is missing a title.");
    if (!contentSource) blockingReasons.push("Generated draft is missing a prompt.");
    if (!tagIds.length) blockingReasons.push("Generated draft did not include valid Blueprint taxonomy tags.");
    if (questionType === "mcq" && options.length < 2) {
      blockingReasons.push("Generated MCQ draft needs at least two options.");
    }
    if (
      questionType === "mcq" &&
      (!asArray(asRecord(answerSpec).correct_option_ids).length)
    ) {
      blockingReasons.push("Generated MCQ draft needs a correct option reference.");
    }
    if (
      questionType === "fill_blank" &&
      !asArray(asRecord(answerSpec).final_answers).length &&
      !asArray(asRecord(answerSpec).accepted_answers).length
    ) {
      blockingReasons.push("Generated fill-blank draft needs final or accepted answers.");
    }

    if (blockingReasons.length) {
      blockedWarnings.push(...blockingReasons.map((reason) => `${title || "Untitled draft"}: ${reason}`));
      continue;
    }

    if (!solutionSource) {
      warnings.push("Missing solution or explanation; add solution guidance during review before approving.");
    }

    accepted.push({
      answerSpec,
      contentSource,
      difficulty: clampDifficulty(record.difficulty ?? record.difficulty_rating),
      options,
      questionType,
      solutionSource,
      tagIds,
      title,
      warnings,
    });
  }

  return {
    accepted,
    blockedWarnings,
    rootWarnings,
  };
}

function buildImportItems({
  blueprint,
  generated,
  providerStrategy,
  requestId,
}: {
  blueprint: QuestionBlueprint;
  generated: GeneratedBlueprintQuestion[];
  providerStrategy: string;
  requestId: string;
}) {
  return generated.map((draft, index): GeneratedBlueprintImportItem => ({
    ai_metadata: {
      blueprintId: blueprint.id,
      blueprintTitle: blueprint.title,
      providerStrategy,
      requestId,
      reviewRequired: true,
      source: "blueprint_generation",
      validationWarnings: draft.warnings,
    },
    answer_spec: draft.answerSpec,
    code: questionCode({
        blueprintId: blueprint.id,
        index,
        requestId,
        title: draft.title,
      }),
    content_source: draft.contentSource,
    content_source_format: "markdown_latex",
    difficulty_rating: draft.difficulty,
    options: draft.options,
    question_type: draft.questionType,
    solution_source: draft.solutionSource ?? "",
    solution_source_format: "markdown_latex",
    status: "draft",
    tag_ids: draft.tagIds,
    title: draft.title,
  }));
}

async function attachBlueprintReviewLineage({
  bankId,
  blockedWarnings,
  blueprint,
  generated,
  importBatchId,
  profileId,
  providerStrategy,
  request,
  requestId,
  rootWarnings,
  supabase,
}: {
  bankId: string;
  blockedWarnings: string[];
  blueprint: QuestionBlueprint;
  generated: GeneratedBlueprintQuestion[];
  importBatchId: string;
  profileId: string;
  providerStrategy: string;
  request: BlueprintGenerationRequest;
  requestId: string;
  rootWarnings: string[];
  supabase: SupabaseLike;
}) {
  const createdQuestionCodes = buildImportItems({
    blueprint,
    generated,
    providerStrategy,
    requestId,
  }).map((item) => item.code);
  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("id, question_code, title")
    .eq("owner_bank_id", bankId)
    .in("question_code", createdQuestionCodes)
    .eq("status", "draft")
    .is("published_at", null)
    .limit(50);

  if (questionError) {
    throw new Error(questionError.message);
  }

  const createdQuestions = (questions ?? []) as Array<{
    id: string;
    question_code: string;
    title: string;
  }>;

  if (!createdQuestions.length) {
    throw new Error("Blueprint generation did not create reviewable draft questions.");
  }

  const { data: importItems, error: importItemsError } = await supabase
    .from("import_batch_items")
    .select("created_question_id, validation_errors, raw_payload")
    .eq("batch_id", importBatchId)
    .in("created_question_id", createdQuestions.map((question) => question.id))
    .limit(50);

  if (importItemsError) {
    throw new Error(importItemsError.message);
  }

  type ImportItemRow = {
    created_question_id: string;
    raw_payload: unknown;
    validation_errors: unknown;
  };
  const importItemRows = (importItems ?? []) as ImportItemRow[];
  const importItemByQuestionId = new Map<string, ImportItemRow>(
    importItemRows.map((item) => [item.created_question_id, item]),
  );
  const { data: reviewBatch, error: reviewBatchError } = await supabase
    .from("review_batches")
    .insert({
      created_by: profileId,
      organization_id: blueprint.organization_id,
      source_kind: "blueprint_generation",
      source_record_id: importBatchId,
      status: "pending_review",
      summary: {
        blueprintGeneration: {
          blockedDraftCount: blockedWarnings.length,
          blueprintId: blueprint.id,
          blueprintTitle: blueprint.title,
          createdDraftCount: createdQuestions.length,
          providerStrategy,
          request,
          rootWarnings,
          sourceQuestionCount: sourceExampleCount(blueprint),
          targetBankId: bankId,
        },
        importedFrom: "teacher_blueprint_generation",
        reviewGate: "bank_review_required",
        reviewScope: "question_bank",
        targetBankId: bankId,
      },
      target_bank_id: bankId,
      title: `Blueprint Review Drafts: ${blueprint.title}`,
    } as never)
    .select("id")
    .single();

  if (reviewBatchError) {
    throw new Error(reviewBatchError.message);
  }

  const reviewBatchId = (reviewBatch as { id: string }).id;

  for (const question of createdQuestions) {
    const importItem = importItemByQuestionId.get(question.id);
    const rawPayload = asRecord(importItem?.raw_payload);
    const warnings = [
      ...textList(importItem?.validation_errors, 12),
      ...textList(asRecord(rawPayload.ai_metadata).validationWarnings, 8),
    ];
    const { data: reviewItem, error: reviewItemError } = await supabase
      .from("review_draft_items")
      .insert({
        created_question_id: question.id,
        draft_payload: {
          blueprintId: blueprint.id,
          blueprintTitle: blueprint.title,
          importBatchId,
          lineagedBy: "teacher_blueprint_generation",
          questionCode: question.question_code,
          questionId: question.id,
          source: "blueprint_generation",
          sourceQuestionCount: sourceExampleCount(blueprint),
          targetBankId: bankId,
          title: question.title,
        },
        item_kind: "question",
        review_batch_id: reviewBatchId,
        status: "pending_review",
        target_bank_id: bankId,
        validation_warnings: warnings,
      } as never)
      .select("id")
      .single();

    if (reviewItemError) {
      throw new Error(reviewItemError.message);
    }

    const reviewItemId = (reviewItem as { id: string }).id;
    const { error: questionUpdateError } = await supabase
      .from("questions")
      .update({
        published_at: null,
        source: `blueprint_generation:${blueprint.id}:${importBatchId}`,
        source_kind: "blueprint_generation",
        source_review_item_id: reviewItemId,
        status: "draft",
        updated_by: profileId,
      } as never)
      .eq("id", question.id)
      .eq("owner_bank_id", bankId)
      .eq("status", "draft")
      .is("published_at", null);

    if (questionUpdateError) {
      throw new Error(questionUpdateError.message);
    }
  }

  const { error: taxonomySourceError } = await supabase
    .from("question_taxonomy_assignments")
    .update({
      review_status: "pending_review",
      source: "teacher_course_blueprint_generation",
      updated_by: profileId,
    } as never)
    .in("question_id", createdQuestions.map((question) => question.id));

  if (taxonomySourceError) {
    throw new Error(taxonomySourceError.message);
  }

  return {
    createdQuestionCount: createdQuestions.length,
    reviewBatchId,
  };
}

async function updateBlueprintGenerationBatchSummary({
  batchId,
  blueprint,
  patch,
  supabase,
}: {
  batchId: string;
  blueprint: QuestionBlueprint;
  patch: Record<string, unknown>;
  supabase: SupabaseLike;
}) {
  const { data, error } = await supabase
    .from("import_batches")
    .select("summary")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const current = asRecord(data?.summary);
  const { error: updateError } = await supabase
    .from("import_batches")
    .update({
      summary: {
        ...current,
        blueprintGeneration: {
          ...asRecord(current.blueprintGeneration),
          blueprintId: blueprint.id,
          blueprintTitle: blueprint.title,
          ...patch,
        },
        importedFrom: "teacher_blueprint_generation",
        reviewGate: "bank_review_required",
        reviewScope: "question_bank",
      },
    } as never)
    .eq("id", batchId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function recordTeacherBlueprintGenerationFailure({
  bankId,
  blueprint,
  error,
  profileId,
  supabase,
}: {
  bankId: string;
  blueprint: QuestionBlueprint;
  error: unknown;
  profileId: string;
  supabase: SupabaseLike;
}) {
  const organizationContext = await resolveImportOrganizationContext({
    existingOrganizationId: blueprint.organization_id,
    profileId,
    supabase,
  });
  const classified = classifyAIProviderError({
    error,
    operation: "blueprint_generation",
  });
  const safeError = safeAIProviderErrorState({
    attemptCount: classified.attemptCount,
    error: classified,
    maxAttempts: classified.maxAttempts,
  });

  await supabase.from("import_batches").insert({
    created_by: profileId,
    organization_id: organizationContext.organizationId,
    source_type: "course_builder",
    status: "failed",
    summary: {
      blueprintGeneration: {
        blueprintId: blueprint.id,
        blueprintTitle: blueprint.title,
        error: safeError.safeMessage,
        failureKind: safeError.safeErrorCode,
        internalErrorReference: safeError.internalErrorReference,
        maxAttempts: safeError.maxAttempts,
        nextAction: safeError.nextAction,
        retryAttemptHistory: classified.retryHistory ?? [],
        retryable: safeError.retryable,
        safeErrorCode: safeError.safeErrorCode,
        sourceQuestionCount: sourceExampleCount(blueprint),
        targetBankId: bankId,
      },
      importedFrom: "teacher_blueprint_generation",
      reviewGate: "bank_review_required",
      reviewScope: "question_bank",
      retryable: safeError.retryable,
      targetBankId: bankId,
    },
    target_bank_id: bankId,
  } as never);
}

export function isTransientTeacherBlueprintProviderFailure(error: unknown) {
  return classifyAIProviderError({
    error,
    operation: "blueprint_generation",
  }).retryable;
}

export async function generateTeacherBlueprintReviewDrafts({
  blueprint,
  profileId,
  queueJobId,
  onProviderUsage,
  providerMaxAttempts,
  routingLeaseOwner,
  routingOrganizationId,
  supabase,
}: {
  blueprint: QuestionBlueprint;
  profileId: string;
  queueJobId?: string;
  onProviderUsage?: (usage: GeminiNativeUsage | null) => void;
  providerMaxAttempts?: number;
  routingLeaseOwner?: string;
  routingOrganizationId?: string;
  supabase: SupabaseLike;
}): Promise<TeacherBlueprintGenerationSummary> {
  const bankId = blueprint.source_bank_id;

  if (!bankId) {
    throw new Error("Blueprint must be linked to a Library before generation.");
  }

  const detail = await getTeacherQuestionBankDetail({
    bankId,
    profileId,
    supabase: supabase as never,
  });

  if (!detail) {
    throw new Error("Linked Library was not found.");
  }
  if (!canManageBankContent(detail.currentUserRole)) {
    throw new Error("Only Library owners and editors can generate Review Drafts from this Blueprint.");
  }
  if (detail.bank.status !== "active") {
    throw new Error("Only active Libraries can receive Blueprint-generated Review Drafts.");
  }

  const directProvider = routingOrganizationId
    ? null
    : await resolveTeacherBlueprintGenerationProvider(supabase);

  try {
    const { tagIds } = await validateTeacherBlueprintGenerationReadiness({
      bankId,
      blueprint,
      supabase,
    });
    const sourceExamples = await loadBlueprintSourceExamples({
      bankId,
      blueprint,
      supabase,
    });
    const request = buildGenerationRequest({
      blueprint,
      sourceExamples,
      tagIds,
    });
    const prompt = buildTeacherBlueprintGenerationPrompt(request);
    const routingRoute = routingOrganizationId
      ? await resolveAIProviderRoute({
          operationKind: "blueprint_generate_questions",
          organizationId: routingOrganizationId,
          supabase,
        })
      : null;
    const routedGeneration = routingRoute
      ? await runWithAIProviderRoute({
          execute: async (provider, attemptBudget) =>
            (
              await runWithAIProviderRetry({
                operation: "blueprint_generation",
                policy: { maxAttempts: attemptBudget.maxAttempts },
                run: async () => {
                  const response = await callTeacherBlueprintGenerationProvider({
                    profile: provider,
                    prompt,
                    request,
                  });
                  onProviderUsage?.(response.usage);
                  return response.text;
                },
              })
            ).value,
          leaseOwner:
            routingLeaseOwner ?? `teacher-blueprint-generation:${blueprint.id}`,
          maxTotalAttempts: providerMaxAttempts,
          route: routingRoute,
          supabase,
        })
      : {
          fallbackUsed: false,
          profile: directProvider!,
          value: (
            await runWithAIProviderRetry({
              operation: "blueprint_generation",
              run: async () => {
                const response = await callTeacherBlueprintGenerationProvider({
                  profile: directProvider!,
                  prompt,
                  request,
                });
                onProviderUsage?.(response.usage);
                return response.text;
              },
            })
          ).value,
        };
    const providerStrategy = inferAiProviderMode(routedGeneration.profile);
    const providerText = routedGeneration.value;
    const parsed = parseGeneratedQuestions({
      providerText,
      request,
    });

    if (!parsed.accepted.length) {
      throw new Error(
        parsed.blockedWarnings.length
          ? `No generated drafts passed validation: ${parsed.blockedWarnings.join(" ")}`
          : "AI provider returned zero usable Blueprint drafts.",
      );
    }

    const requestId = randomUUID();
    const importItems = buildImportItems({
      blueprint,
      generated: parsed.accepted,
      providerStrategy,
      requestId,
    });
    const importSummary = await importBatchImportJson({
      initialSummaryExtras: {
        blueprintGeneration: {
          blockedWarnings: parsed.blockedWarnings,
          blueprintId: blueprint.id,
          blueprintTitle: blueprint.title,
          expectedDraftCount: request.count,
          durableJobId: queueJobId ?? null,
          fallbackUsed: routedGeneration.fallbackUsed,
          providerStrategy,
          request,
          rootWarnings: parsed.rootWarnings,
          sourceQuestionCount: sourceExamples.length,
          targetBankId: bankId,
        },
        importedFrom: "teacher_blueprint_generation",
        reviewGate: "bank_review_required",
        reviewScope: "question_bank",
        targetBankId: bankId,
      },
      jsonText: JSON.stringify(importItems),
      profileId,
      sourceType: "course_builder",
      supabase,
      targetBankId: bankId,
    });

    if (!importSummary.batchId) {
      throw new Error("Blueprint generation import batch was not created.");
    }

    const lineage = await attachBlueprintReviewLineage({
      bankId,
      blockedWarnings: parsed.blockedWarnings,
      blueprint,
      generated: parsed.accepted,
      importBatchId: importSummary.batchId,
      profileId,
      providerStrategy,
      request,
      requestId,
      rootWarnings: parsed.rootWarnings,
      supabase,
    });
    const warningCount =
      parsed.rootWarnings.length +
      parsed.blockedWarnings.length +
      parsed.accepted.reduce((sum, draft) => sum + draft.warnings.length, 0) +
      importSummary.validationErrorReasons.length;

    await updateBlueprintGenerationBatchSummary({
      batchId: importSummary.batchId,
      blueprint,
      patch: {
        blockedDraftCount: parsed.blockedWarnings.length,
        createdDraftCount: lineage.createdQuestionCount,
        reviewBatchId: lineage.reviewBatchId,
        warningCount,
      },
      supabase,
    });

    return {
      batchId: importSummary.batchId,
      blockedDraftCount: parsed.blockedWarnings.length,
      createdDraftCount: lineage.createdQuestionCount,
      fallbackUsed: routedGeneration.fallbackUsed,
      safeProviderId: routedGeneration.profile.id,
      safeProviderModel: routedGeneration.profile.model,
      providerRoutePolicyVersion: routingRoute?.policy?.policyVersion ?? null,
      providerRoutePosition:
        routingRoute?.candidates.find(
          (candidate) => candidate.profile.id === routedGeneration.profile.id,
        )?.routeOrder ?? null,
      providerSafeName: routedGeneration.profile.provider,
      providerStrategy,
      reviewRoute: `/teacher/banks/${bankId}/review`,
      targetBankId: bankId,
      warningCount,
    };
  } catch (error) {
    if (isAIProviderError(error)) {
      await recordTeacherBlueprintGenerationFailure({
        bankId,
        blueprint,
        error,
        profileId,
        supabase,
      }).catch(() => undefined);
      if (routingOrganizationId) {
        // The durable route records the bounded failure code and decides whether
        // an explicitly configured fallback may run. Preserve the typed error
        // here so it never has to infer health from teacher-facing copy.
        throw error;
      }
      throw new Error(
        safeAIProviderErrorState({
          attemptCount: error.attemptCount,
          error,
          maxAttempts: error.maxAttempts,
        }).safeMessage,
      );
    }

    throw error;
  }
}
