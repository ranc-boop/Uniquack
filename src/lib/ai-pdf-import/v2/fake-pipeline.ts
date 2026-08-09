import type {
  DocumentExtractionProposalV2,
  ValidationContextV2,
} from "./contracts";
import {
  evaluateDocumentExtractionV2,
  type EvaluationGoldV2,
} from "./evaluator";
import { projectDocumentExtractionV2ToV1ReviewDrafts } from "./projection";
import { canonicalizeDocumentExtractionV2 } from "./validation";

export function runFakeAiParsingV2({
  context,
  gold,
  proposal,
}: {
  context: ValidationContextV2;
  gold?: EvaluationGoldV2;
  proposal: DocumentExtractionProposalV2;
}) {
  const canonicalization = canonicalizeDocumentExtractionV2({
    context,
    proposal,
  });
  const extraction = canonicalization.extraction;
  const reviewDrafts = extraction
    ? projectDocumentExtractionV2ToV1ReviewDrafts({
        extraction,
        ownerBankId: context.source.bankScopeKey,
      })
    : [];
  const evaluation = extraction && gold
    ? evaluateDocumentExtractionV2({ extraction, gold })
    : null;

  return {
    canonicalization,
    evaluation,
    providerCalls: 0 as const,
    reviewDrafts,
    writes: 0 as const,
  };
}
