import type {
  CanonicalAnswerProposalV2,
  CanonicalQuestionPackageV2,
  DocumentExtractionV2,
} from "./contracts";
import { documentExtractionV2HasWritableProjection } from "./validation";

export type V1QuestionOptionProjectionV2 = {
  content_html: string;
  content_source: string;
  id: string;
  label: string;
};

export type V1QuestionAnswerSpecProjectionV2 = {
  accepted_answers?: string[];
  allow_multiple?: boolean;
  case_sensitive?: boolean;
  correct_option_ids?: string[];
  equivalence?: "exact" | "numeric" | "math";
  final_answers?: string[];
  grading_mode?: "manual_or_ai";
  kind: "mcq" | "fill_blank" | "frq" | "mixed";
  numeric_tolerance?: number;
};

export type V1ReviewDraftProjectionV2 = {
  question: {
    ai_metadata: {
      canonicalAnswer: CanonicalAnswerProposalV2;
      contractVersion: "ai_parsing_canonical_v2";
      disposition: CanonicalQuestionPackageV2["disposition"]["status"];
      generationRelevantFeatures: CanonicalQuestionPackageV2["generationRelevantFeatures"];
      multipartChildren: Array<{
        answer: CanonicalAnswerProposalV2;
        disposition: CanonicalQuestionPackageV2["disposition"]["status"];
        generationRelevantFeatures: CanonicalQuestionPackageV2["generationRelevantFeatures"];
        id: string;
        options: CanonicalQuestionPackageV2["question"]["options"];
        promptText: string;
        questionType: CanonicalQuestionPackageV2["question"]["questionType"];
        visibleNumber: string | null;
      }>;
      sourceLineage: Array<{
        bbox: CanonicalQuestionPackageV2["sourceSpans"][number]["bbox"];
        pageEnd: number | null;
        pageStart: number | null;
        precision: CanonicalQuestionPackageV2["sourceSpans"][number]["precision"];
        questionIds: string[];
        role: CanonicalQuestionPackageV2["sourceSpans"][number]["role"];
        sourceAssetRef: string;
        spanId: string;
      }>;
      taxonomyDecisions: CanonicalQuestionPackageV2["taxonomyDecisions"];
      visualReferences: Array<{
        deterministicCropProposalKey: string | null;
        id: string;
        kind: CanonicalQuestionPackageV2["visualObjects"][number]["kind"];
        persistentAssetIdentity: null;
        required: boolean;
      }>;
    };
    answer_spec: V1QuestionAnswerSpecProjectionV2;
    content_html: string;
    content_source: string;
    content_source_format: "markdown";
    difficulty_rating: number;
    options: V1QuestionOptionProjectionV2[];
    owner_bank_id: string;
    question_code: string;
    question_type: "mcq" | "fill_blank" | "frq" | "mixed";
    solution_html: string | null;
    solution_source: string;
    solution_source_format: "markdown";
    source: "AI Parsing V2";
    source_kind: "ai_pdf";
    status: "draft";
    tag_ids: string[];
    title: string;
    visibility: "private";
  };
  reviewItem: {
    draft_payload: {
      aiParsingV2ContractVersion: "ai_parsing_canonical_v2";
      qualityDisposition: CanonicalQuestionPackageV2["disposition"]["status"];
      writeAuthority: "none_source_only_projection";
    };
    status: "pending_review" | "needs_more_evidence";
    target_bank_id: string;
    validation_warnings: string[];
  };
};

function escapeHtml(value: string) {
  return value.replace(/[&"<>]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      '"': "&quot;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return replacements[character] ?? character;
  });
}

function sourceToHtml(value: string) {
  return `<p>${escapeHtml(value).replace(/\n/g, "<br />")}</p>`;
}

function projectedQuestionType(
  packageValue: CanonicalQuestionPackageV2,
): V1ReviewDraftProjectionV2["question"]["question_type"] {
  switch (packageValue.question.questionType) {
    case "multiple_choice":
      return "mcq";
    case "boolean":
    case "numeric":
    case "short_text":
      return "fill_blank";
    case "free_response":
      return "frq";
    case "multipart":
      return "mixed";
  }
}

