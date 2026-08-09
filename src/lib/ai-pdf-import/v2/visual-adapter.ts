import type { AIPdfAssetPlaceholder } from "@/lib/ai-pdf-import/schema";
import {
  contentSha256,
  deterministicQuestionAssetId,
  validateAIPdfVisualProposal,
  visualProposalKey,
} from "@/lib/ai-pdf-import/visual-evidence";

import type {
  SourceSpanProposalV2,
  VisualObjectProposalV2,
} from "./contracts";
import { sha256CanonicalJsonV2 } from "./fingerprint";

function legacyVisualRole(
  visual: VisualObjectProposalV2,
): NonNullable<AIPdfAssetPlaceholder["visual_role"]> {
  if (visual.kind === "answer_key") return "answer_figure";
  if (visual.kind === "decorative") return "decorative";
  if (visual.visualType === "diagram") return "diagram";
  if (visual.visualType === "graph") return "graph";
  if (visual.visualType === "table") return "table";
  return "question_figure";
}

function safePlaceholderToken(visual: VisualObjectProposalV2) {
  return sha256CanonicalJsonV2({
    id: visual.id,
    questionIds: [...visual.questionIds].sort(),
  }).slice(0, 32);
}

export function validateV2VisualWithMatureKernel({
  availablePageNumbers,
  pageCount,
  questionPageRefs,
  sourceSpan,
  visual,
}: {
  availablePageNumbers: number[];
  pageCount: number;
  questionPageRefs: number[];
  sourceSpan: SourceSpanProposalV2 | null;
  visual: VisualObjectProposalV2;
}) {
  if (
    visual.kind === "missing" ||
    visual.kind === "decorative" ||
    !sourceSpan ||
    !sourceSpan.bbox ||
    sourceSpan.pageStart === null ||
    sourceSpan.pageEnd !== sourceSpan.pageStart
  ) {
    return {
      deterministicCropProposalKey: null,
      matureKernelReason:
        visual.kind === "missing" || visual.kind === "decorative"
          ? null
          : "invalid_source_region",
      valid: visual.kind === "missing" || visual.kind === "decorative",
    } as const;
  }

  const placeholder: AIPdfAssetPlaceholder = {
    ambiguity: visual.kind === "ambiguous" ? "provider_flagged" : undefined,
    bbox: sourceSpan.bbox,
    confidence: visual.confidence,
    page: sourceSpan.pageStart,
    placeholder: `{{asset:${safePlaceholderToken(visual)}}}`,
    required: visual.required,
    shared_group_key:
      visual.kind === "shared" ? safePlaceholderToken(visual) : undefined,
    visual_role: legacyVisualRole(visual),
  };
  const matureValidation = validateAIPdfVisualProposal({
    availablePageNumbers,
    pageCount,
    placeholder,
    questionPageRefs,
  });

  return {
    deterministicCropProposalKey: matureValidation.valid
      ? visualProposalKey(placeholder)
      : null,
    matureKernelReason: matureValidation.reason,
    valid: matureValidation.valid,
  } as const;
}

export function derivePrivateQuestionAssetIdentityV2Fake({
  cropBytes,
  questionId,
  sourceAssetId,
}: {
  cropBytes: Uint8Array;
  questionId: string;
  sourceAssetId: string;
}) {
  const contentHash = contentSha256(Buffer.from(cropBytes));
  return {
    assetId: deterministicQuestionAssetId({
      contentHash,
      questionId,
      sourceAssetId,
    }),
    contentHash,
  } as const;
}
