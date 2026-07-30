import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { BankBadge } from "@/app/teacher/banks/bank-ui";
import { FocusWorkspaceShell } from "@/components/teacher/focus-workspace-shell";
import { TeacherQuestionPreviewQueue } from "@/components/teacher/teacher-question-preview-queue";
import { requireTeacher } from "@/lib/auth/guards";
import { getTeacherQuestionPreviewDTOs } from "@/lib/teacher-focus-preview";
import { readTeacherFocusSelectionReceipt } from "@/lib/teacher-focus-selection";
import {
  isDatabaseUuid,
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Selected question preview · EduStruct",
};

export default async function TeacherQuestionSelectionPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{
    launchId?: string;
    returnTo?: string;
    selection?: string;
  }>;
}) {
  noStore();
  const [profile, routeParams, query, supabase] = await Promise.all([
    requireTeacher(),
    params,
    searchParams,
    createClient(),
  ]);
  const { bankId } = routeParams;

  if (!isDatabaseUuid(bankId) || !isDatabaseUuid(query.selection)) {
    notFound();
  }

  const selectedIds = await readTeacherFocusSelectionReceipt({
    bankId,
    receiptId: query.selection,
    supabase,
    surface: "questions",
  });
  if (!selectedIds) {
    notFound();
  }

  const safePreviews = await getTeacherQuestionPreviewDTOs({
    bankId,
    bankQuestionIds: selectedIds,
    profileId: profile.id,
    supabase,
  });
  if (!safePreviews) notFound();
  const returnHref = sanitizeTeacherBankReturnTo({
    bankId,
    rawReturnTo: query.returnTo,
    surface: "questions",
  });

  return (
    <FocusWorkspaceShell
      badges={
        <>
          <BankBadge tone="sky">{safePreviews[0]?.bank.name}</BankBadge>
          <BankBadge tone="slate">{safePreviews.length} selected</BankBadge>
        </>
      }
      description="Review one selected Library question at a time. Use Previous, Next, or the jump list; this queue cannot edit, approve, publish, or assign content."
      eyebrow="Library questions · Focused batch preview"
      launchId={query.launchId}
      returnHref={returnHref}
      taskKind="question-preview"
      title={`Preview ${safePreviews.length} selected questions`}
    >
      <TeacherQuestionPreviewQueue previews={safePreviews} />
    </FocusWorkspaceShell>
  );
}