function uniqueById<T extends { id: string }>(values: T[]) {
  return Array.from(new Map(values.map((value) => [value.id, value])).values());
}

function answerSpecProjection(
  answer: CanonicalAnswerProposalV2,
): V1QuestionAnswerSpecProjectionV2 {
  switch (answer.kind) {
    case "multiple_choice":
      return {
        allow_multiple: answer.allowMultiple,
        correct_option_ids: [...answer.selectedOptionIds],
        kind: "mcq",
      };
    case "boolean": {
      const value = answer.value ? "true" : "false";
      return {
        accepted_answers: [value],
        case_sensitive: false,
        equivalence: "exact",
        final_answers: [value],
        kind: "fill_blank",
        numeric_tolerance: 0,
      };
    }
    case "numeric": {
      const value = String(answer.value);
      const valueWithUnit = answer.unit ? `${value} ${answer.unit}` : value;
      return {
        accepted_answers: Array.from(
          new Set([valueWithUnit, value, ...answer.acceptedFormats]),
        ),
        case_sensitive: false,
        equivalence: "numeric",
        final_answers: [valueWithUnit],
        kind: "fill_blank",
        numeric_tolerance: answer.tolerance ?? 0,
      };
    }
    case "short_text":
      return {
        accepted_answers: [...answer.acceptedTexts],
        case_sensitive: answer.caseSensitive,
        equivalence: "exact",
        final_answers: [answer.acceptedTexts[0]!],
        kind: "fill_blank",
        numeric_tolerance: 0,
      };
    case "free_response":
      return { grading_mode: "manual_or_ai", kind: "frq" };
    case "multipart":
      return { grading_mode: "manual_or_ai", kind: "mixed" };
  }
}

function solutionSource(packageValue: CanonicalQuestionPackageV2) {
  if (!packageValue.solution) return "";
  const proposal = packageValue.solution.proposal;
  return [
    proposal.summary,
    ...proposal.steps.map((step, index) => `${index + 1}. ${step.text}`),
  ].join("\n\n");
}

