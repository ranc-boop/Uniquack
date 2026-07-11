import crypto from "node:crypto";

export type QuestionBoundaryGuardPlanVersion = "question_boundary_guard_v1";

export type QuestionBoundaryGuardStatus =
  | "complete"
  | "complete_with_warnings"
  | "failed";

export type QuestionBoundaryGuardSeverity = "high" | "medium" | "low";

export type QuestionBoundaryGuardIssueKind =
  | "likely_duplicate"
  | "recovery_duplicate"
  | "question_number_conflict"
  | "cross_page_fragment"
  | "choices_only_fragment"
  | "solution_only_fragment"
  | "answer_alignment"
  | "visual_association"
  | "packet_chunk_boundary_split";

export type QuestionBoundaryGuardSuggestedAction =
  | "review_keep_one"
  | "review_merge_fragments"
  | "review_reassociate_visual"
  | "review_answer_alignment"
  | "review_question_number_conflict"
  | "review_manually"
  | "ignore_if_intentional";

export type QuestionBoundaryGuardProvenance =
  | "original"
  | "recovery"
  | "unknown";

export interface QuestionBoundaryGuardCandidate {
  assetPageNumbers?: number[];
  assetPlaceholders?: Array<{ pageNumber?: number | null; placeholder?: string | null }>;
  assetRefs?: string[];
  chunkIndex?: number | null;
  contentHtml?: string | null;
  contentSource?: string | null;
  extractionBatchIds?: string[];
  id: string;
  optionsCount?: number;
  packetIds?: string[];
  pageRefs?: number[];
  questionCode: string;
  recoveryProvenance?: QuestionBoundaryGuardProvenance;
  solutionHtml?: string | null;
  solutionSource?: string | null;
  sourceAssetId?: string | null;
  title?: string | null;
  visibleQuestionNumber?: string | null;
}

export interface QuestionBoundaryGuardFinding {
  chunkIndexes: number[];
  explanation: string;
  findingId: string;
  issueKind: QuestionBoundaryGuardIssueKind;
  packetIds: string[];
  pageRefs: number[];
  questionCodes: string[];
  questionIds: string[];
  reasonCodes: string[];
  recoveryProvenance: QuestionBoundaryGuardProvenance[];
  severity: QuestionBoundaryGuardSeverity;
  suggestedReviewAction: QuestionBoundaryGuardSuggestedAction;
  visibleQuestionNumbers: string[];
}

export interface QuestionBoundaryGuardPlan {
  analyzedQuestionCount: number;
  associationRiskCount: number;
  boundaryFragmentGroupCount: number;
  boundaryGroups: QuestionBoundaryGuardFinding[];
  duplicateGroups: QuestionBoundaryGuardFinding[];
  generatedAt: string;
  highRiskCount: number;
  likelyDuplicateGroupCount: number;
  lowRiskCount: number;
  mediumRiskCount: number;
  associationRisks: QuestionBoundaryGuardFinding[];
  status: QuestionBoundaryGuardStatus;
  version: QuestionBoundaryGuardPlanVersion;
  warnings: string[];
}

export interface BuildQuestionBoundaryGuardPlanInput {
  boundaryRiskPageNumbers?: number[];
  generatedAt?: string;
  questions: QuestionBoundaryGuardCandidate[];
  sourceAssetId?: string | null;
}

type NormalizedCandidate = QuestionBoundaryGuardCandidate & {
  content: string;
  contentFingerprint: string;
  numberSignature: string;
  pageRefs: number[];
  recoveryProvenance: QuestionBoundaryGuardProvenance;
  solution: string;
  sourceAssetId: string | null;
  visibleQuestionNumber: string;
};

type DuplicateEdge = {
  kind: "likely_duplicate" | "recovery_duplicate";
  left: NormalizedCandidate;
  reasons: string[];
  right: NormalizedCandidate;
  severity: QuestionBoundaryGuardSeverity;
};

function stableStringCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function asUniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)),
  ).sort(stableStringCompare);
}

function asUniqueNumbers(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.trunc(value)),
    ),
  ).sort((left, right) => left - right);
}

function plainText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");
}

export function normalizeQuestionBoundaryText(value: string | null | undefined) {
  return plainText(value)
    .normalize("NFKC")
    .replace(/[‐‑‒–—]/gu, "-")
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+|[+\-*/=<>^]/gu)
    ?.join(" ")
    .trim() ?? "";
}

function stableHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function createQuestionBoundaryFingerprint(value: string | null | undefined) {
  return stableHash(normalizeQuestionBoundaryText(value));
}

function tokens(value: string) {
  return value.split(" ").filter(Boolean);
}

export function boundedTokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);

  return Math.round((intersection.length / union.size) * 1000) / 1000;
}

function numberSignature(value: string) {
  return asUniqueStrings(value.match(/\d+(?:\.\d+)?/gu) ?? []).join(",");
}

function normalizedCandidate(candidate: QuestionBoundaryGuardCandidate): NormalizedCandidate {
  const content = normalizeQuestionBoundaryText(
    candidate.contentSource?.trim() || candidate.contentHtml,
  );
  const solution = normalizeQuestionBoundaryText(
    candidate.solutionSource?.trim() || candidate.solutionHtml,
  );

  return {
    ...candidate,
    content,
    contentFingerprint: createQuestionBoundaryFingerprint(content),
    numberSignature: numberSignature(content),
    pageRefs: asUniqueNumbers(candidate.pageRefs ?? []),
    recoveryProvenance: candidate.recoveryProvenance ?? "unknown",
    solution,
    sourceAssetId: candidate.sourceAssetId?.trim() || null,
    visibleQuestionNumber: candidate.visibleQuestionNumber?.trim() || "",
  };
}

