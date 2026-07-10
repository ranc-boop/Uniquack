import "server-only";

import { listTeacherClassroomSummaries } from "@/lib/teacher-classrooms";
import {
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
  type TeacherQuestionBankSummary,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, ImportBatch, Profile } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AssignmentRow = Pick<
  Assignment,
  "classroom_id" | "created_at" | "due_at" | "id" | "status" | "title" | "updated_at"
>;

type ProgressRow = {
  assignment_id: string;
  status: "not_started" | "in_progress" | "completed";
  student_id: string;
  updated_at: string | null;
};

type PracticeLinkRow = {
  assignment_id: string;
  created_at: string;
  practice_session_id: string;
  student_id: string;
};

type PracticeAttemptRow = {
  is_correct: boolean | null;
  session_id: string;
};

type DraftQuestionRow = {
  created_at: string;
  id: string;
  owner_bank_id: string | null;
};

type ImportItemRow = {
  created_question_id: string | null;
  validation_errors: unknown;
};

type ProfileLabel = Pick<Profile, "display_name" | "email" | "full_name" | "id" | "username">;

export type TeacherDashboardOverview = {
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

export type TeacherDashboardReviewQueueItem = {
  bankId: string;
  bankName: string;
  importBatchCount: number;
  latestDraftAt: string | null;
  reviewDraftCount: number;
  warningCount: number;
};

export type TeacherDashboardAssignmentReadyBank = {
  assignmentReadyCount: number;
  bankId: string;
  bankName: string;
  memberCount: number;
  visibility: string;
};

export type TeacherDashboardRecentImport = {
  bankId: string | null;
  bankName: string | null;
  createdAt: string;
  draftCount: number | null;
  id: string;
  sourceType: string;
  status: string;
};

export type TeacherDashboardClassroomActivity = {
  activeAssignmentCount: number;
  classroomId: string;
  completionRate: number | null;
  latestActivityAt: string | null;
  latestAssignmentTitle: string | null;
  name: string;
  studentCount: number;
};

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

export type TeacherDashboardRecentEvidence = {
  assignmentId: string;
  assignmentTitle: string;
  attemptCount: number;
  classroomId: string;
  classroomName: string;
  correctCount: number;
  createdAt: string;
  practiceSessionId: string;
  studentName: string;
};

export type TeacherDashboardSummary = {
  assignmentReadyBanks: TeacherDashboardAssignmentReadyBank[];
  assignmentsNeedingAttention: TeacherDashboardAssignmentAttention[];
  classroomActivity: TeacherDashboardClassroomActivity[];
  overview: TeacherDashboardOverview;
  recentEvidence: TeacherDashboardRecentEvidence[];
  recentImports: TeacherDashboardRecentImport[];
  reviewQueue: TeacherDashboardReviewQueueItem[];
  setupNeeded: boolean;
};

function emptyTeacherDashboardSummary(setupNeeded = false): TeacherDashboardSummary {
  return {
    assignmentReadyBanks: [],
    assignmentsNeedingAttention: [],
    classroomActivity: [],
    overview: {
      activeAssignmentCount: 0,
      activeClassroomCount: 0,
      activeStudentCount: 0,
      assignmentReadyQuestionCount: 0,
      draftAssignmentCount: 0,
      recentEvidenceCount: 0,
      reviewDraftCount: 0,
      studentsWithActiveProgressCount: 0,
      totalBankCount: 0,
    },
    recentEvidence: [],
    recentImports: [],
    reviewQueue: [],
    setupNeeded,
  };
}

function sumBy<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function safeDateValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function profileDisplayName(profile: ProfileLabel | null | undefined) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    profile?.email ||
    "Student"
  );
}

function countValidationWarnings(validationErrors: unknown) {
  return Array.isArray(validationErrors) ? validationErrors.length : 0;
}

function readDraftCountFromImportSummary(summary: unknown) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const record = summary as Record<string, unknown>;
  const candidates = [
    record.createdDraftCount,
    record.createdQuestionCount,
    record.reviewDraftCount,
    record.questionCount,
    record.importedCount,
  ];

  const numeric = candidates.find((value) => typeof value === "number");
  return typeof numeric === "number" ? numeric : null;
}

