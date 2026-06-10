export const MOCK_AI_PDF_IMPORT_BASE_URL = "mock://ai-pdf-import";

export function isMockAIProviderUrl(value: string) {
  return value.trim() === MOCK_AI_PDF_IMPORT_BASE_URL;
}

export function isMockAIProviderAllowed() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_MOCK_AI_PROVIDER === "true"
  );
}

export function assertMockAIProviderAllowed() {
  if (!isMockAIProviderAllowed()) {
    throw new Error(
      "Mock AI provider is disabled in production unless ENABLE_MOCK_AI_PROVIDER=true is explicitly set.",
    );
  }
}