function sharedNumbers(left: number[], right: number[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function areAdjacent(left: number[], right: number[]) {
  if (!left.length || !right.length) return false;

  return left.some((leftPage) => right.some((rightPage) => Math.abs(leftPage - rightPage) <= 1));
}

function sameSource(left: NormalizedCandidate, right: NormalizedCandidate) {
  return Boolean(left.sourceAssetId && right.sourceAssetId && left.sourceAssetId === right.sourceAssetId);
}

function isRecoveryPair(left: NormalizedCandidate, right: NormalizedCandidate) {
  return (
    (left.recoveryProvenance === "original" && right.recoveryProvenance === "recovery") ||
    (left.recoveryProvenance === "recovery" && right.recoveryProvenance === "original")
  );
}

function materiallyDifferentNumbers(left: NormalizedCandidate, right: NormalizedCandidate) {
  return Boolean(
    left.numberSignature &&
      right.numberSignature &&
      left.numberSignature !== right.numberSignature,
  );
}

function startsLikeContinuation(value: string | null | undefined) {
  return /^(?:[([\{]?\s*(?:[a-z]|[ivxlcdm]+|part\s+[a-z0-9]+)\)|[a-d]\s*[.)]|choices?\b)/iu.test(
    plainText(value).trim(),
  );
}

function endsAbruptly(value: string | null | undefined) {
  const text = plainText(value).trim();
  if (!text) return false;

  const opens = (text.match(/[([{]/gu) ?? []).length;
  const closes = (text.match(/[)\]}]/gu) ?? []).length;

  return /(?:[,;:=(\[{+\-*/]|\b(?:and|or|where|if|then|given))$/iu.test(text) || opens > closes;
}

function mentionsVisual(value: string | null | undefined) {
  return /\b(?:figure|fig\.?|graph|table|diagram|chart|image|above|below)\b/iu.test(
    plainText(value),
  );
}

function sameVisibleNumber(left: NormalizedCandidate, right: NormalizedCandidate) {
  return Boolean(
    left.visibleQuestionNumber &&
      right.visibleQuestionNumber &&
      normalizeQuestionBoundaryText(left.visibleQuestionNumber) ===
        normalizeQuestionBoundaryText(right.visibleQuestionNumber),
  );
}

function candidatesForFinding(candidates: NormalizedCandidate[]) {
  return {
    chunkIndexes: asUniqueNumbers(candidates.map((candidate) => candidate.chunkIndex)),
    packetIds: asUniqueStrings(candidates.flatMap((candidate) => candidate.packetIds ?? [])),
    pageRefs: asUniqueNumbers(candidates.flatMap((candidate) => candidate.pageRefs)),
    questionCodes: asUniqueStrings(candidates.map((candidate) => candidate.questionCode)),
    questionIds: asUniqueStrings(candidates.map((candidate) => candidate.id)),
    recoveryProvenance: Array.from(
      new Set(candidates.map((candidate) => candidate.recoveryProvenance)),
    ).sort(),
    visibleQuestionNumbers: asUniqueStrings(
      candidates.map((candidate) => candidate.visibleQuestionNumber),
    ),
  };
}

function finding({
  candidates,
  explanation,
  issueKind,
  reasonCodes,
  severity,
  suggestedReviewAction,
}: {
  candidates: NormalizedCandidate[];
  explanation: string;
  issueKind: QuestionBoundaryGuardIssueKind;
  reasonCodes: string[];
  severity: QuestionBoundaryGuardSeverity;
  suggestedReviewAction: QuestionBoundaryGuardSuggestedAction;
}): QuestionBoundaryGuardFinding {
  const candidateData = candidatesForFinding(candidates);
  const findingId = `question-boundary-${stableHash({
    issueKind,
    questionIds: candidateData.questionIds,
    reasonCodes: asUniqueStrings(reasonCodes),
  }).slice(0, 16)}`;

  return {
    ...candidateData,
    explanation,
    findingId,
    issueKind,
    reasonCodes: asUniqueStrings(reasonCodes),
    severity,
    suggestedReviewAction,
  };
}

function severityCount(
  findings: QuestionBoundaryGuardFinding[],
  severity: QuestionBoundaryGuardSeverity,
) {
  return findings.filter((item) => item.severity === severity).length;
}

function componentGroups(edges: DuplicateEdge[]) {
  const parent = new Map<string, string>();
  const byId = new Map<string, NormalizedCandidate>();

  function root(id: string): string {
    const existing = parent.get(id) ?? id;
    if (existing === id) return id;
    const next = root(existing);
    parent.set(id, next);
    return next;
  }

  for (const edge of edges) {
    parent.set(edge.left.id, root(edge.left.id));
    parent.set(edge.right.id, root(edge.right.id));
    const leftRoot = root(edge.left.id);
    const rightRoot = root(edge.right.id);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    byId.set(edge.left.id, edge.left);
    byId.set(edge.right.id, edge.right);
  }

  const groups = new Map<string, { candidates: NormalizedCandidate[]; edges: DuplicateEdge[] }>();
  for (const edge of edges) {
    const key = root(edge.left.id);
    const current = groups.get(key) ?? { candidates: [], edges: [] };
    current.edges.push(edge);
    groups.set(key, current);
  }

  for (const group of groups.values()) {
    const ids = asUniqueStrings(group.edges.flatMap((edge) => [edge.left.id, edge.right.id]));
    group.candidates = ids.map((id) => byId.get(id)).filter(Boolean) as NormalizedCandidate[];
  }

  return Array.from(groups.values()).sort((left, right) =>
    stableStringCompare(left.candidates[0]!.id, right.candidates[0]!.id),
  );
}

function duplicateEdges(candidates: NormalizedCandidate[]) {
  const edges: DuplicateEdge[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex]!;
      const right = candidates[rightIndex]!;
      if (!sameSource(left, right) || materiallyDifferentNumbers(left, right)) continue;

      const sharedPages = sharedNumbers(left.pageRefs, right.pageRefs);
      const stemSimilarity = boundedTokenSimilarity(left.content, right.content);
      const solutionSimilarity = boundedTokenSimilarity(left.solution, right.solution);
      const exactStem = Boolean(left.content) && left.contentFingerprint === right.contentFingerprint;
      const nearExactStem =
        stemSimilarity >= 0.96 &&
        (!left.numberSignature || !right.numberSignature || left.numberSignature === right.numberSignature);
      const recoveryPair = isRecoveryPair(left, right);
      const sameNumber = sameVisibleNumber(left, right);

      if (
        (exactStem || nearExactStem) &&
        (sharedPages.length > 0 || sameNumber || recoveryPair)
      ) {
        edges.push({
          kind: recoveryPair ? "recovery_duplicate" : "likely_duplicate",
          left,
          reasons: [
            exactStem ? "exact_normalized_stem" : "near_exact_normalized_stem",
            ...(sharedPages.length ? ["overlapping_page_refs"] : []),
            ...(sameNumber ? ["same_visible_question_number"] : []),
            ...(recoveryPair ? ["original_recovery_pair"] : []),
          ],
          right,
          severity: "high",
        });
        continue;
      }

      if (
        stemSimilarity >= 0.84 &&
        solutionSimilarity >= 0.72 &&
        (areAdjacent(left.pageRefs, right.pageRefs) || sameNumber)
      ) {
        edges.push({
          kind: recoveryPair ? "recovery_duplicate" : "likely_duplicate",
          left,
          reasons: [
            "similar_stem_and_solution",
            ...(areAdjacent(left.pageRefs, right.pageRefs) ? ["adjacent_page_refs"] : []),
            ...(sameNumber ? ["same_visible_question_number"] : []),
            ...(recoveryPair ? ["original_recovery_pair"] : []),
          ],
          right,
          severity: "medium",
        });
      }
    }
  }

  return edges;
}

function duplicateFindings(candidates: NormalizedCandidate[]) {
  const edges = duplicateEdges(candidates);

  return componentGroups(edges).map((group) => {
    const recovery = group.edges.some((edge) => edge.kind === "recovery_duplicate");
    const severity = group.edges.some((edge) => edge.severity === "high")
      ? "high"
      : "medium";
    const numbers = candidatesForFinding(group.candidates).visibleQuestionNumbers;

    return finding({
      candidates: group.candidates,
      explanation: recovery
        ? "Original and recovery candidates appear to describe the same source question. Keep or reconcile them during review."
        : numbers.length
          ? `Candidates with visible number ${numbers.join(", ")} appear to overlap. Keep one only after source review.`
          : "Candidates have overlapping source evidence and very similar question text. Keep one only after source review.",
      issueKind: recovery ? "recovery_duplicate" : "likely_duplicate",
      reasonCodes: group.edges.flatMap((edge) => edge.reasons),
      severity,
      suggestedReviewAction: "review_keep_one",
    });
  });
}

function numberConflictFindings(candidates: NormalizedCandidate[]) {
  const findings: QuestionBoundaryGuardFinding[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex]!;
      const right = candidates[rightIndex]!;
      if (!sameSource(left, right) || !sameVisibleNumber(left, right)) continue;

      const similarity = boundedTokenSimilarity(left.content, right.content);
      if (similarity >= 0.84) continue;

      findings.push(
        finding({
          candidates: [left, right],
          explanation:
            "The same visible question number has materially different content. Confirm the source numbering; this is not treated as an automatic duplicate.",
          issueKind: "question_number_conflict",
          reasonCodes: ["same_visible_question_number", "materially_different_content"],
          severity: "medium",
          suggestedReviewAction: "review_question_number_conflict",
        }),
      );
    }
  }

  return findings;
}

function boundaryFindings({
  boundaryRiskPageNumbers,
  candidates,
}: {
  boundaryRiskPageNumbers: number[];
  candidates: NormalizedCandidate[];
}) {
  const findings: QuestionBoundaryGuardFinding[] = [];
  const seen = new Set<string>();
  const add = (item: QuestionBoundaryGuardFinding) => {
    if (!seen.has(item.findingId)) {
      seen.add(item.findingId);
      findings.push(item);
    }
  };

  for (const candidate of candidates) {
    const hasStem = Boolean(candidate.content);
    const hasSolution = Boolean(candidate.solution);
    const hasOptions = (candidate.optionsCount ?? 0) > 0;
    const overlapsRisk = candidate.pageRefs.some((page) => boundaryRiskPageNumbers.includes(page));
    const assetPageNumbers = asUniqueNumbers([
      ...(candidate.assetPageNumbers ?? []),
      ...(candidate.assetPlaceholders ?? []).map((placeholder) => placeholder.pageNumber),
    ]);
    const hasVisualSupport =
      assetPageNumbers.length > 0 ||
      (candidate.assetRefs ?? []).length > 0 ||
      (candidate.assetPlaceholders ?? []).length > 0;

    if (!hasStem && hasOptions) {
      add(
        finding({
          candidates: [candidate],
          explanation: "This item has choices but no complete question prompt. Check the preceding page or chunk before approval.",
          issueKind: "choices_only_fragment",
          reasonCodes: ["missing_stem", "choices_present"],
          severity: "high",
          suggestedReviewAction: "review_merge_fragments",
        }),
      );
    }

    if (!hasStem && hasSolution) {
      add(
        finding({
          candidates: [candidate],
          explanation: "This item has solution material without a complete question prompt. Check answer alignment before approval.",
          issueKind: "solution_only_fragment",
          reasonCodes: ["missing_stem", "solution_present"],
          severity: "high",
          suggestedReviewAction: "review_answer_alignment",
        }),
      );
    }

    if (hasStem && !hasSolution && endsAbruptly(candidate.contentSource ?? candidate.contentHtml)) {
      add(
        finding({
          candidates: [candidate],
          explanation: "The prompt appears to stop at a boundary and has no supporting solution. Check nearby source pages before approval.",
          issueKind: "answer_alignment",
          reasonCodes: ["abrupt_stem_ending", "missing_solution"],
          severity: "medium",
          suggestedReviewAction: "review_answer_alignment",
        }),
      );
    }

    if (overlapsRisk) {
      add(
        finding({
          candidates: [candidate],
          explanation: "This draft overlaps a preanalysis page-boundary risk. Confirm that its prompt, choices, and answer stay together.",
          issueKind: "packet_chunk_boundary_split",
          reasonCodes: ["preanalysis_boundary_risk_overlap"],
          severity: "medium",
          suggestedReviewAction: "review_manually",
        }),
      );
    }

    if (mentionsVisual(candidate.contentSource ?? candidate.contentHtml) && !hasVisualSupport) {
      add(
        finding({
          candidates: [candidate],
          explanation: "The prompt refers to a figure, graph, table, or diagram without attached visual evidence. Confirm the source association.",
          issueKind: "visual_association",
          reasonCodes: ["visual_reference_without_asset"],
          severity: "medium",
          suggestedReviewAction: "review_reassociate_visual",
        }),
      );
    }

    if (
      assetPageNumbers.length > 0 &&
      candidate.pageRefs.length > 0 &&
      assetPageNumbers.some((page) => !candidate.pageRefs.includes(page))
    ) {
      add(
        finding({
          candidates: [candidate],
          explanation: "A visual placeholder points outside this draft's source pages. Confirm which question owns the visual before approval.",
          issueKind: "visual_association",
          reasonCodes: ["asset_page_outside_question_pages"],
          severity: "medium",
          suggestedReviewAction: "review_reassociate_visual",
        }),
      );
    }
  }

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex]!;
      const right = candidates[rightIndex]!;
      if (!sameSource(left, right) || !areAdjacent(left.pageRefs, right.pageRefs)) continue;

      const matchingNumber = sameVisibleNumber(left, right);
      const leftAbrupt = endsAbruptly(left.contentSource ?? left.contentHtml);
      const rightContinuation = startsLikeContinuation(right.contentSource ?? right.contentHtml);
      const complementary =
        (!left.content && Boolean(right.content)) ||
        (!right.content && Boolean(left.content)) ||
        ((left.optionsCount ?? 0) > 0 && !left.content) ||
        ((right.optionsCount ?? 0) > 0 && !right.content);

      if (!matchingNumber && !((leftAbrupt && rightContinuation) || complementary)) {
        continue;
      }

      add(
        finding({
          candidates: [left, right],
          explanation:
            "Adjacent source pages appear to contain parts of one question. Review the pair together; no content was merged automatically.",
          issueKind: "cross_page_fragment",
          reasonCodes: [
            ...(matchingNumber ? ["same_visible_question_number"] : []),
            ...(leftAbrupt ? ["abrupt_preceding_stem"] : []),
            ...(rightContinuation ? ["continuation_like_next_page"] : []),
            ...(complementary ? ["complementary_fragment_shape"] : []),
            "adjacent_page_refs",
          ],
          severity: matchingNumber || complementary ? "high" : "medium",
          suggestedReviewAction: "review_merge_fragments",
        }),
      );
    }
  }

  return findings;
}

