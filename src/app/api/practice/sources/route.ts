import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import type { PracticeSourceOption } from "@/lib/practice/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) return auth.response;

  const { data, error } = await supabase.rpc("list_selectable_practice_sources");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sources: PracticeSourceOption[] = ((data ?? []) as Record<string, unknown>[]).map(
    (row) => {
      const sourceKind =
        row.source_kind === "question_bank" ? "question_bank" : "public_catalog";
      const role = String(row.membership_role ?? "");
      const visibility = String(row.visibility ?? "");
      const sourceId = row.source_id ? String(row.source_id) : null;

      return {
        bankId: sourceKind === "question_bank" ? sourceId : null,
        counts: {
          mastered: count(row.mastered_count),
          needsRetry: count(row.needs_retry_count),
          questionCount: count(row.question_count),
          ungraded: count(row.ungraded_count),
          unseen: count(row.unseen_count),
        },
        id: sourceKind === "public_catalog" ? "public_catalog" : String(sourceId),
        membershipRole:
          role === "owner" || role === "editor" || role === "viewer" ? role : null,
        name: String(row.name ?? "Library"),
        sourceKind,
        visibility:
          visibility === "private" ||
          visibility === "shared" ||
          visibility === "organization" ||
          visibility === "public"
            ? visibility
            : null,
      };
    },
  );

  return NextResponse.json({ sources });
}
