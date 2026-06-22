import { redirect } from "next/navigation";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { PracticeAgentClient } from "@/components/practice/practice-agent-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/practice");
  }

  return <PracticeAgentClient />;
}