function projectPackage({
  multipartChildren,
  ownerBankId,
  packageValue,
}: {
  multipartChildren: CanonicalQuestionPackageV2[];
  ownerBankId: string;
  packageValue: CanonicalQuestionPackageV2;
}): V1ReviewDraftProjectionV2 | null {
  if (
    packageValue.disposition.status !== "review_ready" &&
    packageValue.disposition.status !== "needs_more_evidence"
  ) {
    return null;
  }

  const projectionPackages = [packageValue, ...multipartChildren];
  const effectiveDisposition = projectionPackages.some(
    (item) => item.disposition.status === "needs_more_evidence",
  )
    ? "needs_more_evidence"
    : packageValue.disposition.status;
  const findingCodes = Array.from(
    new Set(
      projectionPackages.flatMap((item) => item.disposition.findingCodes),
    ),
  );
  const sourceLineage = uniqueById(
    projectionPackages.flatMap((item) => item.sourceSpans),
  );
  const visualReferences = uniqueById(
    projectionPackages.flatMap((item) => item.visualObjects),
  );
  const questionContent = [
    packageValue.question.promptText,
    ...multipartChildren.map((child) => {
      const prompt = child.question.visibleNumber
        ? `${child.question.visibleNumber}. ${child.question.promptText}`
        : child.question.promptText;
      return [
        prompt,
        ...child.question.options.map(
          (option) => `${option.label}. ${option.text}`,
        ),
      ].join("\n");
    }),
  ].join("\n\n");
  const solution = [
    solutionSource(packageValue),
    ...multipartChildren.map((child) => {
      const childSolution = solutionSource(child);
      if (!childSolution) return "";
      return child.question.visibleNumber
        ? `${child.question.visibleNumber}. ${childSolution}`
        : childSolution;
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
  const title = packageValue.question.visibleNumber
    ? `Question ${packageValue.question.visibleNumber}`
    : `Imported question ${packageValue.question.id}`;
  const tagIds = Array.from(
    new Set(
      projectionPackages.flatMap((item) =>
        item.taxonomyDecisions
          .filter(
            (decision) => decision.decision === "assign" && decision.tagId,
          )
          .map((decision) => decision.tagId!),
      ),
    ),
  );
  const reviewStatus =
    effectiveDisposition === "needs_more_evidence"
      ? "needs_more_evidence"
      : "pending_review";

  return {
    question: {
      ai_metadata: {
        canonicalAnswer: packageValue.answer.proposal,
        contractVersion: "ai_parsing_canonical_v2",
        disposition: effectiveDisposition,
        generationRelevantFeatures: packageValue.generationRelevantFeatures,
        multipartChildren: multipartChildren.map((child) => ({
          answer: child.answer.proposal,
          disposition: child.disposition.status,
          generationRelevantFeatures: child.generationRelevantFeatures,
          id: child.question.id,
          options: child.question.options,
          promptText: child.question.promptText,
          questionType: child.question.questionType,
          visibleNumber: child.question.visibleNumber,
        })),
        sourceLineage: sourceLineage.map((span) => ({
          bbox: span.bbox,
          pageEnd: span.pageEnd,
          pageStart: span.pageStart,
          precision: span.precision,
          questionIds: [...span.questionIds],
          role: span.role,
          sourceAssetRef: span.sourceAssetRef,
          spanId: span.id,
        })),
        taxonomyDecisions: packageValue.taxonomyDecisions,
        visualReferences: visualReferences
          .filter((visual) => visual.kind !== "decorative")
          .map((visual) => ({
            deterministicCropProposalKey: visual.deterministicCropProposalKey,
            id: visual.id,
            kind: visual.kind,
            persistentAssetIdentity: visual.persistentAssetIdentity,
            required: visual.required,
          })),
      },
      answer_spec: answerSpecProjection(packageValue.answer.proposal),
      content_html: sourceToHtml(questionContent),
      content_source: questionContent,
      content_source_format: "markdown",
      difficulty_rating: packageValue.question.difficultyRating,
      options: packageValue.question.options.map((option) => ({
        content_html: sourceToHtml(option.text),
        content_source: option.text,
        id: option.id,
        label: option.label,
      })),
      owner_bank_id: ownerBankId,
      question_code: packageValue.question.id,
      question_type: projectedQuestionType(packageValue),
      solution_html: solution ? sourceToHtml(solution) : null,
      solution_source: solution,
      solution_source_format: "markdown",
      source: "AI Parsing V2",
      source_kind: "ai_pdf",
      status: "draft",
      tag_ids: tagIds,
      title,
      visibility: "private",
    },
    reviewItem: {
      draft_payload: {
        aiParsingV2ContractVersion: "ai_parsing_canonical_v2",
        qualityDisposition: effectiveDisposition,
        writeAuthority: "none_source_only_projection",
      },
      status: reviewStatus,
      target_bank_id: ownerBankId,
      validation_warnings: findingCodes,
    },
  };
}

export function projectDocumentExtractionV2ToV1ReviewDrafts({
  extraction,
  ownerBankId,
}: {
  extraction: DocumentExtractionV2;
  ownerBankId: string;
}): V1ReviewDraftProjectionV2[] {
  if (!documentExtractionV2HasWritableProjection(extraction)) return [];
  if (!ownerBankId.trim()) return [];
  if (ownerBankId !== extraction.bankScopeKey) return [];

  const packagesByQuestionId = new Map(
    extraction.questionPackages.map((packageValue) => [
      packageValue.question.id,
      packageValue,
    ]),
  );

  return extraction.questionPackages
    .filter(
      (packageValue) =>
        packageValue.question.boundaryKind !== "multipart_child",
    )
    .map((packageValue) => {
      const multipartChildren =
        packageValue.question.boundaryKind === "multipart_parent"
          ? packageValue.question.childQuestionIds
              .map((id) => packagesByQuestionId.get(id))
              .filter(
                (child): child is CanonicalQuestionPackageV2 => Boolean(child),
              )
          : [];
      return projectPackage({
        multipartChildren,
        ownerBankId,
        packageValue,
      });
    })
    .filter((value): value is V1ReviewDraftProjectionV2 => value !== null);
}
