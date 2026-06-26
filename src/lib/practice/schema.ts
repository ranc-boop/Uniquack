export const CURRENT_PRACTICE_SESSION_SCHEMA_VERSION = "practice-session-v2";

export const CURRENT_PRACTICE_QUESTION_SNAPSHOT_SCHEMA_VERSION =
  "practice-question-snapshot-v2";

export const PRACTICE_SESSION_EXPIRED_MESSAGE =
  "This practice session uses an old format and cannot be resumed. Start a new practice session.";

export const CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY =
  "o2i:practice:v2:pendingRound";

export const LEGACY_PRACTICE_STORAGE_KEYS = [
  "o2i:pendingPracticeRound",
];

export function isCurrentPracticeSessionSchemaVersion(value: unknown) {
  return value === CURRENT_PRACTICE_SESSION_SCHEMA_VERSION;
}

export function isCurrentPracticeQuestionSnapshot(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { practiceSchemaVersion?: unknown }).practiceSchemaVersion ===
        CURRENT_PRACTICE_QUESTION_SNAPSHOT_SCHEMA_VERSION,
  );
}
