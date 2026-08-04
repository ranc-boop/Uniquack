import "server-only";

import aiPdfExtractionSchema from "./gemini-ai-pdf-extraction.schema.json";

export type GeminiStructuredOutputTransport =
  | "response_format"
  | "response_json_schema";

export type GeminiOutputContract =
  | { mode: "text" }
  | { mode: "json" }
  | {
      mode: "json_schema";
      schema: Record<string, unknown>;
      transport: GeminiStructuredOutputTransport;
    };

export const GEMINI_AI_PDF_EXTRACTION_SCHEMA =
  aiPdfExtractionSchema as Record<string, unknown>;

export const GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT = {
  mode: "json_schema",
  schema: GEMINI_AI_PDF_EXTRACTION_SCHEMA,
  transport: "response_json_schema",
} as const satisfies GeminiOutputContract;

export function buildGeminiGenerationConfig({
  maxOutputTokens,
  outputContract = { mode: "json" },
}: {
  maxOutputTokens?: number;
  outputContract?: GeminiOutputContract;
}) {
  const base = {
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    temperature: 0.1,
  };

  if (outputContract.mode === "text") {
    return base;
  }

  if (outputContract.mode === "json") {
    return {
      ...base,
      responseMimeType: "application/json",
    };
  }

  if (outputContract.transport === "response_format") {
    return {
      ...base,
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: outputContract.schema,
        },
      },
    };
  }

  return {
    ...base,
    responseJsonSchema: outputContract.schema,
    responseMimeType: "application/json",
  };
}
