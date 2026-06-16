import {
  extractPdfPageTexts,
  type PdfPageText,
} from "./pdf";
import { mergeAIPdfImportChunkingSummary } from "./chunking";
import {
  analyzePdfPageTexts,
  sha256Hex,
  type AIPreanalysisResult,
} from "./preanalysis-core";

export {
  analyzePdfPageTexts,
  failedPdfPreanalysis,
  generateImagePreanalysis,
  generateImagePreanalysisFromMetadata,
  type AIImagePreanalysisResult,
  type AIImageQualityHint,
  type AIPdfPreanalysisPage,
  type AIPdfPreanalysisResult,
  type AIPreanalysisAssetHint,
  type AIPreanalysisBoundaryRisk,
  type AIPreanalysisBoundaryRiskType,
  type AIPreanalysisPageClass,
  type AIPreanalysisResult,
  type AIPreanalysisResultBase,
  type AIPreanalysisSourceKind,
  type AIPreanalysisStatus,
} from "./preanalysis-core";

export async function generatePdfPreanalysis({
  generatedAt = new Date().toISOString(),
  pageCount,
  pdfBuffer,
}: {
  generatedAt?: string;
  pageCount?: number;
  pdfBuffer: Buffer;
}) {
  const pageTexts = await extractPdfPageTexts(pdfBuffer);
  const resolvedPageCount = pageCount ?? pageTexts.length;

  return analyzePdfPageTexts({
    generatedAt,
    pageCount: resolvedPageCount,
    pages: pageTexts.map((page: PdfPageText) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      textLayerAvailable: page.textLayerAvailable,
    })),
    sourceHash: sha256Hex(pdfBuffer),
  });
}

export function mergeAIPreanalysisIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  preanalysis: AIPreanalysisResult,
) {
  return mergeAIPdfImportChunkingSummary(existingAiPdfImport, {
    preanalysis,
  });
}