function sharedAssetFindings(candidates: NormalizedCandidate[]) {
  const byAsset = new Map<string, NormalizedCandidate[]>();

  for (const candidate of candidates) {
    for (const assetRef of asUniqueStrings(candidate.assetRefs ?? [])) {
      const current = byAsset.get(assetRef) ?? [];
      current.push(candidate);
      byAsset.set(assetRef, current);
    }
  }

  return Array.from(byAsset.entries())
    .filter(([, candidatesForAsset]) => candidatesForAsset.length > 1)
    .map(([, candidatesForAsset]) =>
      finding({
        candidates: candidatesForAsset,
        explanation:
          "Multiple draft questions reference the same visual asset. Confirm that the crop belongs to each question before approval.",
        issueKind: "visual_association",
        reasonCodes: ["shared_asset_reference"],
        severity: "medium",
        suggestedReviewAction: "review_reassociate_visual",
      }),
    );
}

export function buildQuestionBoundaryGuardPlan({
  boundaryRiskPageNumbers = [],
  generatedAt = new Date().toISOString(),
  questions,
}: BuildQuestionBoundaryGuardPlanInput): QuestionBoundaryGuardPlan {
  const candidates = questions
    .filter((question) => question.id.trim() && question.questionCode.trim())
    .map(normalizedCandidate)
    .sort((left, right) => stableStringCompare(left.id, right.id));
  const duplicateGroups = duplicateFindings(candidates);
  const detectedBoundaryFindings = boundaryFindings({
    boundaryRiskPageNumbers: asUniqueNumbers(boundaryRiskPageNumbers),
    candidates,
  });
  const associationRisks = [
    ...detectedBoundaryFindings.filter(
      (item) => item.issueKind === "visual_association",
    ),
    ...sharedAssetFindings(candidates),
  ];
  const boundaryGroups = [
    ...detectedBoundaryFindings.filter(
      (item) => item.issueKind !== "visual_association",
    ),
    ...numberConflictFindings(candidates),
  ];
  const allFindings = [...duplicateGroups, ...boundaryGroups, ...associationRisks];
  const warnings = asUniqueStrings([
    "question_boundary_guard_review_only",
    "question_boundary_guard_no_auto_merge",
    "question_boundary_guard_no_question_mutation",
    ...(allFindings.length ? ["question_boundary_guard_review_recommended"] : []),
  ]);

  return {
    analyzedQuestionCount: candidates.length,
    associationRiskCount: associationRisks.length,
    boundaryFragmentGroupCount: boundaryGroups.filter((item) =>
      [
        "cross_page_fragment",
        "choices_only_fragment",
        "solution_only_fragment",
        "packet_chunk_boundary_split",
      ].includes(item.issueKind),
    ).length,
    boundaryGroups,
    duplicateGroups,
    generatedAt,
    highRiskCount: severityCount(allFindings, "high"),
    likelyDuplicateGroupCount: duplicateGroups.length,
    lowRiskCount: severityCount(allFindings, "low"),
    mediumRiskCount: severityCount(allFindings, "medium"),
    associationRisks,
    status: allFindings.length ? "complete_with_warnings" : "complete",
    version: "question_boundary_guard_v1",
    warnings,
  };
}

