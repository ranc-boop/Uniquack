import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { BankBadge } from "@/app/teacher/banks/bank-ui";
import { FocusWorkspaceShell } from "@/components/teacher/focus-workspace-shell";
import { TeacherQuestionPreviewQueue } from "@/components/teacher/teacher-question-preview-queue";
import { requireTeacher } from "@/lib/auth/guards";
import { getTeacherQuestionBankAccess } from "@/lib/question-banks";
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
  title: "Selected Review Draft preview · EduStruct",
};

export default async function TeacherReviewSelectionPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{
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
    surface: "review",
  });
  if (!selectedIds) {
    notFound();
  }

  const access = await getTeacherQuestionBankAccess({
    bankId,
    profileId: profile.id,
    supabase,
  });
  if (!access?.canManage) notFound();
  const returnHref = sanitizeTeacherBankReturnTo({
    bankId,
    rawReturnTo: query.returnTo,
    surface: "review",
  });

  return (
    <FocusWorkspaceShell
      badges={
        <>
          <BankBadge tone="sky">{access.bank.name}</BankBadge>
          <BankBadge tone="amber">{selectedIds.length} pending drafts</BankBadge>
        </>
      }
      description="Inspect one selected pending draft at a time before returning to the Review list. Approval remains a separate atomic action in the original tab."
      eyebrow="Review Drafts · Focused batch preview"
      returnHref={returnHref}
      returnSurfaceLabel="Review list"
      title={`Preview ${selectedIds.length} selected Review Drafts`}
    >
      <TeacherQuestionPreviewQueue
        bankId={bankId}
        ids={selectedIds}
        kind="review"
      />
    </FocusWorkspaceShell>
  );
}
