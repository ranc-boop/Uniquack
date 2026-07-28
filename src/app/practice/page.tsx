import { redirect } from "next/navigation";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { PracticeAgentLoader } from "@/components/practice/practice-agent-loader";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PracticePageProps = {
  searchParams: Promise<{ assignmentId?: string }>;
};

export default async function PracticePage({ searchParams }: PracticePageProps) {
  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const query = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (typeof userId !== "string" || !userId) {
    const next = query.assignmentId
      ? `/practice?assignmentId=${encodeURIComponent(query.assignmentId)}`
      : "/practice";
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  return <PracticeAgentLoader assignmentId={query.assignmentId ?? null} />;
}
