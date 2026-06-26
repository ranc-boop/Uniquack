import "server-only";

import { inferAiProviderMode } from "@/lib/ai-providers/adapters";
import type { SafeAIProviderProfile } from "@/lib/ai-providers/profiles";

export type QuestionBlueprintModelQualityMode = "fast" | "quality";

export type QuestionBlueprintModelSelection = {
  actualMode: QuestionBlueprintModelQualityMode;
  fallbackReason: string | null;
  profile: SafeAIProviderProfile | null;
  requestedMode: QuestionBlueprintModelQualityMode;
};

const QUALITY_MODEL_SIGNALS = [
  "quality",
  "pro",
  "reasoner",
  "reasoning",
  "thinking",
  "r1",
] as const;

const FAST_MODEL_SIGNALS = ["fast", "flash", "lite", "turbo"] as const;

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function profileSearchText(profile: Pick<SafeAIProviderProfile, "model" | "name">) {
  return `${normalizedText(profile.name)} ${normalizedText(profile.model)}`;
}

function hasAnySignal(value: string, signals: readonly string[]) {
  return signals.some((signal) => value.includes(signal));
}

function deepseekProfiles(profiles: SafeAIProviderProfile[]) {
  return profiles.filter((profile) => inferAiProviderMode(profile) === "deepseek_openai");
}

export function normalizeQuestionBlueprintModelQualityMode(
  value: unknown,
): QuestionBlueprintModelQualityMode {
  return value === "quality" ? "quality" : "fast";
}

export function selectQuestionBlueprintDeepSeekProfile({
  profiles,
  requestedMode,
}: {
  profiles: SafeAIProviderProfile[];
  requestedMode: QuestionBlueprintModelQualityMode;
}): QuestionBlueprintModelSelection {
  const candidates = deepseekProfiles(profiles);

  if (!candidates.length) {
    return {
      actualMode: "fast",
      fallbackReason: "DeepSeek provider is not configured or not enabled.",
      profile: null,
      requestedMode,
    };
  }

  const qualityProfile = candidates.find((profile) =>
    hasAnySignal(profileSearchText(profile), QUALITY_MODEL_SIGNALS),
  );
  const fastProfile =
    candidates.find((profile) =>
      hasAnySignal(profileSearchText(profile), FAST_MODEL_SIGNALS),
    ) ?? candidates[0];

  if (requestedMode === "quality") {
    return {
      actualMode: qualityProfile ? "quality" : "fast",
      fallbackReason: qualityProfile
        ? null
        : "Quality model is not configured. Falling back to Fast.",
      profile: qualityProfile ?? fastProfile,
      requestedMode,
    };
  }

  return {
    actualMode: "fast",
    fallbackReason: null,
    profile: fastProfile,
    requestedMode,
  };
}
