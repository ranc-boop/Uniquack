/**
 * Centralized Storage URL helper for question assets.
 *
 * Callers must not call the Storage client's public-URL accessor directly.
 * // guardrail-allow:question-assets-public-url (documentation only — this line is
 * // the one place we intentionally name the forbidden pattern, to explain why it's
 * // forbidden; see scripts/check-question-assets-public-url.mjs)
 * This returns a stable, internal route path; the actual signed URL is generated
 * per-request by `/api/question-assets/[assetId]`, which authorizes the canonical
 * asset ID before it loads server-only metadata and redirects to a short-lived
 * signed URL. This keeps asset access aligned with Question authorization instead
 * of relying on a permanently public Storage URL.
 */
export function getQuestionAssetUrl(assetId: string): string {
  return `/api/question-assets/${assetId}`;
}
