import { type NextRequest, NextResponse } from "next/server";

import { updateSessionAndProtectRoutes } from "@/lib/supabase/middleware";

const TRACK_ENDPOINT = "/api/page-visits/track";
const SKIP_PREFIXES = [
  "/_next/",
  "/api/",
  "/favicon.ico",
];
const SKIP_EXTENSIONS = new Set([
  "svg", "png", "jpg", "jpeg", "gif", "webp",
  "ico", "css", "js", "woff", "woff2", "ttf", "eot",
]);

function shouldTrack(pathname: string): boolean {
  for (const prefix of SKIP_PREFIXES) {
    if (pathname.startsWith(prefix)) return false;
  }
  const ext = pathname.split(".").pop();
  if (ext && ext.length <= 4 && SKIP_EXTENSIONS.has(ext.toLowerCase())) {
    return false;
  }
  return true;
}

export async function middleware(request: NextRequest) {
  const response = await updateSessionAndProtectRoutes(request);

  const pathname = request.nextUrl.pathname;
  if (shouldTrack(pathname)) {
    const trackUrl = new URL(TRACK_ENDPOINT, request.url);
    try {
      void fetch(trackUrl.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathname,
          user_agent: request.headers.get("user-agent"),
        }),
        cache: "no-store",
        // Forward headers needed for IP / geo resolution.
        ...(0,
          {
            duplex: "half",
            signal: (() => {
              const c = new AbortController();
              setTimeout(() => c.abort(), 2500);
              return c.signal;
            })(),
          }),
      });
    } catch {
      // Silent; tracking failures must not break the page.
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