export function failedQuestionBoundaryGuardPlan({
  warning,
}: {
  warning?: string;
} = {}): QuestionBoundaryGuardPlan {
  return {
    analyzedQuestionCount: 0,
    associationRiskCount: 0,
    boundaryFragmentGroupCount: 0,
    boundaryGroups: [],
    duplicateGroups: [],
    generatedAt: new Date().toISOString(),
    highRiskCount: 0,
    likelyDuplicateGroupCount: 0,
    lowRiskCount: 0,
    mediumRiskCount: 0,
    associationRisks: [],
    status: "failed",
    version: "question_boundary_guard_v1",
    warnings: asUniqueStrings([
      "question_boundary_guard_failed",
      "question_boundary_guard_import_continued",
      warning ?? "Question boundary analysis could not be completed.",
    ]),
  };
}

export function mergeQuestionBoundaryGuardPlanIntoSummary(
  aiPdfImport: Record<string, unknown>,
  plan: QuestionBoundaryGuardPlan,
) {
  return {
    ...aiPdfImport,
    questionBoundaryGuardPlan: plan,
  };
}

export function questionBoundaryFindingsForQuestion({
  plan,
  questionId,
  questionCode,
}: {
  plan: unknown;
  questionId?: string | null;
  questionCode?: string | null;
}) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return [];
  const record = plan as Record<string, unknown>;
  const all = [
    ...(Array.isArray(record.duplicateGroups) ? record.duplicateGroups : []),
    ...(Array.isArray(record.boundaryGroups) ? record.boundaryGroups : []),
    ...(Array.isArray(record.associationRisks) ? record.associationRisks : []),
  ];

  return all.filter((item): item is QuestionBoundaryGuardFinding => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const finding = item as Record<string, unknown>;
    const ids = Array.isArray(finding.questionIds) ? finding.questionIds.map(String) : [];
    const codes = Array.isArray(finding.questionCodes)
      ? finding.questionCodes.map(String)
      : [];

    return Boolean(
      (questionId && ids.includes(questionId)) ||
        (questionCode && codes.includes(questionCode)),
    );
  });
}
