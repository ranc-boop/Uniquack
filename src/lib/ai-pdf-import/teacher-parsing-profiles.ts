import "server-only";

import { describeAiPdfProviderInput } from "@/lib/ai-providers/adapters";
import {
  listEnabledAIProviderProfilesForServerUse,
  type SafeAIProviderProfile,
} from "@/lib/ai-providers/profiles";

type SupabaseLike = {
  from: (table: string) => any;
};

export const TEACHER_AI_PDF_PARSING_PROFILES = [
  "fast",
  "standard",
  "advanced",
] as const;

export type TeacherAIPdfParsingProfile =
  (typeof TEACHER_AI_PDF_PARSING_PROFILES)[number];

type TeacherAIPdfParsingProfileOption = {
  description: string;
  label: string;
  value: TeacherAIPdfParsingProfile;
};

export type TeacherAIPdfParsingProfileState = {
  available: boolean;
  defaultProfile: TeacherAIPdfParsingProfile;
  enabledBackendCount: number;
  options: TeacherAIPdfParsingProfileOption[];
};

const FRIENDLY_PROFILE_COPY: Record<
  TeacherAIPdfParsingProfile,
  TeacherAIPdfParsingProfileOption
> = {
  advanced: {
    description: "Limited option for complex PDFs when a separate safe route is enabled.",
    label: "Advanced / Limited",
    value: "advanced",
  },
  fast: {
    description: "Quicker draft extraction when a separate safe route is enabled.",
    label: "Fast",
    value: "fast",
  },
  standard: {
    description: "Recommended draft extraction for normal source PDFs.",
    label: "Standard / Recommended",
    value: "standard",
  },
};

const strategyPriority = new Map([
  ["gemini_native_pdf", 0],
  ["mock", 1],
  ["openai_file", 2],
  ["page_images", 3],
]);

function usableAIPdfProfiles(profiles: SafeAIProviderProfile[]) {
  return profiles
    .map((profile) => ({
      input: describeAiPdfProviderInput(profile),
      profile,
    }))
    .filter(
      ({ input }) =>
        input.supported &&
        input.implemented &&
        strategyPriority.has(input.strategy),
    )
    .sort((left, right) => {
      if (left.profile.is_default !== right.profile.is_default) {
        return left.profile.is_default ? -1 : 1;
      }

      return (
        (strategyPriority.get(left.input.strategy) ?? 99) -
        (strategyPriority.get(right.input.strategy) ?? 99)
      );
    });
}

function unavailableTeacherAIPdfParsingProfileState(): TeacherAIPdfParsingProfileState {
  return {
    available: false,
    defaultProfile: "standard",
    enabledBackendCount: 0,
    options: [],
  };
}

function buildTeacherAIPdfParsingProfileState(
  profiles: SafeAIProviderProfile[],
): TeacherAIPdfParsingProfileState {
  const usableProfiles = usableAIPdfProfiles(profiles);

  if (!usableProfiles.length) {
    return unavailableTeacherAIPdfParsingProfileState();
  }

  return {
    available: true,
    defaultProfile: "standard",
    enabledBackendCount: usableProfiles.length,
    options: [FRIENDLY_PROFILE_COPY.standard],
  };
}

export async function listTeacherAIPdfParsingProfileState(
  supabase: SupabaseLike,
): Promise<TeacherAIPdfParsingProfileState> {
  try {
    return buildTeacherAIPdfParsingProfileState(
      await listEnabledAIProviderProfilesForServerUse(),
    );
  } catch {
    return unavailableTeacherAIPdfParsingProfileState();
  }
}

export async function resolveTeacherAIPdfProviderProfile({
  parsingProfile,
  supabase,
}: {
  parsingProfile: TeacherAIPdfParsingProfile;
  supabase: SupabaseLike;
}) {
  let enabledProfiles: SafeAIProviderProfile[];

  try {
    enabledProfiles = await listEnabledAIProviderProfilesForServerUse();
  } catch {
    throw new Error(
      "AI PDF parsing is not available. Ask an admin to check AI Settings.",
    );
  }

  const usableProfiles = usableAIPdfProfiles(enabledProfiles);
  const state = buildTeacherAIPdfParsingProfileState(enabledProfiles);

  if (!usableProfiles.length) {
    throw new Error(
      "AI PDF parsing is not enabled for this site or organization yet.",
    );
  }

  if (!state.options.some((option) => option.value === parsingProfile)) {
    throw new Error(
      "That AI PDF parsing profile is not available for this workspace.",
    );
  }

  return usableProfiles[0]!.profile;
}
