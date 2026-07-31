import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { BankBadge } from "@/app/teacher/banks/bank-ui";
import { FocusWorkspaceShell } from "@/components/teacher/focus-workspace-shell";
import { TeacherQuestionPreview } from "@/components/teacher/teacher-question-preview";
import { requireTeacher } from "@/lib/auth/guards";
import { getTeacherQuestionPreviewDTO } from "@/lib/teacher-focus-preview";
import {
  isDatabaseUuid,
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Question preview · EduStruct",
};

export default async function TeacherQuestionPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string; bankQuestionId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  noStore();
  const [profile, routeParams, query, supabase] = await Promise.all([
    requireTeacher(),
    params,
    searchParams,
    createClient(),
  ]);
  const { bankId, bankQuestionId } = routeParams;

  if (!isDatabaseUuid(bankId) || !isDatabaseUuid(bankQuestionId)) {
    notFound();
  }

  const preview = await getTeacherQuestionPreviewDTO({
    bankId,
    bankQuestionId,
    profileId: profile.id,
    supabase,
  });

  if (!preview) {
    notFound();
  }

  const returnHref = sanitizeTeacherBankReturnTo({
    bankId,
    rawReturnTo: query.returnTo,
    surface: "questions",
  });

  return (
    <FocusWorkspaceShell
      badges={
        <>
          <BankBadge tone="sky">{preview.bank.name}</BankBadge>
          <BankBadge tone="slate">{preview.question.code}</BankBadge>
        </>
      }
      description="Check the exact teacher-visible prompt, answer, explanation, taxonomy, and permitted media without changing the Library question."
      eyebrow="Library question · Focused preview"
      returnHref={returnHref}
      title={preview.question.title}
    >
      <TeacherQuestionPreview preview={preview} />
    </FocusWorkspaceShell>
  );
}
