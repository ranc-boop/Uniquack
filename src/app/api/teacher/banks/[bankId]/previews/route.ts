import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/guards";
import { canAccessTeacher } from "@/lib/auth/roles";
import {
  getReviewPreviewDTOs,
  getTeacherQuestionPreviewDTOs,
} from "@/lib/teacher-focus-preview";
import { isDatabaseUuid } from "@/lib/teacher-focus-workspace";
import type {
  TeacherPreviewKind,
  TeacherPreviewResponse,
} from "@/lib/teacher-question-preview-types";
import { resolveTrustedPostOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

const PREVIEW_KINDS = new Set<TeacherPreviewKind>([
  "assignment-selection",
  "question",
  "review",
]);

function jsonResponse(
  body: TeacherPreviewResponse | { error: string },
  status = 200,
) {
  return NextResponse.json(body, {
    headers: PRIVATE_HEADERS,
    status,
  });
}

function trustedRequestOrigin(request: Request) {
  return resolveTrustedPostOrigin({
    configuredSiteUrl:
      process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null,
    environment: process.env.NODE_ENV,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    requestUrl: request.url,
    secFetchSite: request.headers.get("sec-fetch-site"),
    trustProxyHeaders: process.env.TRUST_PROXY_HEADERS === "1",
    xForwardedHost: request.headers.get("x-forwarded-host"),
    xForwardedProto: request.headers.get("x-forwarded-proto"),
  });
}

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind =
    typeof record.kind === "string" && PREVIEW_KINDS.has(record.kind as TeacherPreviewKind)
      ? (record.kind as TeacherPreviewKind)
      : null;
  const ids = Array.isArray(record.ids) ? record.ids : null;

  if (
    !kind ||
    !ids ||
    ids.length < 1 ||
    ids.length > 5 ||
    ids.some((id) => typeof id !== "string" || !isDatabaseUuid(id))
  ) {
    return null;
  }

  const uniqueIds = Array.from(new Set(ids as string[]));
  if (uniqueIds.length !== ids.length) {
    return null;
  }

  return { ids: uniqueIds, kind };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ bankId: string }> },
) {
  if (!trustedRequestOrigin(request)) {
    return jsonResponse({ error: "Request not allowed." }, 403);
  }

  const { bankId } = await context.params;
  if (!isDatabaseUuid(bankId)) {
    return jsonResponse({ error: "Invalid preview request." }, 400);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 8_192) {
    return jsonResponse({ error: "Invalid preview request." }, 400);
  }

  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody(await request.json());
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return jsonResponse({ error: "Invalid preview request." }, 400);
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }
  if (!canAccessTeacher(profile.role)) {
    return jsonResponse({ error: "Request not allowed." }, 403);
  }

  try {
    const supabase = await createClient();
    const previews =
      parsed.kind === "review"
        ? await getReviewPreviewDTOs({
            bankId,
            profileId: profile.id,
            reviewItemIds: parsed.ids,
            supabase,
          })
        : await getTeacherQuestionPreviewDTOs({
            bankId,
            bankQuestionIds: parsed.ids,
            profileId: profile.id,
            supabase,
          });

    if (!previews) {
      // Missing and inaccessible items deliberately share one response.
      return jsonResponse({ error: "Preview not found." }, 404);
    }

    return jsonResponse({ previews });
  } catch {
    return jsonResponse({ error: "Could not load the preview." }, 500);
  }
}
