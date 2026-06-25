import "server-only";

import {
  BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS,
  BLUEPRINT_OBSERVATION_SUMMARY_MAX_CHARS,
  summarizeBlueprintObservationPlan,
  type AIBlueprintObservationPacket,
  type AIBlueprintObservationPlan,
  type AIBlueprintObservedQuestionBlock,
  type AINormalizedBlueprintObservationPacket,
} from "@/lib/ai-pdf-import/blueprint-observation";

export type AIBlueprintObservationClusterPlanVersion =
  "blueprint_observation_cluster_plan_v1";

export type AIBlueprintObservationClusterPlanStatus =
  | "planned"
  | "skipped"
  | "failed";

export type AIBlueprintObservationClusterWarning = string;

export interface AIBlueprintObservationClusterFingerprint {
  answerStructure: string;
  blockType: string;
  cognitiveDemand: string;
  distractorPattern: string;
  promptVerb: string;
  questionTypeHint: string;
  representationGroup: string;
  sourceKind: string;
  styleSignals: string[];
  taxonomySignals: string[];
}

export interface AIBlueprintObservationCluster {
  blockCount: number;
  clusterId: string;
  confidence: number;
  fingerprint: AIBlueprintObservationClusterFingerprint;
  normalizedAnalyzerPacketIds: string[];
  pageNumbers: number[];
  representativeTitle: string;
  sourceBlockIds: string[];
  sourcePacketIds: string[];
  warnings: AIBlueprintObservationClusterWarning[];
}

export interface AIBlueprintObservationClusterStats {
  clusterCount: number;
  generatedQuestionCount: 0;
  megaClusterAvoidedCount: number;
  mixedSourceWarningCount: number;
  normalizedAnalyzerPacketCount: number;
  observedBlockCount: number;
  providerCallCount: 0;
  rawStorageCount: 0;
  reviewDraftWriteCount: 0;
  singleBlockClusterCount: number;
  warningCount: number;
}

export interface AIBlueprintObservationClusterPlan {
  clusters: AIBlueprintObservationCluster[];
  generatedAt: string;
  mode: "deterministic";
  sourceObservationPlanRef: string | null;
  stats: AIBlueprintObservationClusterStats;
  status: AIBlueprintObservationClusterPlanStatus;
  version: AIBlueprintObservationClusterPlanVersion;
  warnings: string[];
}

export interface AIBlueprintObservationClusterAnalyzerPlan {
  cluster: AIBlueprintObservationCluster;
  observationPlan: AIBlueprintObservationPlan;
}

type ClusterBlockEntry = {
  block: AIBlueprintObservedQuestionBlock;
  fingerprint: AIBlueprintObservationClusterFingerprint;
  packet: AIBlueprintObservationPacket;
};

type GroupedClusterEntries = {
  entries: ClusterBlockEntry[];
  megaClusterSplit: boolean;
};

export const AI_BLUEPRINT_OBSERVATION_CLUSTER_PLAN_PATH =
  "summary.aiPdfImport.blueprintObservationClusterPlan";

export const BLUEPRINT_OBSERVATION_CLUSTER_BASE_WARNINGS = [
  "blueprint_observation_clustering_planning_only",
  "blueprint_observation_clustering_deterministic",
  "blueprint_observation_clustering_no_generation",
  "blueprint_observation_clustering_no_review_draft_write",
  "blueprint_observation_clustering_no_db_write",
  "blueprint_observation_clustering_no_provider_call",
] as const;

