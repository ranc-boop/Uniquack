import "server-only";

import { parsePossiblyMalformedJson } from "@/lib/ai-providers/json-repair";
import type {
  AIBlueprintObservationPlan,
  AINormalizedBlueprintObservationPacket,
} from "@/lib/ai-pdf-import/blueprint-observation";
import type { AIBlueprintObservationCluster } from "@/lib/ai-pdf-import/blueprint-observation-clustering";

export type AIQuestionBlueprintDraftPlanVersion =
  "question_blueprint_draft_plan_v1";

export type AIQuestionBlueprintDraftPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AIQuestionBlueprintAnswerKind =
  | "mcq"
  | "fill_blank"
  | "frq"
  | "mixed"
  | "unknown";

export type AIQuestionBlueprintTaxonomyGroundingStatus =
  | "grounded"
  | "partially_grounded"
  | "unresolved";

export type AIQuestionBlueprintTaxonomyFacet =
  | "curriculum"
  | "concept"
  | "method"
  | "task"
  | "form";

export type AIQuestionBlueprintTaxonomyCandidate = {
  aliases?: string[];
  description?: string | null;
  facetKey: AIQuestionBlueprintTaxonomyFacet;
  label?: string | null;
  tagId: string;
};

export type AIQuestionBlueprintTaxonomyCandidatesByFacet = Partial<
  Record<AIQuestionBlueprintTaxonomyFacet, AIQuestionBlueprintTaxonomyCandidate[]>
>;

export interface AIQuestionBlueprintDraftPlan {
  blueprintDrafts: AIQuestionBlueprintDraft[];
  generatedAt: string;
  mode: "analysis_only";
  sourceObservationPlanRef: string | null;
  stats: AIQuestionBlueprintDraftStats;
  status: AIQuestionBlueprintDraftPlanStatus;
  version: AIQuestionBlueprintDraftPlanVersion;
  warnings: string[];
}

export interface AIQuestionBlueprintDraft {
  answerSpecPattern: {
    acceptedAnswerGuidance: string[];
    kind: AIQuestionBlueprintAnswerKind;
    requiredAnswerFields: string[];
  };
  confidence: number;
  difficultyProfile: {
    difficultyDrivers: string[];
    estimatedDifficulty: number | null;
  };
  distractorPattern: string[];
  draftId: string;
  evidence: {
    assetRefs: string[];
    boundedSnippets: string[];
  };
  generationConstraints: string[];
  originalityConstraints: string[];
  questionPattern: string;
  representationPattern: string[];
  requiredElements: string[];
  reviewRequired: true;
  sourcePacketIds: string[];
  specificityScore: number;
  specificityWarnings: string[];
  taxonomyGroundingStatus: AIQuestionBlueprintTaxonomyGroundingStatus;
  taxonomyTargetHints: string[];
  taxonomyTargets: {
    curriculum: string[];
    concept: string[];
    form: string[];
    method: string[];
    task: string[];
  };
  taxonomyUnresolved: boolean;
  title: string;
  variablePattern: string[];
  warnings: string[];
}

export interface AIQuestionBlueprintDraftStats {
  analyzerProviderCallCount: number;
  blueprintDraftCount: number;
  evidenceSnippetCount: number;
  generatedQuestionCount: 0;
  normalizedPacketCount: number;
  rawStorageCount: 0;
  reviewDraftWriteCount: 0;
  warningCount: number;
}

type QuestionBlueprintAnalyzerProvider = {
  apiKey: string;
  base_url: string;
  model: string;
  name: string;
  provider: string;
};

type AnalyzerDebugContext = {
  batchId?: string;
  fileName?: string;
  jobId?: string;
  providerProfileId?: string;
  sourceAssetId?: string;
  sourceObjectPath?: string;
};

export const AI_QUESTION_BLUEPRINT_DRAFT_PLAN_PATH =
  "summary.aiPdfImport.questionBlueprintDraftPlan";
export const QUESTION_BLUEPRINT_ANALYZER_SNIPPET_MAX_CHARS = 280;
export const QUESTION_BLUEPRINT_ANALYZER_SUMMARY_MAX_CHARS = 900;
export const QUESTION_BLUEPRINT_ANALYZER_PACKET_LIMIT = 40;
export const QUESTION_BLUEPRINT_ANALYZER_TIMEOUT_MS = 120_000;
export const QUESTION_BLUEPRINT_ANALYZER_MISSING_DEEPSEEK_WARNING =
  "DeepSeek provider is not configured or not enabled.";

