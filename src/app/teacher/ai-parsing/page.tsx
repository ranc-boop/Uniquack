import { redirect } from "next/navigation";

import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TeacherAiParsingCompatibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ bankId?: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await searchParams;

  if (bankId && uuidPattern.test(bankId)) {
    const supabase = await createClient();
    const detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });

    if (
      detail?.bank.status === "active" &&
      canManageBankContent(detail.currentUserRole)
    ) {
      redirect(`/teacher/banks/${bankId}/imports?mode=ai`);
    }
  }

  redirect("/teacher/banks?intent=import");
}