const MEGA_CLUSTER_MAX_BLOCKS = 4;

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function boundedText(value: unknown, maxLength = BLUEPRINT_OBSERVATION_SUMMARY_MAX_CHARS) {
  return stringValue(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort(
    (a, b) => a - b,
  );
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
  if (!plan) return null;

  return [
    plan.version,
    plan.generatedAt,
    plan.stats.normalizedPacketCount,
    plan.stats.observationPacketCount,
  ].join(":");
}

function normalizeSignalList(values: string[], fallback: string) {
  const normalized = uniqueStrings(
    values.map((value) => value.toLowerCase().replace(/\s+/g, "_")),
  );

  return normalized.length ? normalized.sort() : [fallback];
}

function representationGroup(block: AIBlueprintObservedQuestionBlock) {
  const hints = block.representationHints.join(" ").toLowerCase();
  const visual = /(graph|table|diagram|image|figure|visual|chart|coordinate)/i;
  const symbolic = /(symbolic|equation|formula|algebra|calculus|function)/i;
  const verbal = /(word|verbal|text|scenario|context)/i;

  if (visual.test(hints)) return "visual";
  if (symbolic.test(hints)) return "symbolic";
  if (verbal.test(hints)) return "verbal";

  return "unknown_representation";
}

function blockType(block: AIBlueprintObservedQuestionBlock) {
  const text = [
    block.stemPattern,
    block.answerStructureHint,
    block.distractorPatternHint,
    block.visualDescription,
    ...block.representationHints,
    ...block.styleNotes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/multiple choice|mcq|distractor|option/.test(text)) return "mcq";
  if (/fill|blank/.test(text)) return "fill_blank";
  if (/free response|frq|explain|justify|show work|manual/.test(text)) {
    return "free_response";
  }

  return "unknown_block_type";
}

function questionTypeHint(block: AIBlueprintObservedQuestionBlock) {
  const type = blockType(block);

  if (type !== "unknown_block_type") return type;
  if (block.distractorPatternHint) return "mcq_like";
  if (block.answerStructureHint) return "structured_response";

  return "unknown_question_type";
}

function fingerprintForBlock({
  block,
  sourceKind,
}: {
  block: AIBlueprintObservedQuestionBlock;
  sourceKind: string;
}): AIBlueprintObservationClusterFingerprint {
  return {
    answerStructure:
      boundedText(block.answerStructureHint, 80).toLowerCase() ||
      "unknown_answer_structure",
    blockType: blockType(block),
    cognitiveDemand:
      boundedText(block.cognitiveDemandHint, 80).toLowerCase() ||
      "unknown_cognitive_demand",
    distractorPattern:
      boundedText(block.distractorPatternHint, 80).toLowerCase() ||
      "none",
    promptVerb:
      boundedText(block.promptVerb, 40).toLowerCase() || "unknown_prompt",
    questionTypeHint: questionTypeHint(block),
    representationGroup: representationGroup(block),
    sourceKind,
    styleSignals: normalizeSignalList(block.styleNotes, "unknown_style"),
    taxonomySignals: normalizeSignalList(
      block.taxonomySignalHints,
      "unknown_taxonomy",
    ),
  };
}

function isUncertainFingerprint(
  fingerprint: AIBlueprintObservationClusterFingerprint,
) {
  return (
    fingerprint.answerStructure === "unknown_answer_structure" &&
    fingerprint.promptVerb === "unknown_prompt" &&
    fingerprint.taxonomySignals.includes("unknown_taxonomy")
  );
}

function fingerprintKey({
  block,
  fingerprint,
}: {
  block: AIBlueprintObservedQuestionBlock;
  fingerprint: AIBlueprintObservationClusterFingerprint;
}) {
  const core = [
    fingerprint.sourceKind,
    fingerprint.taxonomySignals.join("+"),
    fingerprint.representationGroup,
    fingerprint.questionTypeHint,
    fingerprint.promptVerb,
    fingerprint.answerStructure,
    fingerprint.cognitiveDemand,
  ].join("|");

  if (isUncertainFingerprint(fingerprint)) {
    return `${core}|blueprint_observation_cluster_uncertain_split|${block.blockId}`;
  }

  return core;
}

function entriesFromObservationPlan(
  observationPlan: AIBlueprintObservationPlan,
): ClusterBlockEntry[] {
  return observationPlan.observationPackets.flatMap((packet) =>
    packet.observedQuestionBlocks.map((block) => ({
      block,
      fingerprint: fingerprintForBlock({
        block,
        sourceKind: observationPlan.sourceKind,
      }),
      packet,
    })),
  );
}

function splitMegaClusters(entries: ClusterBlockEntry[]) {
  const chunks: ClusterBlockEntry[][] = [];

  for (let index = 0; index < entries.length; index += MEGA_CLUSTER_MAX_BLOCKS) {
    chunks.push(entries.slice(index, index + MEGA_CLUSTER_MAX_BLOCKS));
  }

  return chunks;
}

function groupedEntries(
  entries: ClusterBlockEntry[],
): GroupedClusterEntries[] {
  const grouped = new Map<string, ClusterBlockEntry[]>();

  for (const entry of entries) {
    const key = fingerprintKey({
      block: entry.block,
      fingerprint: entry.fingerprint,
    });
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  const result: GroupedClusterEntries[] = [];

  for (const group of grouped.values()) {
    if (group.length <= MEGA_CLUSTER_MAX_BLOCKS) {
      result.push({ entries: group, megaClusterSplit: false });
      continue;
    }

    result.push(...splitMegaClusters(group).map((chunk) => ({
      entries: chunk,
      megaClusterSplit: true,
    })));
  }

  return result;
}

function representativeTitle(entries: ClusterBlockEntry[]) {
  const first = entries[0];
  const taxonomy = first?.fingerprint.taxonomySignals.filter(
    (value) => value !== "unknown_taxonomy",
  );
  const verb =
    first?.fingerprint.promptVerb &&
    first.fingerprint.promptVerb !== "unknown_prompt"
      ? first.fingerprint.promptVerb
      : "";
  const representation =
    first?.fingerprint.representationGroup !== "unknown_representation"
      ? first?.fingerprint.representationGroup
      : "";

  return uniqueStrings([verb, representation, ...(taxonomy ?? [])])
    .slice(0, 4)
    .join(" / ") || "Blueprint observation cluster";
}

function sourcePages(entries: ClusterBlockEntry[]) {
  return uniqueNumbers(
    entries.flatMap((entry) => entry.packet.sourceRefs.pageNumbers ?? []),
  );
}

function confidenceFor(entries: ClusterBlockEntry[]) {
  if (!entries.length) return 0;

  const total = entries.reduce(
    (sum, entry) => sum + Number(entry.block.confidence || 0),
    0,
  );

  return Math.min(1, Math.max(0, Number((total / entries.length).toFixed(2))));
}

function warningsForCluster({
  entries,
  megaClusterSplit,
}: {
  entries: ClusterBlockEntry[];
  megaClusterSplit: boolean;
}) {
  const warnings = uniqueStrings([
    ...entries.flatMap((entry) => entry.packet.warnings),
    ...entries.flatMap((entry) => entry.block.warnings),
  ]);
  const packetIds = uniqueStrings(entries.map((entry) => entry.packet.packetId));
  const pages = sourcePages(entries);

  if (packetIds.length > 1 || pages.length > 1) {
    warnings.push("blueprint_observation_cluster_mixed_source_review");
  }

  if (megaClusterSplit) {
    warnings.push("blueprint_observation_cluster_mega_cluster_split");
  }

  if (entries.some((entry) => isUncertainFingerprint(entry.fingerprint))) {
    warnings.push("blueprint_observation_cluster_uncertain_split");
  }

  return uniqueStrings(warnings);
}

function normalizedPacketForCluster({
  clusterId,
  entry,
  index,
}: {
  clusterId: string;
  entry: ClusterBlockEntry;
  index: number;
}): AINormalizedBlueprintObservationPacket {
  const block = entry.block;
  const answerPatternHints = uniqueStrings([
    block.answerStructureHint ?? "",
    block.distractorPatternHint ?? "",
  ]);
  const representationHints = uniqueStrings(block.representationHints);
  const taxonomySignalHints = uniqueStrings(block.taxonomySignalHints);
  const styleConstraints = uniqueStrings([
    ...block.styleNotes,
    block.promptVerb ? `prompt verb: ${block.promptVerb}` : "",
    block.cognitiveDemandHint
      ? `cognitive demand: ${block.cognitiveDemandHint}`
      : "",
    block.stemPattern ? `stem pattern: ${block.stemPattern}` : "",
  ]);
  const boundedObservationSummary = boundedText(
    [
      `Cluster: ${clusterId}.`,
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
      answerPatternHints.length
        ? `Answer hints: ${answerPatternHints.join(", ")}.`
        : "",
      block.boundedEvidenceSnippets.length
        ? `Evidence: ${block.boundedEvidenceSnippets
            .map((snippet) =>
              boundedText(snippet, BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS),
            )
            .join(" | ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    BLUEPRINT_OBSERVATION_SUMMARY_MAX_CHARS,
  );

  return {
    answerPatternHints,
    assetRefs: entry.packet.sourceRefs.assetRefs.slice(0, 12),
    base64Stored: false,
    boundedObservationSummary,
    maxEvidenceCharsPerSnippet: BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS,
    normalizedPacketId: `normalized-${clusterId}-${index + 1}`,
    originalityConstraints: [
      "Do not copy source text verbatim.",
      "Do not solve the observed problem.",
      "Do not generate new questions during observation clustering.",
      "Use this cluster only as later blueprint-analysis input.",
    ],
    providerResponseStored: false,
    rawImageStored: false,
    rawPdfStored: false,
    representationHints,
    sourcePacketId: entry.packet.packetId,
    styleConstraints,
    taxonomySignalHints,
    textOnlyForAnalyzer: true,
    warnings: uniqueStrings([...entry.packet.warnings, ...block.warnings]),
  };
}

function clusterFromEntries({
  entries,
  index,
  megaClusterSplit,
}: {
  entries: ClusterBlockEntry[];
  index: number;
  megaClusterSplit: boolean;
}): AIBlueprintObservationCluster {
  const fingerprint = entries[0]?.fingerprint ?? {
    answerStructure: "unknown_answer_structure",
    blockType: "unknown_block_type",
    cognitiveDemand: "unknown_cognitive_demand",
    distractorPattern: "none",
    promptVerb: "unknown_prompt",
    questionTypeHint: "unknown_question_type",
    representationGroup: "unknown_representation",
    sourceKind: "unknown",
    styleSignals: ["unknown_style"],
    taxonomySignals: ["unknown_taxonomy"],
  };
  const clusterHash = hashStableJson({
    blockIds: entries.map((entry) => entry.block.blockId),
    fingerprint,
    index,
  }).slice(0, 8);
  const clusterId = `blueprint-observation-cluster-${index + 1}-${clusterHash}`;
  const sourcePacketIds = uniqueStrings(
    entries.map((entry) => entry.packet.packetId),
  );
  const sourceBlockIds = uniqueStrings(
    entries.map((entry) => `${entry.packet.packetId}:${entry.block.blockId}`),
  );

  return {
    blockCount: entries.length,
    clusterId,
    confidence: confidenceFor(entries),
    fingerprint,
    normalizedAnalyzerPacketIds: entries.map(
      (_entry, packetIndex) => `normalized-${clusterId}-${packetIndex + 1}`,
    ),
    pageNumbers: sourcePages(entries),
    representativeTitle: representativeTitle(entries),
    sourceBlockIds,
    sourcePacketIds,
    warnings: warningsForCluster({ entries, megaClusterSplit }),
  };
}

function statsFor({
  clusters,
  megaClusterAvoidedCount,
  warnings,
}: {
  clusters: AIBlueprintObservationCluster[];
  megaClusterAvoidedCount: number;
  warnings: string[];
}): AIBlueprintObservationClusterStats {
  const mixedSourceWarningCount = clusters.filter((cluster) =>
    cluster.warnings.includes("blueprint_observation_cluster_mixed_source_review"),
  ).length;

  return {
    clusterCount: clusters.length,
    generatedQuestionCount: 0,
    megaClusterAvoidedCount,
    mixedSourceWarningCount,
    normalizedAnalyzerPacketCount: clusters.reduce(
      (total, cluster) => total + cluster.normalizedAnalyzerPacketIds.length,
      0,
    ),
    observedBlockCount: clusters.reduce(
      (total, cluster) => total + cluster.blockCount,
      0,
    ),
    providerCallCount: 0,
    rawStorageCount: 0,
    reviewDraftWriteCount: 0,
    singleBlockClusterCount: clusters.filter((cluster) => cluster.blockCount === 1)
      .length,
    warningCount:
      warnings.length +
      clusters.reduce((total, cluster) => total + cluster.warnings.length, 0),
  };
}

export function buildAIBlueprintObservationClusterPlan({
  generatedAt = new Date().toISOString(),
  observationPlan,
}: {
  generatedAt?: string;
  observationPlan: AIBlueprintObservationPlan;
}): AIBlueprintObservationClusterPlan {
  const entries = entriesFromObservationPlan(observationPlan);
  const grouped = groupedEntries(entries);
  const megaClusterAvoidedCount = grouped.filter(
    (group) => group.megaClusterSplit,
  ).length;
  const clusters = grouped.map((group, index) =>
    clusterFromEntries({
      entries: group.entries,
      index,
      megaClusterSplit: group.megaClusterSplit,
    }),
  );
  const warnings = uniqueStrings([
    ...BLUEPRINT_OBSERVATION_CLUSTER_BASE_WARNINGS,
    ...(entries.length ? [] : ["blueprint_observation_cluster_no_blocks"]),
    ...(clusters.length > 1
      ? ["blueprint_observation_cluster_mixed_signals_split"]
      : []),
  ]);
  const status: AIBlueprintObservationClusterPlanStatus = clusters.length
    ? "planned"
    : "skipped";

  return {
    clusters,
    generatedAt,
    mode: "deterministic",
    sourceObservationPlanRef: sourceObservationRef(observationPlan),
    stats: statsFor({
      clusters,
      megaClusterAvoidedCount,
      warnings,
    }),
    status,
    version: "blueprint_observation_cluster_plan_v1",
    warnings,
  };
}

function packetForCluster({
  cluster,
  entries,
  packet,
}: {
  cluster: AIBlueprintObservationCluster;
  entries: ClusterBlockEntry[];
  packet: AIBlueprintObservationPacket;
}): AIBlueprintObservationPacket | null {
  const blocks = entries
    .filter((entry) => entry.packet.packetId === packet.packetId)
    .map((entry) => entry.block);

  if (!blocks.length) return null;

  return {
    ...packet,
    observedQuestionBlocks: blocks,
    packetId: `${cluster.clusterId}-${packet.packetId}`,
    warnings: uniqueStrings([
      ...packet.warnings,
      ...cluster.warnings,
      `cluster_id:${cluster.clusterId}`,
    ]),
  };
}

export function buildClusteredBlueprintObservationAnalyzerPlans({
  clusterPlan,
  observationPlan,
}: {
  clusterPlan: AIBlueprintObservationClusterPlan;
  observationPlan: AIBlueprintObservationPlan;
}): AIBlueprintObservationClusterAnalyzerPlan[] {
  const entries = entriesFromObservationPlan(observationPlan);

  return clusterPlan.clusters.map((cluster) => {
    const clusterEntrySet = new Set(cluster.sourceBlockIds);
    const clusterEntries = entries.filter((entry) =>
      clusterEntrySet.has(`${entry.packet.packetId}:${entry.block.blockId}`),
    );
    const observationPackets = observationPlan.observationPackets
      .map((packet) =>
        packetForCluster({
          cluster,
          entries: clusterEntries,
          packet,
        }),
      )
      .filter((packet): packet is AIBlueprintObservationPacket =>
        Boolean(packet),
      );
    const normalizedPackets = clusterEntries.map((entry, index) =>
      normalizedPacketForCluster({
        clusterId: cluster.clusterId,
        entry,
        index,
      }),
    );
    const clusterObservationPlan: AIBlueprintObservationPlan = {
      ...observationPlan,
      generatedAt: observationPlan.generatedAt,
      normalizedPackets,
      observationPackets,
      stats: {
        ...observationPlan.stats,
        normalizedPacketCount: 0,
        observationPacketCount: 0,
        observedBlockCount: 0,
        warningCount: 0,
      },
      warnings: uniqueStrings([
        ...observationPlan.warnings,
        ...cluster.warnings,
        `Blueprint analyzer input is restricted to cluster ${cluster.clusterId}.`,
      ]),
    };

    return {
      cluster,
      observationPlan: {
        ...clusterObservationPlan,
        stats: summarizeBlueprintObservationPlan(clusterObservationPlan),
      },
    };
  });
}

export function summarizeBlueprintObservationClusterPlan(
  plan: AIBlueprintObservationClusterPlan | null | undefined,
) {
  if (!plan) {
    return {
      clusterCount: 0,
      mixedSourceWarningCount: 0,
      singleBlockClusterCount: 0,
      status: "missing",
      warningCount: 0,
    };
  }

  return {
    clusterCount: plan.stats.clusterCount,
    mixedSourceWarningCount: plan.stats.mixedSourceWarningCount,
    singleBlockClusterCount: plan.stats.singleBlockClusterCount,
    status: plan.status,
    warningCount: plan.stats.warningCount,
  };
}

export function mergeAIBlueprintObservationClusterPlanIntoSummary(
  aiPdfImport: Record<string, unknown>,
  blueprintObservationClusterPlan: AIBlueprintObservationClusterPlan,
) {
  return {
    ...aiPdfImport,
    blueprintObservationClusterPlan,
  };
}
