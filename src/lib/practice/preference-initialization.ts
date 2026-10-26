export type PracticePreferenceCreateResult<T> = {
  data: T | null;
  error: unknown;
};

export type PracticePreferenceInitializationOutcome<T> = {
  data: T | null;
  error: unknown;
};

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}

function isPracticePreferenceUniqueConflict(error: unknown) {
  return errorCode(error) === "23505";
}

export async function initializePracticePreference<T>({
  create,
  read,
}: {
  create: () => Promise<PracticePreferenceCreateResult<T>>;
  read: () => Promise<T | null>;
}): Promise<PracticePreferenceInitializationOutcome<T>> {
  const existing = await read();
  if (existing) return { data: existing, error: null };

  const created = await create();
  if (!created.error && created.data) {
    return { data: created.data, error: null };
  }

  if (isPracticePreferenceUniqueConflict(created.error)) {
    const concurrentWinner = await read();
    if (concurrentWinner) {
      return { data: concurrentWinner, error: null };
    }
  }

  return {
    data: null,
    error: created.error ?? new Error("Practice preference creation returned no row."),
  };
}
