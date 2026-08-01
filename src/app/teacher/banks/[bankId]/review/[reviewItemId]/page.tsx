import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { BankBadge } from "@/app/teacher/banks/bank-ui";
import { FocusWorkspaceShell } from "@/components/teacher/focus-workspace-shell";
import { TeacherQuestionPreview } from "@/components/teacher/teacher-question-preview";
import { requireTeacher } from "@/lib/auth/guards";
import { getReviewPreviewDTO } from "@/lib/teacher-focus-preview";
import {
  isDatabaseUuid,
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Review Draft preview · EduStruct",
};

export default async function TeacherReviewPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string; reviewItemId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  noStore();
  const [profile, routeParams, query, supabase] = await Promise.all([
    requireTeacher(),
    params,
    searchParams,
    createClient(),
  ]);
  const { bankId, reviewItemId } = routeParams;

  if (!isDatabaseUuid(bankId) || !isDatabaseUuid(reviewItemId)) {
    notFound();
  }

  const preview = await getReviewPreviewDTO({
    bankId,
    profileId: profile.id,
    reviewItemId,
    supabase,
  });

  if (!preview) {
    notFound();
  }

  const returnHref = sanitizeTeacherBankReturnTo({
    bankId,
    rawReturnTo: query.returnTo,
    surface: "review",
  });

  return (
    <FocusWorkspaceShell
      badges={
        <>
          <BankBadge tone="sky">{preview.bank.name}</BankBadge>
          <BankBadge tone="amber">{preview.review.status}</BankBadge>
          <BankBadge tone="slate">{preview.question.code}</BankBadge>
        </>
      }
      description="Inspect the draft content and stored validation warnings. This preview cannot approve, reject, or edit the Review Draft."
      eyebrow="Review Draft · Focused preview"
      returnHref={returnHref}
      returnSurfaceLabel="Review list"
      title={preview.question.title}
    >
      <TeacherQuestionPreview preview={preview} />
    </FocusWorkspaceShell>
  );
}
