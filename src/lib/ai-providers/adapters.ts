export type AiProviderMode =
  | "openai_compatible"
  | "deepseek_openai"
  | "gemini_openai"
  | "gemini_native"
  | "mock";

export type AiProviderCapabilities = {
  supportsText: boolean;
  supportsPageImages: boolean;
  supportsNativePdf: boolean;
  supportsJsonMode: boolean;
  supportsReasoning: boolean;
};

export type AiPdfInputStrategy =
  | "openai_file"
  | "page_images"
  | "gemini_native_pdf"
  | "mock"
  | "unsupported";

export type AiProviderRoutingProfile = {
  base_url: string;
  model: string;
  provider: string;
  supports_pdf_input?: boolean;
  supports_vision_images?: boolean;
};

export type AiProviderModeOption = {
  baseUrlPlaceholder: string;
  label: string;
  modelPlaceholder: string;
  mode: AiProviderMode;
  summaryLabel: string;
  supportsPdfInput: boolean;
  supportsVisionImages: boolean;
};

export const AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE =
  "This provider does not support PDF/image extraction. Use a page-image or native-PDF capable provider.";

export const AI_PROVIDER_MODE_OPTIONS: AiProviderModeOption[] = [
  {
    baseUrlPlaceholder: "https://api.deepseek.com",
    label: "DeepSeek - Text/JSON only",
    modelPlaceholder: "deepseek-v4-flash",
    mode: "deepseek_openai",
    summaryLabel: "DeepSeek text/json",
    supportsPdfInput: false,
    supportsVisionImages: false,
  },
  {
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com",
    label: "Gemini Native - Full PDF input",
    modelPlaceholder: "gemini-2.5-flash-lite",
    mode: "gemini_native",
    summaryLabel: "Gemini Native full PDF",
    supportsPdfInput: true,
    supportsVisionImages: false,
  },
  {
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com/v1beta/openai/",
    label: "Gemini OpenAI-compatible - Page images only",
    modelPlaceholder: "gemini-2.5-flash-lite",
    mode: "gemini_openai",
    summaryLabel: "Gemini OpenAI-compatible page images",
    supportsPdfInput: false,
    supportsVisionImages: true,
  },
  {
    baseUrlPlaceholder: "https://api.openai.com/v1",
    label: "Generic OpenAI-compatible",
    modelPlaceholder: "gpt-4.1-mini",
    mode: "openai_compatible",
    summaryLabel: "Generic OpenAI-compatible",
    supportsPdfInput: false,
    supportsVisionImages: false,
  },
  {
    baseUrlPlaceholder: "mock://ai-pdf-import",
    label: "Mock provider - Testing only",
    modelPlaceholder: "mock-ai-pdf-import",
    mode: "mock",
    summaryLabel: "Mock provider",
    supportsPdfInput: true,
    supportsVisionImages: true,
  },
];

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function aiProviderModeOption(mode: AiProviderMode) {
  return (
    AI_PROVIDER_MODE_OPTIONS.find((option) => option.mode === mode) ??
    AI_PROVIDER_MODE_OPTIONS.find((option) => option.mode === "openai_compatible")!
  );
}

export function aiProviderModeLabel(mode: AiProviderMode) {
  return aiProviderModeOption(mode).label;
}

export function aiProviderModeSummaryLabel(mode: AiProviderMode) {
  return aiProviderModeOption(mode).summaryLabel;
}

export function aiPdfInputStrategyLabel(strategy: AiPdfInputStrategy) {
  if (strategy === "gemini_native_pdf" || strategy === "openai_file") {
    return "supported";
  }

  if (strategy === "page_images") {
    return "page images only";
  }

  if (strategy === "mock") {
    return "mock";
  }

  return "unsupported";
}

