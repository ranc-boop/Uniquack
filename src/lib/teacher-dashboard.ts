import "server-only";

import {
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
  type TeacherQuestionBankSummary,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TeacherDashboardAssignmentAttention = {
  assignmentId: string;
  classroomId: string;
  classroomName: string;
  completedCount: number;
  dueAt: string | null;
  inProgressCount: number;
  notStartedCount: number;
  reason: "overdue" | "due_soon" | "low_completion";
  studentCount: number;
  title: string;
};

export type TeacherDashboardSummary = {
  assignmentReadyBanks: Array<{
    assignmentReadyCount: number;
    bankId: string;
    bankName: string;
    memberCount: number;
    visibility: string;
  }>;
  assignmentsNeedingAttention: TeacherDashboardAssignmentAttention[];
  classroomActivity: Array<{
    activeAssignmentCount: number;
    classroomId: string;
    completionRate: number | null;
    latestActivityAt: string | null;
    latestAssignmentTitle: string | null;
    name: string;
    studentCount: number;
  }>;
  overview: {
    activeAssignmentCount: number;
    activeClassroomCount: number;
    activeStudentCount: number;
    assignmentReadyQuestionCount: number;
    draftAssignmentCount: number;
    recentEvidenceCount: number;
    reviewDraftCount: number;
    studentsWithActiveProgressCount: number;
    totalBankCount: number;
  };
  recentEvidence: Array<{
    assignmentId: string;
    assignmentTitle: string;
    attemptCount: number;
    classroomId: string;
    classroomName: string;
    correctCount: number;
    createdAt: string;
    practiceSessionId: string;
    studentName: string;
  }>;
  recentImports: Array<{
    bankId: string | null;
    bankName: string | null;
    createdAt: string;
    draftCount: number | null;
    id: string;
    sourceType: string;
    status: string;
  }>;
  reviewQueue: Array<{
    bankId: string;
    bankName: string;
    importBatchCount: number;
    latestDraftAt: string | null;
    reviewDraftCount: number;
    warningCount: number;
  }>;
  setupNeeded: boolean;
};

export type TeacherHomeNextAction = {
  count: number | null;
  href: string;
  label: string;
  title: string;
};

export type TeacherHomeSummary = {
  assignmentReadyQuestionCount: number;
  libraryCount: number;
  nextAction: TeacherHomeNextAction;
  reviewDraftCount: number;
  setupNeeded: boolean;
};

function sumBankCount(
  banks: TeacherQuestionBankSummary[],
  readCount: (bank: TeacherQuestionBankSummary) => number,
) {
  return banks.reduce((total, bank) => total + readCount(bank), 0);
}

function buildNextAction(
  banks: TeacherQuestionBankSummary[],
): TeacherHomeNextAction {
  const reviewBank = [...banks]
    .filter((bank) => bank.reviewDraftCount > 0)
    .sort((first, second) => second.reviewDraftCount - first.reviewDraftCount)[0];

  if (reviewBank) {
    return {
      count: reviewBank.reviewDraftCount,
      href: `/teacher/banks/${reviewBank.id}/review`,
      label: "Review",
      title: reviewBank.name,
    };
  }

  const readyBank = [...banks]
    .filter((bank) => bank.assignmentReadyCount > 0)
    .sort(
      (first, second) =>
        second.assignmentReadyCount - first.assignmentReadyCount,
    )[0];

  if (readyBank) {
    return {
      count: readyBank.assignmentReadyCount,
      href: `/teacher/publish?sourceBankId=${readyBank.id}`,
      label: "Create assignment",
      title: readyBank.name,
    };
  }

  if (!banks.length) {
    return {
      count: null,
      href: "/teacher/banks/new",
      label: "Create Library",
      title: "Create your first Library",
    };
  }

  return {
    count: null,
    href: `/teacher/banks/${banks[0].id}/imports`,
    label: "Import",
    title: banks[0].name,
  };
}

export async function getTeacherHomeSummary({
  profileId,
  supabase,
}: {
  profileId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherHomeSummary> {
  let banks: TeacherQuestionBankSummary[];

  try {
    banks = await listTeacherQuestionBanks({ profileId, supabase });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return {
        assignmentReadyQuestionCount: 0,
        libraryCount: 0,
        nextAction: {
          count: null,
          href: "/teacher/banks",
          label: "Open Libraries",
          title: "Libraries unavailable",
        },
        reviewDraftCount: 0,
        setupNeeded: true,
      };
    }

    throw error;
  }

  return {
    assignmentReadyQuestionCount: sumBankCount(
      banks,
      (bank) => bank.assignmentReadyCount,
    ),
    libraryCount: banks.length,
    nextAction: buildNextAction(banks),
    reviewDraftCount: sumBankCount(banks, (bank) => bank.reviewDraftCount),
    setupNeeded: false,
  };
}
