import type { AIPdfExtraction } from "@/lib/ai-pdf-import/schema";

export const AI_PDF_SINGLE_PAGE_LINEAGE_WARNING =
  "Server inferred page_refs because the supplied extraction source contains exactly one page.";

/**
 * A question extracted from a one-page source has one unambiguous page.
 * Multi-page omissions remain untouched so coverage review can fail closed.
 */
export function ensureSinglePageExtractionLineage({
  extraction,
  suppliedPageCount,
}: {
  extraction: AIPdfExtraction;
  suppliedPageCount: number;
}): AIPdfExtraction {
  if (suppliedPageCount !== 1) return extraction;

  let inferred = false;
  const questions = extraction.questions.map((question) => {
    if (question.page_refs.length) return question;
    inferred = true;
    return { ...question, page_refs: [1] };
  });

  if (!inferred) return extraction;

  return {
    ...extraction,
    questions,
    warnings: Array.from(
      new Set([...extraction.warnings, AI_PDF_SINGLE_PAGE_LINEAGE_WARNING]),
    ),
  };
}
