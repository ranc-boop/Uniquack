const FOCUS_ORIGIN = "https://focus.edustruct.invalid";

type FocusReturnSurface = "questions" | "review";
export type FocusTaskKind =
  | "question-preview"
  | "review-batch"
  | "review-preview"
  | "student-preview";

const allowedQuestionReadinessValues = new Set(["active", "archived"]);
const allowedQuestionSourceValues = new Set([
  "course_builder",
  "import",
  "manual",
  "public_pull",
  "review_draft",
]);
const allowedReviewStatusValues = new Set([
  "needs_more_evidence",
  "pending_review",
]);
const taxonomyTagIdPattern = /^math\.[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

export function isDatabaseUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function parseCurrentPageFocusSelection(
  value: string | string[] | undefined,
  maxItems = 25,
) {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  if (
    values.length === 0 ||
    values.length > maxItems ||
    new Set(values).size !== values.length ||
    !values.every(isDatabaseUuid)
  ) {
    return null;
  }

  return values;
}

export function isTeacherFocusPathname(pathname: string) {
  return (
    /^\/teacher\/banks\/[^/]+\/questions\/(?:manage|preview)$/.test(
      pathname,
    ) ||
    /^\/teacher\/banks\/[^/]+\/questions\/[^/]+\/preview$/.test(pathname) ||
    /^\/teacher\/banks\/[^/]+\/review\/(?:bulk|[^/]+)$/.test(pathname) ||
    /^\/teacher\/classrooms\/[^/]+\/assignments\/[^/]+\/student-preview$/.test(
      pathname,
    )
  );
}

function safeFallback(bankId: string, surface: FocusReturnSurface) {
  return `/teacher/banks/${encodeURIComponent(bankId)}/${surface}`;
}

function safePage(value: string | null) {
  return value && /^[1-9]\d{0,4}$/.test(value) ? value : null;
}

function safeSearchQuery(value: string | null) {
  const query = value?.trim();
  return query && query.length <= 120 && !/[\u0000-\u001f\u007f]/.test(query)
    ? query
    : null;
}

export function sanitizeTeacherBankReturnTo({
  bankId,
  rawReturnTo,
  surface,
}: {
  bankId: string;
  rawReturnTo?: string | null;
  surface: FocusReturnSurface;
}) {
  const fallback = safeFallback(bankId, surface);
  const raw = rawReturnTo?.trim();

  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    /%2f|%5c/i.test(raw)
  ) {
    return fallback;
  }

  let parsed: URL;

  try {
    parsed = new URL(raw, FOCUS_ORIGIN);
  } catch {
    return fallback;
  }

  const expectedPath = safeFallback(bankId, surface);

  if (parsed.origin !== FOCUS_ORIGIN || parsed.pathname !== expectedPath) {
    return fallback;
  }

  const sanitized = new URL(expectedPath, FOCUS_ORIGIN);
  const page = safePage(parsed.searchParams.get("page"));
  const query = safeSearchQuery(parsed.searchParams.get("q"));

  if (page) sanitized.searchParams.set("page", page);
  if (query) sanitized.searchParams.set("q", query);

  if (surface === "questions") {
    const readiness = parsed.searchParams.get("readiness");
    const source = parsed.searchParams.get("source");
    const taxonomy = parsed.searchParams.get("taxonomy");

    if (readiness && allowedQuestionReadinessValues.has(readiness)) {
      sanitized.searchParams.set("readiness", readiness);
    }
    if (source && allowedQuestionSourceValues.has(source)) {
      sanitized.searchParams.set("source", source);
    }
    if (taxonomy && taxonomyTagIdPattern.test(taxonomy)) {
      sanitized.searchParams.set("taxonomy", taxonomy);
    }
  } else {
    const status = parsed.searchParams.get("status");

    if (status && allowedReviewStatusValues.has(status)) {
      sanitized.searchParams.set("status", status);
    }
  }

  return `${sanitized.pathname}${sanitized.search}`;
}

export function sanitizeTeacherAssignmentReturnTo({
  assignmentId,
  classroomId,
  rawReturnTo,
}: {
  assignmentId: string;
  classroomId: string;
  rawReturnTo?: string | null;
}) {
  const fallback = `/teacher/classrooms/${encodeURIComponent(
    classroomId,
  )}/assignments/${encodeURIComponent(assignmentId)}`;
  const raw = rawReturnTo?.trim();

  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    /%2f|%5c/i.test(raw)
  ) {
    return fallback;
  }

  let parsed: URL;

  try {
    parsed = new URL(raw, FOCUS_ORIGIN);
  } catch {
    return fallback;
  }

  if (parsed.origin !== FOCUS_ORIGIN || parsed.pathname !== fallback) {
    return fallback;
  }

  return fallback;
}

export function buildFocusHref({
  href,
  returnTo,
}: {
  href: string;
  returnTo: string;
}) {
  const parsed = new URL(href, FOCUS_ORIGIN);

  if (parsed.origin !== FOCUS_ORIGIN || !parsed.pathname.startsWith("/teacher/")) {
    throw new Error("Focus href must be a relative Teacher route.");
  }

  parsed.searchParams.delete("q");
  parsed.searchParams.delete("launchId");
  parsed.searchParams.set("presentation", "focus");
  parsed.searchParams.set("returnTo", returnTo);

  return `${parsed.pathname}${parsed.search}`;
}
