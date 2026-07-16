/**
 * Centralized Storage URL helper for question assets.
 *
 * Callers must not call `supabase.storage.from(QUESTION_ASSETS_BUCKET).getPublicUrl(...)`
 * directly. This returns a stable, internal route path; the actual signed URL is
 * generated per-request by `/api/question-assets/[assetId]`, which authorizes the
 * request via `private.can_read_question()` before redirecting to a short-lived
 * signed URL. This keeps asset access aligned with Question authorization instead of
 * relying on a permanently public Storage URL.
 */
export function getQuestionAssetUrl(assetId: string): string {
  return `/api/question-assets/${assetId}`;
}
