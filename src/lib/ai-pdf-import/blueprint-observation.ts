export type AIBlueprintObservationPlanVersion =
  "blueprint_observation_plan_v1";

export type AIBlueprintObservationPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AIBlueprintObservationSourceKind =
  | "question"
  | "pdf_page"
  | "image"
  | "import_batch"
  | "unknown";

export interface AIBlueprintObservationPlan {
  generatedAt: string;
  mode: "planning_only";
  normalizedPackets: AINormalizedBlueprintObservationPacket[];
  observationPackets: AIBlueprintObservationPacket[];
  sourceKind: AIBlueprintObservationSourceKind;
  stats: AIBlueprintObservationStats;
  status: AIBlueprintObservationPlanStatus;
  version: AIBlueprintObservationPlanVersion;
  warnings: string[];
}

export interface AIBlueprintObservationPacket {
  confidence: number;
  observedQuestionBlocks: AIBlueprintObservedQuestionBlock[];
  packetHash: string;
  packetId: string;
  sourceRefs: {
    assetRefs: string[];
    draftIds: string[];
    pageNumbers: number[];
    questionIds: string[];
  };
  warnings: string[];
}

export interface AIBlueprintObservedQuestionBlock {
  answerStructureHint?: string | null;
  blockId: string;
  boundedEvidenceSnippets: string[];
  cognitiveDemandHint?: string | null;
  confidence: number;
  distractorPatternHint?: string | null;
  promptVerb: string | null;
  representationHints: string[];
  stemPattern: string | null;
  styleNotes: string[];
  taxonomySignalHints: string[];
  visualDescription?: string | null;
  warnings: string[];
}

export interface AINormalizedBlueprintObservationPacket {
  answerPatternHints: string[];
  assetRefs: string[];
  base64Stored: false;
  boundedObservationSummary: string;
  maxEvidenceCharsPerSnippet: number;
  normalizedPacketId: string;
  originalityConstraints: string[];
  providerResponseStored: false;
  rawImageStored: false;
  rawPdfStored: false;
  representationHints: string[];
  sourcePacketId: string;
  styleConstraints: string[];
  taxonomySignalHints: string[];
  textOnlyForAnalyzer: true;
  warnings: string[];
}

export interface AIBlueprintObservationStats {
  assetRefCount: number;
  evidenceSnippetCount: number;
  generatedQuestionCount: 0;
  maxEvidenceCharsPerSnippet: number;
  normalizedPacketCount: number;
  observedBlockCount: number;
  observationPacketCount: number;
  providerCallCount: 0;
  rawStorageCount: 0;
  reviewDraftWriteCount: 0;
  warningCount: number;
}

export interface AIBlueprintObservationValidationResult {
  errors: string[];
  valid: boolean;
  warnings: string[];
}

type BlueprintObservationPacketSeed = {
  assetRefs: string[];
  confidence: number;
  evidence: string[];
  pageNumbers: number[];
  packetHash?: string | null;
  packetId: string;
  representationHints: string[];
  sourceKind: AIBlueprintObservationSourceKind;
  stemPattern?: string | null;
  taxonomySignalHints: string[];
  warnings: string[];
};

export const BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS = 280;
export const BLUEPRINT_OBSERVATION_SUMMARY_MAX_CHARS = 1200;
export const BLUEPRINT_OBSERVATION_PACKET_LIMIT = 40;
export const AI_BLUEPRINT_OBSERVATION_SUMMARY_PATH =
  "summary.aiPdfImport.blueprintObservationPlan";

export const AI_BLUEPRINT_OBSERVATION_FUTURE_PROMPT_CONTRACT = [
  "You are not solving the problem.",
  "You are not generating a new question.",
  "You are not writing final tags.",
  "Only extract bounded structure/style observations for later blueprint analysis.",
].join("\n");

export const BLUEPRINT_OBSERVATION_BASE_WARNINGS = [
  "blueprint_observation_planning_only",
  "blueprint_observation_no_provider_call",
  "blueprint_observation_no_generation",
  "blueprint_observation_no_review_draft_write",
  "blueprint_observation_no_raw_pdf_storage",
  "blueprint_observation_no_base64_storage",
] as const;

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

function uniqueNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value >= 1)),
  ).sort((left, right) => left - right);
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function boundedText(value: unknown, maxLength = BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS) {
  const normalized = stringValue(value).replace(/\s+/g, " ").trim();

  return normalized.slice(0, maxLength);
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

function aiPdfImportFromSummary(value: unknown) {
  const record = asRecord(value);
  const aiPdfImport = asRecord(record.aiPdfImport);

  return Object.keys(aiPdfImport).length ? aiPdfImport : record;
}

function sourceKindFrom(aiPdfImport: Record<string, unknown>): AIBlueprintObservationSourceKind {
  const sourceKind = stringValue(asRecord(aiPdfImport.preanalysis).sourceKind);
  const packetSourceKind = stringValue(asRecord(aiPdfImport.packetPlan).sourceKind);

  if (sourceKind === "single_image" || packetSourceKind === "single_image") {
    return "image";
  }

  if (sourceKind === "pdf" || packetSourceKind === "pdf") {
    return "import_batch";
  }

  if (asArray(asRecord(aiPdfImport.packetPlan).packets).length > 0) {
    return "import_batch";
  }

  return "unknown";
}

function stringArrayFrom(value: unknown) {
  return uniqueStrings(
    asArray(value).flatMap((item) =>
      typeof item === "string" ? [item] : [],
    ),
  );
}

function pageNumbersFrom(value: unknown) {
  return uniqueNumbers(asArray(value).map((item) => numberValue(item, 0)));
}

function assetRefsFromPacket(packet: Record<string, unknown>) {
  return uniqueStrings(
    asArray(packet.assetRefs).map((asset, index) => {
      const record = asRecord(asset);
      const kind = stringValue(record.kind) || "asset";
      const page = numberValue(record.pageNumber, 0);
      const note = boundedText(record.note, 80);

      return [`${kind}:${page || "unknown"}:${index}`, note]
        .filter(Boolean)
        .join(":");
    }),
  );
}

function inferPromptVerb(text: string) {
  const match = text.match(
    /\b(determine|identify|explain|rewrite|model|solve|find|calculate|compare|justify|describe|graph|factor)\b/i,
  );

  return match?.[1]?.toLowerCase() ?? null;
}

function inferRepresentationHints({
  assetRefs,
  markerHints,
  text,
}: {
  assetRefs: string[];
  markerHints: Record<string, unknown>;
  text: string;
}) {
  const hints: string[] = [];
  const normalized = text.toLowerCase();

  if (assetRefs.length > 0) hints.push("visual_or_asset_reference");
  if (/\bgraph|axis|curve|line|parabola\b/.test(normalized)) hints.push("graph");
  if (/\btable|row|column\b/.test(normalized)) hints.push("table");
  if (/\bdiagram|figure|image\b/.test(normalized)) hints.push("diagram");
  if (/\bformula|equation|function|expression\b/.test(normalized)) hints.push("symbolic");
  if (stringArrayFrom(markerHints.choices).length > 0) hints.push("multiple_choice");
  if (stringArrayFrom(markerHints.answers).length > 0) hints.push("answer_marker");

  return uniqueStrings(hints.length ? hints : ["text"]);
}

function inferTaxonomySignals(text: string) {
  const normalized = text.toLowerCase();
  const signals: string[] = [];

  for (const [keyword, signal] of [
    ["derivative", "calculus_derivatives"],
    ["integral", "calculus_integration"],
    ["area under", "calculus_integration_applications"],
    ["quadratic", "algebra_quadratics"],
    ["vertex", "algebra_quadratics_vertex"],
    ["slope", "functions_rate_of_change"],
    ["probability", "probability"],
    ["trigonometric", "trigonometry"],
    ["exponential", "exponential_functions"],
    ["logarithm", "logarithmic_functions"],
  ] as const) {
    if (normalized.includes(keyword)) signals.push(signal);
  }

  return uniqueStrings(signals);
}

function inferCognitiveDemand(promptVerb: string | null) {
  if (!promptVerb) return null;
  if (["explain", "justify", "compare", "model"].includes(promptVerb)) {
    return "reasoning_or_explanation";
  }
  if (["identify", "describe"].includes(promptVerb)) {
    return "recognition_or_interpretation";
  }

  return "procedural_or_computational";
}

function blockFromSeed(seed: BlueprintObservationPacketSeed): AIBlueprintObservedQuestionBlock {
  const primaryEvidence = seed.evidence[0] ?? "";
  const promptVerb = inferPromptVerb(primaryEvidence);
  const representationHints = seed.representationHints.length
    ? seed.representationHints
    : inferRepresentationHints({
        assetRefs: seed.assetRefs,
        markerHints: {},
        text: primaryEvidence,
      });
  const taxonomySignalHints = uniqueStrings([
    ...seed.taxonomySignalHints,
    ...inferTaxonomySignals(primaryEvidence),
  ]);
  const warnings = uniqueStrings([
    ...seed.warnings,
    ...(seed.evidence.length ? [] : ["blueprint_observation_no_evidence_preview"]),
  ]);

  return {
    answerStructureHint: representationHints.includes("multiple_choice")
      ? "choice_based_answer"
      : null,
    blockId: `${seed.packetId}-block-1`,
    boundedEvidenceSnippets: seed.evidence
      .map((snippet) => boundedText(snippet))
      .filter(Boolean)
      .slice(0, 3),
    cognitiveDemandHint: inferCognitiveDemand(promptVerb),
    confidence: seed.confidence,
    distractorPatternHint: representationHints.includes("multiple_choice")
      ? "multiple_choice_distractors_observed"
      : null,
    promptVerb,
    representationHints,
    stemPattern: seed.stemPattern ?? (promptVerb ? `${promptVerb}_prompt` : null),
    styleNotes: uniqueStrings([
      `source_kind:${seed.sourceKind}`,
      ...(primaryEvidence ? ["bounded_text_preview_available"] : []),
      ...(seed.assetRefs.length ? ["asset_references_only"] : []),
    ]),
    taxonomySignalHints,
    visualDescription: seed.assetRefs.length
      ? `${seed.assetRefs.length} asset reference(s) observed; refs only, no image bytes stored.`
      : null,
    warnings,
  };
}

function packetFromSeed(seed: BlueprintObservationPacketSeed): AIBlueprintObservationPacket {
  const packetHash =
    seed.packetHash ??
    hashStableJson({
      assetRefs: seed.assetRefs,
      evidence: seed.evidence,
      pageNumbers: seed.pageNumbers,
      packetId: seed.packetId,
    });
  const block = blockFromSeed(seed);

  return {
    confidence: seed.confidence,
    observedQuestionBlocks: [block],
    packetHash,
    packetId: seed.packetId,
    sourceRefs: {
      assetRefs: seed.assetRefs,
      draftIds: [],
      pageNumbers: seed.pageNumbers,
      questionIds: [],
    },
    warnings: uniqueStrings([...seed.warnings, ...block.warnings]),
  };
}

function packetSeedsFromPacketPlan(
  aiPdfImport: Record<string, unknown>,
): BlueprintObservationPacketSeed[] {
  const packetPlan = asRecord(aiPdfImport.packetPlan);
  const packets = asArray(packetPlan.packets);

  return packets.map((packetValue, index): BlueprintObservationPacketSeed => {
    const packet = asRecord(packetValue);
    const markerHints = asRecord(packet.markerHints);
    const textPreview = boundedText(packet.textPreview);
    const assetRefs = assetRefsFromPacket(packet);
    const representationHints = inferRepresentationHints({
      assetRefs,
      markerHints,
      text: textPreview,
    });

    return {
      assetRefs,
      confidence: textPreview || assetRefs.length ? 0.72 : 0.45,
      evidence: textPreview ? [textPreview] : [],
      pageNumbers: pageNumbersFrom(packet.pageNumbers),
      packetHash: stringValue(packet.packetHash) || null,
      packetId: stringValue(packet.packetId) || `packet-plan-${index + 1}`,
      representationHints,
      sourceKind: sourceKindFrom(aiPdfImport),
      stemPattern: stringValue(packet.questionNumberHint)
        ? "numbered_question_candidate"
        : null,
      taxonomySignalHints: inferTaxonomySignals(textPreview),
      warnings: [],
    };
  });
}

function packetSeedsFromPreanalysis(
  aiPdfImport: Record<string, unknown>,
): BlueprintObservationPacketSeed[] {
  const preanalysis = asRecord(aiPdfImport.preanalysis);
  const sourceKind = sourceKindFrom(aiPdfImport);
  const pages = asArray(preanalysis.pages);

  if (pages.length > 0) {
    return pages.map((pageValue, index): BlueprintObservationPacketSeed => {
      const page = asRecord(pageValue);
      const pageNumber = numberValue(page.pageNumber, index + 1);
      const textPreview = boundedText(page.extractedTextPreview);
      const assetHints = asArray(page.assetHints);
      const assetRefs = uniqueStrings(
        assetHints.map((asset, assetIndex) => {
          const record = asRecord(asset);
          const kind = stringValue(record.kind) || "asset";

          return `${kind}:${pageNumber}:${assetIndex}`;
        }),
      );
      const representationHints = inferRepresentationHints({
        assetRefs,
        markerHints: {
          answers: page.answerMarkerHints,
          choices: page.choiceMarkerHints,
        },
        text: textPreview,
      });

      return {
        assetRefs,
        confidence: textPreview || assetRefs.length ? 0.68 : 0.4,
        evidence: textPreview ? [textPreview] : [],
        pageNumbers: [pageNumber],
        packetId: `preanalysis-page-${pageNumber}`,
        representationHints,
        sourceKind,
        stemPattern: stringArrayFrom(page.questionNumberHints).length
          ? "numbered_question_candidate"
          : null,
        taxonomySignalHints: inferTaxonomySignals(textPreview),
        warnings:
          page.textLayerAvailable === false
            ? ["blueprint_observation_text_layer_unavailable"]
            : [],
      };
    });
  }

  const imageTextHints = asRecord(preanalysis.textHints);
  const imagePreview = boundedText(imageTextHints.extractedTextPreview);

  if (imagePreview || preanalysis.sourceKind === "single_image") {
    return [
      {
        assetRefs: ["single_image_source"],
        confidence: imagePreview ? 0.64 : 0.35,
        evidence: imagePreview ? [imagePreview] : [],
        pageNumbers: [],
        packetId: "preanalysis-single-image",
        representationHints: ["image"],
        sourceKind: "image",
        taxonomySignalHints: inferTaxonomySignals(imagePreview),
        warnings: imagePreview
          ? []
          : ["blueprint_observation_single_image_text_preview_missing"],
      },
    ];
  }

  return [];
}

export function buildBlueprintObservationPackets(
  summaryInput: unknown,
): AIBlueprintObservationPacket[] {
  const aiPdfImport = aiPdfImportFromSummary(summaryInput);
  const seeds = packetSeedsFromPacketPlan(aiPdfImport).length
    ? packetSeedsFromPacketPlan(aiPdfImport)
    : packetSeedsFromPreanalysis(aiPdfImport);

  return seeds.slice(0, BLUEPRINT_OBSERVATION_PACKET_LIMIT).map(packetFromSeed);
}

export function normalizeBlueprintObservationPackets(
  observationPackets: AIBlueprintObservationPacket[],
): AINormalizedBlueprintObservationPacket[] {
  return observationPackets.map((packet) => {
    const blocks = packet.observedQuestionBlocks;
    const taxonomySignalHints = uniqueStrings(
      blocks.flatMap((block) => block.taxonomySignalHints),
    );
    const representationHints = uniqueStrings(
      blocks.flatMap((block) => block.representationHints),
    );
    const answerPatternHints = uniqueStrings(
      blocks.flatMap((block) =>
        [
          block.answerStructureHint ?? "",
          block.distractorPatternHint ?? "",
        ].filter(Boolean),
      ),
    );
    const styleConstraints = uniqueStrings(
      blocks.flatMap((block) => block.styleNotes),
    );
    const boundedObservationSummary = boundedText(
      blocks
        .map((block) =>
          [
            block.stemPattern ? `Stem pattern: ${block.stemPattern}.` : "",
            block.promptVerb ? `Prompt verb: ${block.promptVerb}.` : "",
            block.cognitiveDemandHint
              ? `Cognitive demand: ${block.cognitiveDemandHint}.`
              : "",
            representationHints.length
              ? `Representations: ${representationHints.join(", ")}.`
              : "",
            taxonomySignalHints.length
              ? `Taxonomy signals: ${taxonomySignalHints.join(", ")}.`
              : "",
            block.boundedEvidenceSnippets.length
              ? `Evidence: ${block.boundedEvidenceSnippets.join(" | ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join("\n"),
      BLUEPRINT_OBSERVATION_SUMMARY_MAX_CHARS,
    );

    return {
      answerPatternHints,
      assetRefs: packet.sourceRefs.assetRefs,
      base64Stored: false,
      boundedObservationSummary,
      maxEvidenceCharsPerSnippet: BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS,
      normalizedPacketId: `normalized-${packet.packetId}`,
      originalityConstraints: [
        "Do not copy source text verbatim.",
        "Do not solve the observed problem.",
        "Do not generate new questions during observation.",
        "Use observations only as later blueprint-analysis input.",
      ],
      providerResponseStored: false,
      rawImageStored: false,
      rawPdfStored: false,
      representationHints,
      sourcePacketId: packet.packetId,
      styleConstraints,
      taxonomySignalHints,
      textOnlyForAnalyzer: true,
      warnings: packet.warnings,
    };
  });
}

export function summarizeBlueprintObservationPlan(
  plan: Pick<
    AIBlueprintObservationPlan,
    "normalizedPackets" | "observationPackets" | "warnings"
  >,
): AIBlueprintObservationStats {
  const observedBlocks = plan.observationPackets.flatMap(
    (packet) => packet.observedQuestionBlocks,
  );
  const evidenceSnippetCount = observedBlocks.reduce(
    (total, block) => total + block.boundedEvidenceSnippets.length,
    0,
  );
  const assetRefCount = plan.observationPackets.reduce(
    (total, packet) => total + packet.sourceRefs.assetRefs.length,
    0,
  );
  const warningCount =
    plan.warnings.length +
    plan.observationPackets.reduce(
      (total, packet) =>
        total +
        packet.warnings.length +
        packet.observedQuestionBlocks.reduce(
          (blockTotal, block) => blockTotal + block.warnings.length,
          0,
        ),
      0,
    );

  return {
    assetRefCount,
    evidenceSnippetCount,
    generatedQuestionCount: 0,
    maxEvidenceCharsPerSnippet: BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS,
    normalizedPacketCount: plan.normalizedPackets.length,
    observedBlockCount: observedBlocks.length,
    observationPacketCount: plan.observationPackets.length,
    providerCallCount: 0,
    rawStorageCount: 0,
    reviewDraftWriteCount: 0,
    warningCount,
  };
}

export function validateBlueprintObservationPlan(
  plan: AIBlueprintObservationPlan,
): AIBlueprintObservationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (plan.version !== "blueprint_observation_plan_v1") {
    errors.push("blueprint_observation_invalid_version");
  }
  if (plan.mode !== "planning_only") {
    errors.push("blueprint_observation_not_planning_only");
  }
  for (const packet of plan.observationPackets) {
    for (const block of packet.observedQuestionBlocks) {
      for (const snippet of block.boundedEvidenceSnippets) {
        if (snippet.length > BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS) {
          errors.push("blueprint_observation_evidence_snippet_too_long");
        }
      }
    }
  }
  for (const normalizedPacket of plan.normalizedPackets) {
    if (!normalizedPacket.textOnlyForAnalyzer) {
      errors.push("blueprint_observation_normalized_packet_not_text_only");
    }
    if (
      normalizedPacket.rawPdfStored ||
      normalizedPacket.rawImageStored ||
      normalizedPacket.base64Stored ||
      normalizedPacket.providerResponseStored
    ) {
      errors.push("blueprint_observation_raw_storage_enabled");
    }
    if (
      /data:|base64,|provider response|raw pdf|raw image/i.test(
        normalizedPacket.boundedObservationSummary,
      )
    ) {
      warnings.push("blueprint_observation_summary_contains_raw_storage_terms");
    }
  }

  return {
    errors: uniqueStrings(errors),
    valid: errors.length === 0,
    warnings: uniqueStrings(warnings),
  };
}

export function buildAIBlueprintObservationPlanFromSummary(
  summaryInput: unknown,
  generatedAt = new Date().toISOString(),
): AIBlueprintObservationPlan {
  const aiPdfImport = aiPdfImportFromSummary(summaryInput);
  const observationPackets = buildBlueprintObservationPackets(aiPdfImport);
  const normalizedPackets = normalizeBlueprintObservationPackets(observationPackets);
  const warnings = uniqueStrings([
    ...BLUEPRINT_OBSERVATION_BASE_WARNINGS,
    ...(asRecord(aiPdfImport.preanalysis).version
      ? []
      : ["blueprint_observation_missing_preanalysis"]),
    ...(asRecord(aiPdfImport.packetPlan).version
      ? []
      : ["blueprint_observation_missing_packet_plan"]),
    ...(observationPackets.length ? [] : ["blueprint_observation_no_packets"]),
  ]);
  const status: AIBlueprintObservationPlanStatus = observationPackets.length
    ? warnings.length > BLUEPRINT_OBSERVATION_BASE_WARNINGS.length
      ? "completed_with_warnings"
      : "completed"
    : "skipped";
  const plan: AIBlueprintObservationPlan = {
    generatedAt,
    mode: "planning_only",
    normalizedPackets,
    observationPackets,
    sourceKind: sourceKindFrom(aiPdfImport),
    stats: {
      assetRefCount: 0,
      evidenceSnippetCount: 0,
      generatedQuestionCount: 0,
      maxEvidenceCharsPerSnippet: BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS,
      normalizedPacketCount: 0,
      observedBlockCount: 0,
      observationPacketCount: 0,
      providerCallCount: 0,
      rawStorageCount: 0,
      reviewDraftWriteCount: 0,
      warningCount: 0,
    },
    status,
    version: "blueprint_observation_plan_v1",
    warnings,
  };

  return {
    ...plan,
    stats: summarizeBlueprintObservationPlan(plan),
  };
}

export function failedAIBlueprintObservationPlan({
  generatedAt = new Date().toISOString(),
  sourceKind = "unknown",
  warnings,
}: {
  generatedAt?: string;
  sourceKind?: AIBlueprintObservationSourceKind;
  warnings: string[];
}): AIBlueprintObservationPlan {
  const plan: AIBlueprintObservationPlan = {
    generatedAt,
    mode: "planning_only",
    normalizedPackets: [],
    observationPackets: [],
    sourceKind,
    stats: {
      assetRefCount: 0,
      evidenceSnippetCount: 0,
      generatedQuestionCount: 0,
      maxEvidenceCharsPerSnippet: BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS,
      normalizedPacketCount: 0,
      observedBlockCount: 0,
      observationPacketCount: 0,
      providerCallCount: 0,
      rawStorageCount: 0,
      reviewDraftWriteCount: 0,
      warningCount: 0,
    },
    status: "failed",
    version: "blueprint_observation_plan_v1",
    warnings: uniqueStrings([
      ...BLUEPRINT_OBSERVATION_BASE_WARNINGS,
      ...warnings,
    ]),
  };

  return {
    ...plan,
    stats: summarizeBlueprintObservationPlan(plan),
  };
}

export function mergeAIBlueprintObservationPlanIntoSummary<
  T extends Record<string, unknown>,
>(
  existingAiPdfImport: T,
  blueprintObservationPlan: AIBlueprintObservationPlan,
) {
  return {
    ...existingAiPdfImport,
    blueprintObservationPlan,
  };
}
