import { NextResponse } from "next/server";

import {
  buildRecord,
  savePageVisit,
  shouldTrackPath,
} from "@/lib/page-visits/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let pathname: string | null = null;
    let userAgent: string | null = null;

    try {
      const body = await request.json();
      if (body && typeof body === "object") {
        if (typeof body.pathname === "string") pathname = body.pathname;
        if (typeof body.user_agent === "string") userAgent = body.user_agent;
      }
    } catch {
      // fall through to header-based pathname
    }

    if (!pathname) {
      try {
        const referer = request.headers.get("referer");
        if (referer) pathname = new URL(referer).pathname;
      } catch {
        // ignore
      }
    }

    if (!pathname || !shouldTrackPath(pathname)) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const record = await buildRecord({
      pathname,
      headers: request.headers,
      userAgent,
    });

    await savePageVisit(record);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[page-visits] track failed:", err);
    return NextResponse.json(
      { ok: false, error: "track_failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405 },
  );
}
