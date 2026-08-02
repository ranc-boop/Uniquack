import { redirect } from "next/navigation";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { PracticeAgentLoader } from "@/components/practice/practice-agent-loader";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PracticePageProps = {
  searchParams: Promise<{ assignmentId?: string; returnTo?: string }>;
};

function safeStudentReturnTarget(value: string | undefined) {
  if (!value || !/^\/student(?:\/|\?|#|$)/.test(value)) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export default async function PracticePage({ searchParams }: PracticePageProps) {
  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const query = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (typeof userId !== "string" || !userId) {
    const practiceQuery = new URLSearchParams();
    if (query.assignmentId) practiceQuery.set("assignmentId", query.assignmentId);
    const returnTo = safeStudentReturnTarget(query.returnTo);
    if (returnTo) practiceQuery.set("returnTo", returnTo);
    const next = practiceQuery.size ? `/practice?${practiceQuery}` : "/practice";
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const exitHref =
    safeStudentReturnTarget(query.returnTo) ??
    (query.assignmentId ? `/student/work/${query.assignmentId}` : "/student");

  return (
    <PracticeAgentLoader
      assignmentId={query.assignmentId ?? null}
      exitHref={exitHref}
    />
  );
}