export const AI_QUESTION_BLUEPRINT_ANALYZER_PROMPT_CONTRACT = [
  "You are analyzing the style and structure of a source question.",
  "Do not generate a new question.",
  "Do not solve the question.",
  "Do not copy wording.",
  "Extract a reusable blueprint that can later generate original questions with the same assessment structure.",
  "Return JSON only.",
].join("\n");

export const QUESTION_BLUEPRINT_ANALYZER_BASE_WARNINGS = [
  "question_blueprint_analyzer_analysis_only",
  "question_blueprint_analyzer_text_only_packets",
  "question_blueprint_analyzer_no_generated_questions",
  "question_blueprint_analyzer_no_review_draft_write",
  "question_blueprint_analyzer_no_raw_pdf_storage",
  "question_blueprint_analyzer_no_image_or_base64_storage",
] as const;

const TAXONOMY_FACETS: AIQuestionBlueprintTaxonomyFacet[] = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
];

const TAXONOMY_CANDIDATE_LIMIT_PER_FACET = 18;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function boundedText(
  value: unknown,
  maxLength = QUESTION_BLUEPRINT_ANALYZER_SNIPPET_MAX_CHARS,
) {
  return stringValue(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function boundedList(value: unknown, maxItems = 8, maxChars = 160) {
  return uniqueStrings(
    asArray(value).map((item) =>
      typeof item === "string"
        ? boundedText(item, maxChars)
        : boundedText(JSON.stringify(item), maxChars),
    ),
  ).slice(0, maxItems);
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampConfidence(value: unknown) {
  const numeric = numberValue(value, 0.5);

  return Math.min(1, Math.max(0, numeric));
}

function clampSpecificityScore(value: unknown, fallback = 0.5) {
  const numeric = numberValue(value, fallback);

  return Math.min(1, Math.max(0, Number(numeric.toFixed(2))));
}

function clampDifficulty(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.min(1000, Math.max(0, Math.round(numeric)));
}

function hashStableJson(value: unknown) {
  const input = JSON.stringify(value);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sourceObservationRef(plan: AIBlueprintObservationPlan | null | undefined) {
  if (!plan) {
    return null;
  }

  return [
    plan.version,
    plan.generatedAt,
    plan.stats.normalizedPacketCount,
    plan.stats.observationPacketCount,
  ].join(":");
}

function taxonomyTargetsHaveGrounding(
  targets: AIQuestionBlueprintDraft["taxonomyTargets"],
) {
  return {
    concept: targets.concept.length > 0,
    form: targets.form.length > 0,
    methodOrTask: targets.method.length > 0 || targets.task.length > 0,
  };
}

function taxonomyGroundingStatusFromTargets(
  targets: AIQuestionBlueprintDraft["taxonomyTargets"],
): AIQuestionBlueprintTaxonomyGroundingStatus {
  const grounding = taxonomyTargetsHaveGrounding(targets);
  const count =
    Number(grounding.concept) +
    Number(grounding.form) +
    Number(grounding.methodOrTask);

  if (count === 3) return "grounded";
  if (count > 0) return "partially_grounded";
  return "unresolved";
}

function taxonomyCandidateText(candidate: AIQuestionBlueprintTaxonomyCandidate) {
  return [
    candidate.tagId,
    candidate.label,
    candidate.description,
    ...(candidate.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function taxonomySignalTokensFromObservationPlan(
  observationPlan: AIBlueprintObservationPlan,
) {
  const tokens = observationPlan.normalizedPackets.flatMap((packet) => [
    ...packet.taxonomySignalHints,
    ...packet.representationHints,
    ...packet.answerPatternHints,
    ...packet.styleConstraints,
    packet.boundedObservationSummary,
  ]);

  return uniqueStrings(
    tokens
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
      .slice(0, 120),
  );
}

function scoreTaxonomyCandidate({
  candidate,
  tokens,
}: {
  candidate: AIQuestionBlueprintTaxonomyCandidate;
  tokens: string[];
}) {
  const haystack = taxonomyCandidateText(candidate);
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }

  if (candidate.facetKey === "concept") score += 0.25;

  return score;
}

export function buildQuestionBlueprintTaxonomyCandidateList({
  candidates,
  observationPlan,
}: {
  candidates: AIQuestionBlueprintTaxonomyCandidate[];
  observationPlan: AIBlueprintObservationPlan;
}): AIQuestionBlueprintTaxonomyCandidatesByFacet {
  const tokens = taxonomySignalTokensFromObservationPlan(observationPlan);
  const byFacet: AIQuestionBlueprintTaxonomyCandidatesByFacet = {};

  for (const facet of TAXONOMY_FACETS) {
    byFacet[facet] = candidates
      .filter((candidate) => candidate.facetKey === facet)
      .map((candidate) => ({
        candidate,
        score: scoreTaxonomyCandidate({ candidate, tokens }),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) =>
        right.score === left.score
          ? left.candidate.tagId.localeCompare(right.candidate.tagId)
          : right.score - left.score,
      )
      .slice(0, TAXONOMY_CANDIDATE_LIMIT_PER_FACET)
      .map((entry) => entry.candidate);
  }

  return byFacet;
}

function compactTaxonomyCandidates(
  candidatesByFacet?: AIQuestionBlueprintTaxonomyCandidatesByFacet,
) {
  if (!candidatesByFacet) {
    return {};
  }

  return Object.fromEntries(
    TAXONOMY_FACETS.map((facet) => [
      facet,
      (candidatesByFacet[facet] ?? []).map((candidate) => ({
        aliases: (candidate.aliases ?? []).slice(0, 4),
        description: boundedText(candidate.description ?? "", 160),
        label: boundedText(candidate.label ?? "", 80),
        tagId: candidate.tagId,
      })),
    ]),
  );
}

function taxonomyTargetsFrom(
  value: unknown,
  knownTaxonomyTagIds?: ReadonlySet<string>,
) {
  const record = asRecord(value);
  const warnings: string[] = [];
  const exactIdPattern = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/i;
  const targetEntries = {
    curriculum: boundedList(record.curriculum, 6, 120),
    concept: boundedList(record.concept, 8, 120),
    form: boundedList(record.form, 6, 120),
    method: boundedList(record.method, 6, 120),
    task: boundedList(record.task, 6, 120),
  };

  const normalizeValues = (values: string[], category: string) => {
    const accepted: string[] = [];

    for (const value of values) {
      if (!knownTaxonomyTagIds) {
        accepted.push(value);
        continue;
      }

      if (knownTaxonomyTagIds.has(value)) {
        accepted.push(value);
        continue;
      }

      if (exactIdPattern.test(value)) {
        warnings.push(
          `Unknown taxonomy ${category} tag id was ignored: ${value}`,
        );
      } else {
        warnings.push(
          `Taxonomy ${category} hint was kept as a generation constraint, not an official tag id: ${value}`,
        );
      }
    }

    return accepted;
  };

  return {
    targets: {
      curriculum: normalizeValues(targetEntries.curriculum, "curriculum"),
      concept: normalizeValues(targetEntries.concept, "concept"),
      form: normalizeValues(targetEntries.form, "form"),
      method: normalizeValues(targetEntries.method, "method"),
      task: normalizeValues(targetEntries.task, "task"),
    },
    warnings,
  };
}

function answerKind(value: unknown): AIQuestionBlueprintAnswerKind {
  const normalized = stringValue(value).trim().toLowerCase();

  if (
    normalized === "mcq" ||
    normalized === "fill_blank" ||
    normalized === "frq" ||
    normalized === "mixed"
  ) {
    return normalized;
  }

  return "unknown";
}

function evidenceFrom(value: unknown, fallbackPackets: AINormalizedBlueprintObservationPacket[]) {
  const record = asRecord(value);
  const fallbackSnippets = fallbackPackets.flatMap((packet) => [
    packet.boundedObservationSummary,
    ...packet.styleConstraints,
    ...packet.answerPatternHints,
  ]);
  const fallbackAssetRefs = fallbackPackets.flatMap((packet) => packet.assetRefs);

  return {
    assetRefs: uniqueStrings([
      ...boundedList(record.assetRefs, 12, 120),
      ...fallbackAssetRefs,
    ]).slice(0, 12),
    boundedSnippets: uniqueStrings([
      ...boundedList(record.boundedSnippets, 8),
      ...fallbackSnippets.map((snippet) =>
        boundedText(snippet, QUESTION_BLUEPRINT_ANALYZER_SNIPPET_MAX_CHARS),
      ),
    ]).slice(0, 8),
  };
}

function statsFor({
  analyzerProviderCallCount,
  blueprintDrafts,
  normalizedPacketCount,
  warnings,
}: {
  analyzerProviderCallCount: number;
  blueprintDrafts: AIQuestionBlueprintDraft[];
  normalizedPacketCount: number;
  warnings: string[];
}): AIQuestionBlueprintDraftStats {
  return {
    analyzerProviderCallCount,
    blueprintDraftCount: blueprintDrafts.length,
    evidenceSnippetCount: blueprintDrafts.reduce(
      (total, draft) => total + draft.evidence.boundedSnippets.length,
      0,
    ),
    generatedQuestionCount: 0,
    normalizedPacketCount,
    rawStorageCount: 0,
    reviewDraftWriteCount: 0,
    warningCount:
      warnings.length +
      blueprintDrafts.reduce((total, draft) => total + draft.warnings.length, 0),
  };
}

function buildPlan({
  analyzerProviderCallCount,
  blueprintDrafts,
  generatedAt = new Date().toISOString(),
  normalizedPacketCount,
  sourceObservationPlanRef,
  status,
  warnings,
}: {
  analyzerProviderCallCount: number;
  blueprintDrafts: AIQuestionBlueprintDraft[];
  generatedAt?: string;
  normalizedPacketCount: number;
  sourceObservationPlanRef: string | null;
  status: AIQuestionBlueprintDraftPlanStatus;
  warnings: string[];
}): AIQuestionBlueprintDraftPlan {
  const uniqueWarnings = uniqueStrings([
    ...QUESTION_BLUEPRINT_ANALYZER_BASE_WARNINGS,
    ...warnings,
  ]);

  return {
    blueprintDrafts,
    generatedAt,
    mode: "analysis_only",
    sourceObservationPlanRef,
    stats: statsFor({
      analyzerProviderCallCount,
      blueprintDrafts,
      normalizedPacketCount,
      warnings: uniqueWarnings,
    }),
    status,
    version: "question_blueprint_draft_plan_v1",
    warnings: uniqueWarnings,
  };
}

function normalizedPacketsForAnalyzer(plan: AIBlueprintObservationPlan) {
  return plan.normalizedPackets
    .filter((packet) => packet.textOnlyForAnalyzer)
    .slice(0, QUESTION_BLUEPRINT_ANALYZER_PACKET_LIMIT)
    .map((packet) => ({
      answerPatternHints: packet.answerPatternHints.slice(0, 8),
      assetRefs: packet.assetRefs.slice(0, 12),
      boundedObservationSummary: boundedText(
        packet.boundedObservationSummary,
        QUESTION_BLUEPRINT_ANALYZER_SUMMARY_MAX_CHARS,
      ),
      normalizedPacketId: packet.normalizedPacketId,
      originalityConstraints: packet.originalityConstraints.slice(0, 8),
      representationHints: packet.representationHints.slice(0, 8),
      sourcePacketId: packet.sourcePacketId,
      styleConstraints: packet.styleConstraints.slice(0, 8),
      taxonomySignalHints: packet.taxonomySignalHints.slice(0, 8),
      textOnlyForAnalyzer: true as const,
      warnings: packet.warnings.slice(0, 8),
    }));
}

export function buildQuestionBlueprintAnalyzerPrompt({
  observationPlan,
  taxonomyCandidatesByFacet,
}: {
  observationPlan: AIBlueprintObservationPlan;
  taxonomyCandidatesByFacet?: AIQuestionBlueprintTaxonomyCandidatesByFacet;
}) {
  return [
    AI_QUESTION_BLUEPRINT_ANALYZER_PROMPT_CONTRACT,
    "",
    "You receive only normalized text-only observation packets from the website.",
    "If packet IDs include blueprint observation cluster prefixes, analyze only that cluster and do not merge it with other clusters.",
    "Never request or infer raw PDF text, image bytes, base64, private URLs, provider response text, or secrets.",
    "Use exact active assignable leaf taxonomy tag IDs only from the bounded candidate list. Do not invent taxonomy IDs. Do not use parent IDs or shortened IDs.",
    "If no exact candidate fits a facet, leave that facet empty, add taxonomyTargetHints, and set taxonomyUnresolved: true.",
    "Every draft must be reviewRequired: true and must describe reusable structure, not finished question content.",
    "",
    "Return ONLY JSON with this shape:",
    JSON.stringify(
      {
        blueprintDrafts: [
          {
            answerSpecPattern: {
              acceptedAnswerGuidance: ["short guidance pattern"],
              kind: "frq",
              requiredAnswerFields: ["field or structure name"],
            },
            confidence: 0.75,
            difficultyProfile: {
              difficultyDrivers: ["short driver"],
              estimatedDifficulty: 600,
            },
            distractorPattern: ["if MCQ, short distractor pattern"],
            evidence: {
              assetRefs: ["asset refs only"],
              boundedSnippets: ["bounded snippet, max 280 chars"],
            },
            generationConstraints: ["short reusable generation constraint"],
            originalityConstraints: [
              "must create original wording and values",
              "must not copy source wording",
            ],
            questionPattern: "short reusable question structure",
            representationPattern: ["symbolic", "graph"],
            requiredElements: ["element or relationship"],
            reviewRequired: true,
            sourcePacketIds: ["normalized-packet-id"],
            specificityScore: 0.8,
            specificityWarnings: [],
            taxonomyGroundingStatus: "grounded",
            taxonomyTargetHints: ["short unresolved topic hint if needed"],
            taxonomyTargets: {
              concept: [],
              curriculum: [],
              form: [],
              method: [],
              task: [],
            },
            taxonomyUnresolved: false,
            title: "Reusable blueprint title",
            variablePattern: ["variable or parameter pattern"],
            warnings: [],
          },
        ],
        warnings: [],
      },
      null,
      2,
    ),
    "",
    "Bounded active assignable leaf taxonomy candidates by facet:",
    JSON.stringify(compactTaxonomyCandidates(taxonomyCandidatesByFacet), null, 2),
    "",
    "Normalized observation packets:",
    JSON.stringify(normalizedPacketsForAnalyzer(observationPlan), null, 2),
  ].join("\n");
}

export function buildQuestionBlueprintDraftPlanFromObservationPlan({
  knownTaxonomyTagIds,
  observationPlan,
}: {
  knownTaxonomyTagIds?: ReadonlySet<string>;
  observationPlan: AIBlueprintObservationPlan;
}) {
  const packets = observationPlan.normalizedPackets.filter(
    (packet) => packet.textOnlyForAnalyzer,
  );
  const blueprintDrafts = packets.slice(0, QUESTION_BLUEPRINT_ANALYZER_PACKET_LIMIT).map(
    (packet, index) => {
      const taxonomy = taxonomyTargetsFrom(
        {
          concept: packet.taxonomySignalHints.filter((hint) => hint.includes(".")),
        },
        knownTaxonomyTagIds,
      );
      const taxonomyGroundingStatus = taxonomyGroundingStatusFromTargets(
        taxonomy.targets,
      );
      const warnings = uniqueStrings([
        ...packet.warnings,
        ...taxonomy.warnings,
        ...(taxonomyGroundingStatus === "grounded"
          ? []
          : ["question_blueprint_analyzer_taxonomy_grounding_unresolved"]),
        "question_blueprint_analyzer_deterministic_fallback_used",
      ]);

      return {
        answerSpecPattern: {
          acceptedAnswerGuidance: packet.answerPatternHints.slice(0, 4),
          kind: "unknown" as const,
          requiredAnswerFields: packet.answerPatternHints.slice(0, 4),
        },
        confidence: 0.5,
        difficultyProfile: {
          difficultyDrivers: packet.styleConstraints.slice(0, 4),
          estimatedDifficulty: null,
        },
        distractorPattern: [],
        draftId: `qbd-${index + 1}-${hashStableJson(packet).slice(0, 8)}`,
        evidence: {
          assetRefs: packet.assetRefs.slice(0, 12),
          boundedSnippets: [packet.boundedObservationSummary]
            .map((snippet) => boundedText(snippet))
            .filter(Boolean),
        },
        generationConstraints: uniqueStrings([
          ...packet.styleConstraints,
          ...packet.taxonomySignalHints.map((hint) => `taxonomy hint: ${hint}`),
        ]).slice(0, 8),
        originalityConstraints: packet.originalityConstraints.length
          ? packet.originalityConstraints.slice(0, 8)
          : ["Create original wording and values. Do not copy source wording."],
        questionPattern: packet.boundedObservationSummary || "Reusable assessment structure",
        representationPattern: packet.representationHints.slice(0, 8),
        requiredElements: packet.answerPatternHints.slice(0, 6),
        reviewRequired: true as const,
        sourcePacketIds: [packet.normalizedPacketId],
        specificityScore: 0.5,
        specificityWarnings:
          taxonomyGroundingStatus === "grounded"
            ? []
            : ["Taxonomy targets need manual review."],
        taxonomyGroundingStatus,
        taxonomyTargetHints: packet.taxonomySignalHints.slice(0, 8),
        taxonomyTargets: taxonomy.targets,
        taxonomyUnresolved: taxonomyGroundingStatus !== "grounded",
        title: `Blueprint draft ${index + 1}`,
        variablePattern: [],
        warnings,
      };
    },
  );
  const warnings = blueprintDrafts.length
    ? ["question_blueprint_analyzer_provider_response_unavailable"]
    : ["question_blueprint_analyzer_missing_normalized_packets"];

  return buildPlan({
    analyzerProviderCallCount: 0,
    blueprintDrafts,
    normalizedPacketCount: packets.length,
    sourceObservationPlanRef: sourceObservationRef(observationPlan),
    status: blueprintDrafts.length ? "completed_with_warnings" : "skipped",
    warnings,
  });
}

function normalizeBlueprintDraft({
  draft,
  fallbackPackets,
  index,
  knownTaxonomyTagIds,
}: {
  draft: unknown;
  fallbackPackets: AINormalizedBlueprintObservationPacket[];
  index: number;
  knownTaxonomyTagIds?: ReadonlySet<string>;
}): AIQuestionBlueprintDraft {
  const record = asRecord(draft);
  const answerSpecRecord = asRecord(record.answerSpecPattern);
  const difficultyRecord = asRecord(record.difficultyProfile);
  const taxonomy = taxonomyTargetsFrom(record.taxonomyTargets, knownTaxonomyTagIds);
  const taxonomyGroundingStatus =
    stringValue(record.taxonomyGroundingStatus) === "grounded" ||
    stringValue(record.taxonomyGroundingStatus) === "partially_grounded" ||
    stringValue(record.taxonomyGroundingStatus) === "unresolved"
      ? (stringValue(
          record.taxonomyGroundingStatus,
        ) as AIQuestionBlueprintTaxonomyGroundingStatus)
      : taxonomyGroundingStatusFromTargets(taxonomy.targets);
  const taxonomyTargetHints = boundedList(record.taxonomyTargetHints, 12, 160);
  const specificityWarnings = uniqueStrings([
    ...boundedList(record.specificityWarnings, 8, 160),
    ...(taxonomyGroundingStatus === "grounded"
      ? []
      : ["Taxonomy targets need manual review."]),
  ]);
  const sourcePacketIds = uniqueStrings([
    ...boundedList(record.sourcePacketIds, 12, 120),
    ...fallbackPackets.map((packet) => packet.normalizedPacketId),
  ]).slice(0, 12);
  const originalityConstraints = boundedList(
    record.originalityConstraints,
    8,
    180,
  );
  const warnings = uniqueStrings([
    ...boundedList(record.warnings, 12, 180),
    ...taxonomy.warnings,
    ...(taxonomyGroundingStatus === "grounded"
      ? []
      : ["question_blueprint_analyzer_taxonomy_grounding_unresolved"]),
    ...(originalityConstraints.length
      ? []
      : ["question_blueprint_analyzer_missing_originality_constraints"]),
    ...(record.reviewRequired === false
      ? ["question_blueprint_analyzer_forced_review_required"]
      : []),
  ]);

  return {
    answerSpecPattern: {
      acceptedAnswerGuidance: boundedList(
        answerSpecRecord.acceptedAnswerGuidance,
        8,
        180,
      ),
      kind: answerKind(answerSpecRecord.kind),
      requiredAnswerFields: boundedList(
        answerSpecRecord.requiredAnswerFields,
        8,
        120,
      ),
    },
    confidence: clampConfidence(record.confidence),
    difficultyProfile: {
      difficultyDrivers: boundedList(difficultyRecord.difficultyDrivers, 8, 180),
      estimatedDifficulty: clampDifficulty(difficultyRecord.estimatedDifficulty),
    },
    distractorPattern: boundedList(record.distractorPattern, 8, 180),
    draftId:
      boundedText(record.draftId, 80) ||
      `qbd-${index + 1}-${hashStableJson(record).slice(0, 8)}`,
    evidence: evidenceFrom(record.evidence, fallbackPackets),
    generationConstraints: boundedList(record.generationConstraints, 12, 180),
    originalityConstraints: originalityConstraints.length
      ? originalityConstraints
      : ["Create original wording and values. Do not copy source wording."],
    questionPattern:
      boundedText(record.questionPattern, 400) || "Reusable assessment structure",
    representationPattern: boundedList(record.representationPattern, 8, 120),
    requiredElements: boundedList(record.requiredElements, 12, 120),
    reviewRequired: true,
    sourcePacketIds,
    specificityScore: clampSpecificityScore(record.specificityScore),
    specificityWarnings,
    taxonomyGroundingStatus,
    taxonomyTargetHints,
    taxonomyTargets: taxonomy.targets,
    taxonomyUnresolved:
      record.taxonomyUnresolved === true || taxonomyGroundingStatus !== "grounded",
    title: boundedText(record.title, 120) || `Blueprint draft ${index + 1}`,
    variablePattern: boundedList(record.variablePattern, 8, 120),
    warnings,
  };
}

export function buildQuestionBlueprintDraftPlanFromAnalyzerResponse({
  knownTaxonomyTagIds,
  observationPlan,
  providerResponse,
}: {
  knownTaxonomyTagIds?: ReadonlySet<string>;
  observationPlan: AIBlueprintObservationPlan;
  providerResponse: unknown;
}) {
  const record = asRecord(providerResponse);
  const packetsById = new Map(
    observationPlan.normalizedPackets.map((packet) => [
      packet.normalizedPacketId,
      packet,
    ]),
  );
  const allPackets = observationPlan.normalizedPackets.filter(
    (packet) => packet.textOnlyForAnalyzer,
  );
  const blueprintDrafts = asArray(record.blueprintDrafts)
    .slice(0, QUESTION_BLUEPRINT_ANALYZER_PACKET_LIMIT)
    .map((draft, index) => {
      const sourcePacketIds = boundedList(
        asRecord(draft).sourcePacketIds,
        12,
        120,
      );
      const fallbackPackets = sourcePacketIds
        .map((packetId) => packetsById.get(packetId))
        .filter((packet): packet is AINormalizedBlueprintObservationPacket =>
          Boolean(packet),
        );

      return normalizeBlueprintDraft({
        draft,
        fallbackPackets: fallbackPackets.length ? fallbackPackets : allPackets.slice(0, 1),
        index,
        knownTaxonomyTagIds,
      });
    });
  const warnings = uniqueStrings([
    ...boundedList(record.warnings, 16, 180),
    ...(blueprintDrafts.length
      ? []
      : ["question_blueprint_analyzer_empty_provider_blueprints"]),
  ]);

  return buildPlan({
    analyzerProviderCallCount: 1,
    blueprintDrafts,
    normalizedPacketCount: allPackets.length,
    sourceObservationPlanRef: sourceObservationRef(observationPlan),
    status:
      warnings.length ||
      blueprintDrafts.some((draft) => draft.warnings.length > 0)
        ? "completed_with_warnings"
        : "completed",
    warnings,
  });
}

export function buildQuestionBlueprintDraftPlanFromClusteredDraftPlans({
  clusterDraftPlans,
  observationPlan,
  warnings = [],
}: {
  clusterDraftPlans: {
    cluster: AIBlueprintObservationCluster;
    draftPlan: AIQuestionBlueprintDraftPlan;
  }[];
  observationPlan: AIBlueprintObservationPlan;
  warnings?: string[];
}) {
  const blueprintDrafts = clusterDraftPlans.flatMap(
    ({ cluster, draftPlan }, clusterIndex) =>
      draftPlan.blueprintDrafts.map((draft, draftIndex) => ({
        ...draft,
        draftId: boundedText(
          `${cluster.clusterId}-${draft.draftId || `draft-${draftIndex + 1}`}`,
          80,
        ),
        evidence: {
          ...draft.evidence,
          boundedSnippets: uniqueStrings([
            `Blueprint observation cluster: ${cluster.representativeTitle}`,
            ...draft.evidence.boundedSnippets,
          ]).slice(0, 8),
        },
        generationConstraints: uniqueStrings([
          `Blueprint observation cluster: ${cluster.clusterId}`,
          `Cluster title: ${cluster.representativeTitle}`,
          ...draft.generationConstraints,
        ]).slice(0, 12),
        sourcePacketIds: uniqueStrings([
          ...cluster.normalizedAnalyzerPacketIds,
          ...draft.sourcePacketIds,
        ]).slice(0, 12),
        title:
          draft.title ||
          `Cluster ${clusterIndex + 1} blueprint draft ${draftIndex + 1}`,
        warnings: uniqueStrings([
          `question_blueprint_analyzer_cluster_source:${cluster.clusterId}`,
          ...cluster.warnings,
          ...draft.warnings,
        ]),
      })),
  );
  const mergedWarnings = uniqueStrings([
    ...warnings,
    ...clusterDraftPlans.flatMap(({ cluster, draftPlan }) => [
      ...cluster.warnings,
      ...draftPlan.warnings.map(
        (warning) => `${cluster.clusterId}: ${warning}`,
      ),
    ]),
    ...(clusterDraftPlans.length
      ? []
      : ["question_blueprint_analyzer_missing_clustered_inputs"]),
  ]);
  const analyzerProviderCallCount = clusterDraftPlans.reduce(
    (total, { draftPlan }) =>
      total + draftPlan.stats.analyzerProviderCallCount,
    0,
  );
  const normalizedPacketCount =
    clusterDraftPlans.reduce(
      (total, { cluster }) =>
        total + cluster.normalizedAnalyzerPacketIds.length,
      0,
    ) || observationPlan.stats.normalizedPacketCount;
  const hasFailedCluster = clusterDraftPlans.some(
    ({ draftPlan }) => draftPlan.status === "failed",
  );

  return buildPlan({
    analyzerProviderCallCount,
    blueprintDrafts,
    normalizedPacketCount,
    sourceObservationPlanRef: sourceObservationRef(observationPlan),
    status: blueprintDrafts.length
      ? mergedWarnings.length || hasFailedCluster
        ? "completed_with_warnings"
        : "completed"
      : hasFailedCluster
        ? "failed"
        : "skipped",
    warnings: mergedWarnings,
  });
}

export function parseQuestionBlueprintAnalyzerProviderText({
  knownTaxonomyTagIds,
  observationPlan,
  providerText,
}: {
  knownTaxonomyTagIds?: ReadonlySet<string>;
  observationPlan: AIBlueprintObservationPlan;
  providerText: string;
}) {
  const parsed = parsePossiblyMalformedJson(providerText);

  return buildQuestionBlueprintDraftPlanFromAnalyzerResponse({
    knownTaxonomyTagIds,
    observationPlan,
    providerResponse: parsed,
  });
}

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export async function executeDeepSeekQuestionBlueprintAnalyzer({
  debugContext: _debugContext,
  knownTaxonomyTagIds,
  observationPlan,
  provider,
  taxonomyCandidatesByFacet,
}: {
  debugContext?: AnalyzerDebugContext;
  knownTaxonomyTagIds?: ReadonlySet<string>;
  observationPlan: AIBlueprintObservationPlan;
  provider: QuestionBlueprintAnalyzerProvider;
  taxonomyCandidatesByFacet?: AIQuestionBlueprintTaxonomyCandidatesByFacet;
}) {
  const response = await fetch(endpoint(provider.base_url), {
    body: JSON.stringify({
      messages: [
        {
          content: buildQuestionBlueprintAnalyzerPrompt({
            observationPlan,
            taxonomyCandidatesByFacet,
          }),
          role: "user",
        },
      ],
      model: provider.model,
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(QUESTION_BLUEPRINT_ANALYZER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek blueprint analyzer failed with provider status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const providerText = payload.choices?.[0]?.message?.content;

  if (!providerText) {
    throw new Error("DeepSeek blueprint analyzer returned no message content.");
  }

  return parseQuestionBlueprintAnalyzerProviderText({
    knownTaxonomyTagIds,
    observationPlan,
    providerText,
  });
}

export function skippedQuestionBlueprintDraftPlan({
  observationPlan,
  warnings = [QUESTION_BLUEPRINT_ANALYZER_MISSING_DEEPSEEK_WARNING],
}: {
  observationPlan?: AIBlueprintObservationPlan | null;
  warnings?: string[];
}) {
  return buildPlan({
    analyzerProviderCallCount: 0,
    blueprintDrafts: [],
    normalizedPacketCount: observationPlan?.stats.normalizedPacketCount ?? 0,
    sourceObservationPlanRef: sourceObservationRef(observationPlan),
    status: "skipped",
    warnings,
  });
}

export function failedQuestionBlueprintDraftPlan({
  observationPlan,
  warnings,
}: {
  observationPlan?: AIBlueprintObservationPlan | null;
  warnings: string[];
}) {
  return buildPlan({
    analyzerProviderCallCount: 0,
    blueprintDrafts: [],
    normalizedPacketCount: observationPlan?.stats.normalizedPacketCount ?? 0,
    sourceObservationPlanRef: sourceObservationRef(observationPlan),
    status: "failed",
    warnings,
  });
}

export function mergeQuestionBlueprintDraftPlanIntoSummary(
  aiPdfImport: Record<string, unknown>,
  questionBlueprintDraftPlan: AIQuestionBlueprintDraftPlan,
) {
  return {
    ...aiPdfImport,
    questionBlueprintDraftPlan,
  };
}

export function summarizeQuestionBlueprintDraftPlan(
  plan: AIQuestionBlueprintDraftPlan | null | undefined,
) {
  if (!plan) {
    return {
      draftCount: 0,
      reviewRequiredCount: 0,
      status: "missing",
      warningCount: 0,
    };
  }

  return {
    draftCount: plan.stats.blueprintDraftCount,
    reviewRequiredCount: plan.blueprintDrafts.filter(
      (draft) => draft.reviewRequired,
    ).length,
    status: plan.status,
    warningCount: plan.stats.warningCount,
  };
}
