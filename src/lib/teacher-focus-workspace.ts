const FOCUS_ORIGIN = "https://focus.edustruct.invalid";

export const FOCUS_PROTOCOL_SCHEMA_VERSION = 1 as const;
export const FOCUS_LAUNCH_ID_MIN_LENGTH = 32;
export const FOCUS_LAUNCH_ID_MAX_LENGTH = 64;

export type FocusTaskKind =
  | "question-manage"
  | "question-preview"
  | "public-submission-preview"
  | "review-batch"
  | "review-preview"
  | "student-preview";

export type FocusChannelEvent =
  | "completion"
  | "completion-ack"
  | "parent-ack"
  | "ready";

export type FocusStatusCounts = {
  blocked?: number;
  processed?: number;
  total?: number;
  unchanged?: number;
};

export type FocusChannelMessage = {
  connectionNonce?: string;
  event: FocusChannelEvent;
  launchId: string;
  operationReceiptId?: string;
  schemaVersion: typeof FOCUS_PROTOCOL_SCHEMA_VERSION;
  status?: string;
  statusCounts?: FocusStatusCounts;
  taskKind: FocusTaskKind;
};

type FocusReturnSurface = "questions" | "review";

const focusTaskKinds = new Set<FocusTaskKind>([
  "question-manage",
  "question-preview",
  "public-submission-preview",
  "review-batch",
  "review-preview",
  "student-preview",
]);

const focusChannelEvents = new Set<FocusChannelEvent>([
  "completion",
  "completion-ack",
  "parent-ack",
  "ready",
]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeToken(
  value: unknown,
  minLength = 16,
  maxLength = FOCUS_LAUNCH_ID_MAX_LENGTH,
) {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function isValidFocusLaunchId(value: unknown): value is string {
  return isSafeToken(value, FOCUS_LAUNCH_ID_MIN_LENGTH);
}

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

export function focusChannelName(launchId: string) {
  return `edustruct:focus:v${FOCUS_PROTOCOL_SCHEMA_VERSION}:${launchId}`;
}

export function isFocusChannelMessage(
  value: unknown,
): value is FocusChannelMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.schemaVersion !== FOCUS_PROTOCOL_SCHEMA_VERSION ||
    !isValidFocusLaunchId(value.launchId) ||
    typeof value.taskKind !== "string" ||
    !focusTaskKinds.has(value.taskKind as FocusTaskKind) ||
    typeof value.event !== "string" ||
    !focusChannelEvents.has(value.event as FocusChannelEvent)
  ) {
    return false;
  }

  if (
    value.connectionNonce !== undefined &&
    !isSafeToken(value.connectionNonce)
  ) {
    return false;
  }

  if (
    value.operationReceiptId !== undefined &&
    !isSafeToken(value.operationReceiptId, 8, 128)
  ) {
    return false;
  }

  if (value.status !== undefined && typeof value.status !== "string") {
    return false;
  }

  if (value.statusCounts !== undefined) {
    if (!isRecord(value.statusCounts)) {
      return false;
    }

    for (const count of Object.values(value.statusCounts)) {
      if (
        count !== undefined &&
        (!Number.isSafeInteger(count) || Number(count) < 0)
      ) {
        return false;
      }
    }
  }

  return true;
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

export function buildFocusHref({
  href,
  launchId,
  returnTo,
}: {
  href: string;
  launchId?: string | null;
  returnTo: string;
}) {
  const parsed = new URL(href, FOCUS_ORIGIN);

  if (parsed.origin !== FOCUS_ORIGIN || !parsed.pathname.startsWith("/teacher/")) {
    throw new Error("Focus href must be a relative Teacher route.");
  }

  parsed.searchParams.delete("q");
  parsed.searchParams.set("presentation", "focus");
  parsed.searchParams.set("returnTo", returnTo);

  if (isValidFocusLaunchId(launchId)) {
    parsed.searchParams.set("launchId", launchId);
  } else {
    parsed.searchParams.delete("launchId");
  }

  return `${parsed.pathname}${parsed.search}`;
}