export function inferAiProviderMode(
  profile: Pick<AiProviderRoutingProfile, "base_url" | "provider">,
): AiProviderMode {
  const provider = normalize(profile.provider).replace(/[\s-]+/g, "_");
  const baseUrl = normalize(profile.base_url);

  if (provider === "mock" || baseUrl.startsWith("mock://ai-pdf-import")) {
    return "mock";
  }

  if (provider.includes("deepseek") || baseUrl.includes("api.deepseek.com")) {
    return "deepseek_openai";
  }

  if (
    provider.includes("gemini_native") ||
    provider.includes("google_native")
  ) {
    return "gemini_native";
  }

  if (
    provider.includes("gemini") ||
    provider.includes("google") ||
    baseUrl.includes("generativelanguage.googleapis.com")
  ) {
    return "gemini_openai";
  }

  return "openai_compatible";
}

function hasReasoningSignal(profile: Pick<AiProviderRoutingProfile, "model">) {
  const model = normalize(profile.model);

  return (
    model.includes("reasoner") ||
    model.includes("reasoning") ||
    model.includes("v4-pro")
  );
}

export function getAiProviderCapabilities(
  profile: AiProviderRoutingProfile,
): AiProviderCapabilities {
  const mode = inferAiProviderMode(profile);
  const supportsPageImages = Boolean(profile.supports_vision_images);
  const configuredNativePdf = Boolean(profile.supports_pdf_input);

  if (mode === "mock") {
    return {
      supportsJsonMode: true,
      supportsNativePdf: true,
      supportsPageImages: true,
      supportsReasoning: false,
      supportsText: true,
    };
  }

  if (mode === "deepseek_openai") {
    return {
      supportsJsonMode: true,
      supportsNativePdf: false,
      supportsPageImages,
      supportsReasoning: hasReasoningSignal(profile),
      supportsText: true,
    };
  }

  if (mode === "gemini_openai") {
    return {
      supportsJsonMode: true,
      supportsNativePdf: false,
      supportsPageImages,
      supportsReasoning: false,
      supportsText: true,
    };
  }

  if (mode === "gemini_native") {
    return {
      supportsJsonMode: true,
      supportsNativePdf: configuredNativePdf,
      supportsPageImages,
      supportsReasoning: false,
      supportsText: true,
    };
  }

  return {
    supportsJsonMode: true,
    supportsNativePdf: configuredNativePdf,
    supportsPageImages,
    supportsReasoning: hasReasoningSignal(profile),
    supportsText: true,
  };
}

export function selectAiPdfInputStrategy(
  profile: AiProviderRoutingProfile,
): AiPdfInputStrategy {
  const mode = inferAiProviderMode(profile);
  const capabilities = getAiProviderCapabilities(profile);

  if (mode === "mock") {
    return "mock";
  }

  if (mode === "gemini_openai") {
    return capabilities.supportsPageImages ? "page_images" : "unsupported";
  }

  if (mode === "gemini_native") {
    if (capabilities.supportsNativePdf) {
      return "gemini_native_pdf";
    }

    return capabilities.supportsPageImages ? "page_images" : "unsupported";
  }

  if (capabilities.supportsNativePdf) {
    return "openai_file";
  }

  if (capabilities.supportsPageImages) {
    return "page_images";
  }

  return "unsupported";
}

export function isAiPdfInputStrategyImplemented(strategy: AiPdfInputStrategy) {
  return (
    strategy === "mock" ||
    strategy === "openai_file" ||
    strategy === "page_images" ||
    strategy === "gemini_native_pdf"
  );
}

export function describeAiPdfProviderInput(profile: AiProviderRoutingProfile) {
  const mode = inferAiProviderMode(profile);
  const capabilities = getAiProviderCapabilities(profile);
  const strategy = selectAiPdfInputStrategy(profile);
  const implemented = isAiPdfInputStrategyImplemented(strategy);

  return {
    capabilities,
    implemented,
    mode,
    reason:
      strategy === "unsupported"
        ? AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE
        : null,
    strategy,
    supported: strategy !== "unsupported",
  };
}