async function listRecentImports({
  bankIds,
  bankNameById,
  supabase,
}: {
  bankIds: string[];
  bankNameById: Map<string, string>;
  supabase: SupabaseServerClient;
}) {
  if (!bankIds.length) return [];

  const { data, error } = await supabase
    .from("import_batches")
    .select("id, target_bank_id, source_type, status, summary, created_at")
    .in("target_bank_id", bankIds)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<
    Pick<ImportBatch, "created_at" | "id" | "source_type" | "status" | "summary" | "target_bank_id">
  >).map((row) => ({
    bankId: row.target_bank_id,
    bankName: row.target_bank_id ? bankNameById.get(row.target_bank_id) ?? null : null,
    createdAt: row.created_at,
    draftCount: readDraftCountFromImportSummary(row.summary),
    id: row.id,
    sourceType: row.source_type,
    status: row.status,
  }));
}

async function buildReviewQueue({
  banks,
  supabase,
}: {
  banks: TeacherQuestionBankSummary[];
  supabase: SupabaseServerClient;
}) {
  const bankIds = banks.filter((bank) => bank.reviewDraftCount > 0).map((bank) => bank.id);
  if (!bankIds.length) return [];

  const { data: draftRows, error: draftError } = await supabase
    .from("questions")
    .select("id, owner_bank_id, created_at")
    .in("owner_bank_id", bankIds)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(120);

  if (draftError) throw new Error(draftError.message);

  const drafts = (draftRows ?? []) as DraftQuestionRow[];
  const questionIds = drafts.map((draft) => draft.id);
  const { data: importItems, error: itemError } = questionIds.length
    ? await supabase
        .from("import_batch_items")
        .select("created_question_id, validation_errors")
        .in("created_question_id", questionIds)
        .limit(120)
    : { data: [], error: null };

  if (itemError) throw new Error(itemError.message);

  const warningCountByQuestionId = new Map<string, number>();
  for (const item of (importItems ?? []) as ImportItemRow[]) {
    if (!item.created_question_id) continue;
    warningCountByQuestionId.set(
      item.created_question_id,
      countValidationWarnings(item.validation_errors),
    );
  }

  const latestDraftByBankId = new Map<string, string>();
  const warningCountByBankId = new Map<string, number>();
  for (const draft of drafts) {
    if (!draft.owner_bank_id) continue;
    latestDraftByBankId.set(
      draft.owner_bank_id,
      [latestDraftByBankId.get(draft.owner_bank_id), draft.created_at]
        .filter(Boolean)
        .sort()
        .at(-1) ?? draft.created_at,
    );
    warningCountByBankId.set(
      draft.owner_bank_id,
      (warningCountByBankId.get(draft.owner_bank_id) ?? 0) +
        (warningCountByQuestionId.get(draft.id) ?? 0),
    );
  }

  return banks
    .filter((bank) => bank.reviewDraftCount > 0)
    .map((bank) => ({
      bankId: bank.id,
      bankName: bank.name,
      importBatchCount: bank.importBatchCount,
      latestDraftAt: latestDraftByBankId.get(bank.id) ?? null,
      reviewDraftCount: bank.reviewDraftCount,
      warningCount: warningCountByBankId.get(bank.id) ?? 0,
    }))
    .sort((a, b) => b.reviewDraftCount - a.reviewDraftCount)
    .slice(0, 6);
}

function buildAssignmentReadyBanks(banks: TeacherQuestionBankSummary[]) {
  return banks
    .filter((bank) => bank.assignmentReadyCount > 0)
    .map((bank) => ({
      assignmentReadyCount: bank.assignmentReadyCount,
      bankId: bank.id,
      bankName: bank.name,
      memberCount: bank.activeMemberCount,
      visibility: bank.visibility,
    }))
    .sort((a, b) => b.assignmentReadyCount - a.assignmentReadyCount)
    .slice(0, 6);
}

function buildClassroomActivity(classrooms: Awaited<ReturnType<typeof listTeacherClassroomSummaries>>) {
  return classrooms
    .map((classroom) => ({
      activeAssignmentCount: classroom.activeAssignmentCount,
      classroomId: classroom.id,
      completionRate: classroom.completionRate,
      latestActivityAt: classroom.latestActivityAt,
      latestAssignmentTitle: classroom.latestAssignment?.title ?? null,
      name: classroom.name,
      studentCount: classroom.studentCount,
    }))
    .sort((a, b) => safeDateValue(b.latestActivityAt) - safeDateValue(a.latestActivityAt))
    .slice(0, 6);
}

