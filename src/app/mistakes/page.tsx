import { redirect } from "next/navigation";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { MistakesPageClient } from "@/components/practice/mistakes-page-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/mistakes");
  }

  return <MistakesPageClient />;
}
