import { createClient } from "@/lib/supabase/server";
import {
  extractIpFromHeaders,
  hashIp,
  resolveCountry,
} from "@/lib/page-visits/geo-resolver";
import { PAGE_VISIT_REQUEST_PATH_PATHS_TO_SKIP } from "@/lib/page-visits/constants";

export type PageVisitRecord = {
  ip_hash: string;
  country_code: string | null;
  country_name: string | null;
  pathname: string;
  user_agent: string | null;
  user_id: string | null;
};

export function shouldTrackPath(pathname: string): boolean {
  if (!pathname) return false;
  for (const pattern of PAGE_VISIT_REQUEST_PATH_PATHS_TO_SKIP) {
    if (pattern.test(pathname)) return false;
  }
  return true;
}

export async function buildRecord({
  pathname,
  headers,
  userId,
  userAgent,
}: {
  pathname: string;
  headers: Headers;
  userId?: string | null;
  userAgent?: string | null;
}): Promise<PageVisitRecord> {
  const ip = extractIpFromHeaders(headers);
  const geo = await resolveCountry(ip, headers);

  return {
    ip_hash: hashIp(ip || ""),
    country_code: geo.country_code,
    country_name: geo.country_name,
    pathname,
    user_agent: userAgent ?? headers.get("user-agent"),
    user_id: userId ?? null,
  };
}

export async function savePageVisit(record: PageVisitRecord): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("page_visits").insert({
    ip_hash: record.ip_hash,
    country_code: record.country_code,
    country_name: record.country_name,
    pathname: record.pathname,
    user_agent: record.user_agent,
    user_id: record.user_id || null,
  });

  if (error) {
    console.error("[page-visits] insert failed:", error.message);
  }
}