async function listDashboardAssignments({
  classroomIds,
  supabase,
}: {
  classroomIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (!classroomIds.length) return [];

  const { data, error } = await supabase
    .from("assignments")
    .select("id, classroom_id, title, status, due_at, created_at, updated_at")
    .in("classroom_id", classroomIds)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) throw new Error(error.message);
  return (data ?? []) as AssignmentRow[];
}

async function listDashboardProgress({
  assignmentIds,
  supabase,
}: {
  assignmentIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (!assignmentIds.length) {
    return { practiceLinks: [] as PracticeLinkRow[], progressRows: [] as ProgressRow[] };
  }

  const [{ data: progressRows, error: progressError }, { data: practiceLinks, error: linkError }] =
    await Promise.all([
      supabase
        .from("student_assignment_progress")
        .select("assignment_id, student_id, status, updated_at")
        .in("assignment_id", assignmentIds)
        .limit(300),
      supabase
        .from("assignment_practice_sessions")
        .select("assignment_id, student_id, practice_session_id, created_at")
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

  if (progressError) throw new Error(progressError.message);
  if (linkError) throw new Error(linkError.message);

  return {
    practiceLinks: (practiceLinks ?? []) as PracticeLinkRow[],
    progressRows: (progressRows ?? []) as ProgressRow[],
  };
}

function buildAssignmentAttention({
  assignments,
  classroomNameById,
  studentCountByClassroomId,
  progressRows,
}: {
  assignments: AssignmentRow[];
  classroomNameById: Map<string, string>;
  progressRows: ProgressRow[];
  studentCountByClassroomId: Map<string, number>;
}) {
  const progressByAssignmentId = new Map<string, ProgressRow[]>();
  for (const progress of progressRows) {
    const rows = progressByAssignmentId.get(progress.assignment_id) ?? [];
    rows.push(progress);
    progressByAssignmentId.set(progress.assignment_id, rows);
  }

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  return assignments
    .filter((assignment) => assignment.status === "assigned")
    .flatMap((assignment) => {
      const rows = progressByAssignmentId.get(assignment.id) ?? [];
      const completedCount = rows.filter((row) => row.status === "completed").length;
      const inProgressCount = rows.filter((row) => row.status === "in_progress").length;
      const studentCount = studentCountByClassroomId.get(assignment.classroom_id) ?? 0;
      const notStartedCount = Math.max(0, studentCount - completedCount - inProgressCount);
      const dueTime = safeDateValue(assignment.due_at);
      const completionRate = studentCount ? completedCount / studentCount : 0;
      let reason: TeacherDashboardAssignmentAttention["reason"] | null = null;

      if (dueTime && dueTime < now && notStartedCount > 0) {
        reason = "overdue";
      } else if (dueTime && dueTime <= now + sevenDays && notStartedCount > 0) {
        reason = "due_soon";
      } else if (studentCount > 0 && completionRate < 0.5 && rows.length > 0) {
        reason = "low_completion";
      }

      if (!reason) return [];

      return [
        {
          assignmentId: assignment.id,
          classroomId: assignment.classroom_id,
          classroomName: classroomNameById.get(assignment.classroom_id) ?? "Classroom",
          completedCount,
          dueAt: assignment.due_at,
          inProgressCount,
          notStartedCount,
          reason,
          studentCount,
          title: assignment.title,
        },
      ];
    })
    .sort((a, b) => {
      const reasonOrder = { overdue: 0, due_soon: 1, low_completion: 2 };
      return reasonOrder[a.reason] - reasonOrder[b.reason] || safeDateValue(a.dueAt) - safeDateValue(b.dueAt);
    })
    .slice(0, 6);
}

async function buildRecentEvidence({
  assignments,
  classroomNameById,
  practiceLinks,
  supabase,
}: {
  assignments: AssignmentRow[];
  classroomNameById: Map<string, string>;
  practiceLinks: PracticeLinkRow[];
  supabase: SupabaseServerClient;
}) {
  const recentLinks = practiceLinks.slice(0, 8);
  if (!recentLinks.length) return [];

  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const studentIds = Array.from(new Set(recentLinks.map((link) => link.student_id)));
  const sessionIds = Array.from(new Set(recentLinks.map((link) => link.practice_session_id)));

  const [{ data: profiles, error: profileError }, { data: attempts, error: attemptError }] =
    await Promise.all([
      studentIds.length
        ? supabase
            .from("profiles")
            .select("id, username, email, full_name, display_name")
            .in("id", studentIds)
            .limit(80)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length
        ? supabase
            .from("practice_attempts")
            .select("session_id, is_correct")
            .in("session_id", sessionIds)
            .limit(300)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (profileError) throw new Error(profileError.message);
  if (attemptError) throw new Error(attemptError.message);

  const profileById = new Map(
    ((profiles ?? []) as ProfileLabel[]).map((profile) => [profile.id, profile]),
  );
  const attemptsBySessionId = new Map<string, PracticeAttemptRow[]>();
  for (const attempt of (attempts ?? []) as PracticeAttemptRow[]) {
    const rows = attemptsBySessionId.get(attempt.session_id) ?? [];
    rows.push(attempt);
    attemptsBySessionId.set(attempt.session_id, rows);
  }

  return recentLinks.map((link) => {
    const assignment = assignmentById.get(link.assignment_id);
    const attemptRows = attemptsBySessionId.get(link.practice_session_id) ?? [];

    return {
      assignmentId: link.assignment_id,
      assignmentTitle: assignment?.title ?? "Assignment",
      attemptCount: attemptRows.length,
      classroomId: assignment?.classroom_id ?? "",
      classroomName: assignment ? classroomNameById.get(assignment.classroom_id) ?? "Classroom" : "Classroom",
      correctCount: attemptRows.filter((attempt) => attempt.is_correct === true).length,
      createdAt: link.created_at,
      practiceSessionId: link.practice_session_id,
      studentName: profileDisplayName(profileById.get(link.student_id)),
    };
  });
}

export async function getTeacherDashboardSummary({
  profileId,
  supabase,
}: {
  profileId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherDashboardSummary> {
  let banks: TeacherQuestionBankSummary[] = [];

  try {
    banks = await listTeacherQuestionBanks({ profileId, supabase });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return emptyTeacherDashboardSummary(true);
    }

    throw error;
  }

  const classrooms = await listTeacherClassroomSummaries({ supabase });
  const bankNameById = new Map(banks.map((bank) => [bank.id, bank.name]));
  const classroomNameById = new Map(classrooms.map((classroom) => [classroom.id, classroom.name]));
  const studentCountByClassroomId = new Map(
    classrooms.map((classroom) => [classroom.id, classroom.studentCount]),
  );
  const classroomIds = classrooms.map((classroom) => classroom.id);
  const assignments = await listDashboardAssignments({ classroomIds, supabase });
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const { practiceLinks, progressRows } = await listDashboardProgress({
    assignmentIds,
    supabase,
  });

  const [reviewQueue, recentImports, recentEvidence] = await Promise.all([
    buildReviewQueue({ banks, supabase }),
    listRecentImports({
      bankIds: banks.map((bank) => bank.id),
      bankNameById,
      supabase,
    }),
    buildRecentEvidence({
      assignments,
      classroomNameById,
      practiceLinks,
      supabase,
    }),
  ]);

  const assignmentReadyBanks = buildAssignmentReadyBanks(banks);
  const classroomActivity = buildClassroomActivity(classrooms);
  const assignmentsNeedingAttention = buildAssignmentAttention({
    assignments,
    classroomNameById,
    progressRows,
    studentCountByClassroomId,
  });

  return {
    assignmentReadyBanks,
    assignmentsNeedingAttention,
    classroomActivity,
    overview: {
      activeAssignmentCount: sumBy(classrooms, (classroom) => classroom.activeAssignmentCount),
      activeClassroomCount: classrooms.filter((classroom) => classroom.status === "active").length,
      activeStudentCount: sumBy(classrooms, (classroom) => classroom.studentCount),
      assignmentReadyQuestionCount: sumBy(banks, (bank) => bank.assignmentReadyCount),
      draftAssignmentCount: sumBy(classrooms, (classroom) => classroom.draftAssignmentCount),
      recentEvidenceCount: practiceLinks.length,
      reviewDraftCount: sumBy(banks, (bank) => bank.reviewDraftCount),
      studentsWithActiveProgressCount: new Set(
        progressRows
          .filter((progress) => progress.status === "in_progress")
          .map((progress) => progress.student_id),
      ).size,
      totalBankCount: banks.length,
    },
    recentEvidence,
    recentImports,
    reviewQueue,
    setupNeeded: false,
  };
}
