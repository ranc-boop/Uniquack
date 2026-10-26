import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Assignment, Profile, StudentAssignmentProgress } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ClassroomRow = {
  id: string;
  name: string;
  updated_at: string;
};

type AssignmentRow = Pick<
  Assignment,
  | "assigned_at"
  | "classroom_id"
  | "created_at"
  | "due_at"
  | "id"
  | "status"
  | "title"
  | "updated_at"
>;

type ProgressRow = Pick<
  StudentAssignmentProgress,
  | "assignment_id"
  | "completed_at"
  | "started_at"
  | "status"
  | "student_id"
  | "updated_at"
>;

type PracticeLinkRow = {
  assignment_id: string;
  created_at: string;
  practice_session_id: string;
  student_id: string;
};

type PracticeSessionRow = {
  id: string;
  last_activity_at: string;
};

type PracticeAttemptRow = {
  created_at: string;
  is_correct: boolean | null;
  session_id: string;
  user_id: string;
};

type ProfileRow = Pick<Profile, "display_name" | "email" | "full_name" | "id" | "username">;

export type TeacherProgressAttentionReason =
  | "due_soon"
  | "high_wrong_rate"
  | "low_completion"
  | "overdue";

export type TeacherProgressAssignment = {
  assignmentId: string;
  classroomId: string;
  classroomName: string;
  completedCount: number;
  completionRate: number | null;
  dueAt: string | null;
  inProgressCount: number;
  latestActivityAt: string | null;
  notStartedCount: number;
  recentAttemptCount: number;
  recentWrongCount: number;
  status: Assignment["status"];
  studentCount: number;
  title: string;
};

type TeacherProgressAttentionItem = TeacherProgressAssignment & {
  reasons: TeacherProgressAttentionReason[];
  studentsNeedingAttentionCount: number;
};

type TeacherProgressEvidenceItem = {
  assignmentId: string;
  assignmentTitle: string;
  classroomId: string;
  classroomName: string;
  correctCount: number;
  latestActivityAt: string;
  practiceSessionId: string;
  status: StudentAssignmentProgress["status"];
  studentId: string;
  studentName: string;
  totalAttemptCount: number;
  wrongCount: number;
};

export type TeacherProgressSummary = {
  assignments: TeacherProgressAssignment[];
  attentionQueue: TeacherProgressAttentionItem[];
  hasAssignedWork: boolean;
  hasClassrooms: boolean;
  hasEvidence: boolean;
  overview: {
    activeAssignmentCount: number;
    activeClassroomCount: number;
    assignedStudentSlotCount: number;
    completedStudentSlotCount: number;
    completionRate: number | null;
    draftAssignmentCount: number;
    recentEvidenceCount: number;
    studentsNeedingAttentionCount: number;
  };
  recentEvidence: TeacherProgressEvidenceItem[];
};

const MAX_CLASSROOMS = 100;
const MAX_MEMBERS = 800;
const MAX_ASSIGNMENTS = 240;
const MAX_PROGRESS_ROWS = 800;
const MAX_PRACTICE_LINKS = 240;
const MAX_PRACTICE_ATTEMPTS = 900;
const MAX_PROFILES = 600;
const RECENT_EVIDENCE_DAYS = 14;

function emptyTeacherProgressSummary(): TeacherProgressSummary {
  return {
    assignments: [],
    attentionQueue: [],
    hasAssignedWork: false,
    hasClassrooms: false,
    hasEvidence: false,
    overview: {
      activeAssignmentCount: 0,
      activeClassroomCount: 0,
      assignedStudentSlotCount: 0,
      completedStudentSlotCount: 0,
      completionRate: null,
      draftAssignmentCount: 0,
      recentEvidenceCount: 0,
      studentsNeedingAttentionCount: 0,
    },
    recentEvidence: [],
  };
}

function rowKey(assignmentId: string, studentId: string) {
  return `${assignmentId}:${studentId}`;
}

function safeTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function profileDisplayName(profile: ProfileRow | null | undefined) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    profile?.email ||
    "Student"
  );
}

function attentionPriority(reason: TeacherProgressAttentionReason) {
  return {
    overdue: 0,
    due_soon: 1,
    high_wrong_rate: 2,
    low_completion: 3,
  }[reason];
}

export async function getTeacherProgressSummary({
  supabase,
}: {
  supabase: SupabaseServerClient;
}): Promise<TeacherProgressSummary> {
  const { data: classroomData, error: classroomError } = await supabase
    .from("classrooms")
    .select("id, name, updated_at")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(MAX_CLASSROOMS);

  if (classroomError) throw new Error(classroomError.message);

  const classrooms = (classroomData ?? []) as ClassroomRow[];
  if (!classrooms.length) return emptyTeacherProgressSummary();

  const classroomIds = classrooms.map((classroom) => classroom.id);
  const [{ data: memberData, error: memberError }, { data: assignmentData, error: assignmentError }] =
    await Promise.all([
      supabase
        .from("classroom_members")
        .select("classroom_id, user_id")
        .in("classroom_id", classroomIds)
        .eq("role", "student")
        .eq("status", "active")
        .limit(MAX_MEMBERS),
      supabase
        .from("assignments")
        .select(
          "id, classroom_id, title, status, assigned_at, due_at, created_at, updated_at",
        )
        .in("classroom_id", classroomIds)
        .in("status", ["assigned", "draft"])
        .order("updated_at", { ascending: false })
        .limit(MAX_ASSIGNMENTS),
    ]);

  if (memberError) throw new Error(memberError.message);
  if (assignmentError) throw new Error(assignmentError.message);

  const assignments = (assignmentData ?? []) as AssignmentRow[];
  const rosterByClassroomId = new Map<string, Set<string>>();
  for (const member of memberData ?? []) {
    const roster = rosterByClassroomId.get(member.classroom_id) ?? new Set<string>();
    roster.add(member.user_id);
    rosterByClassroomId.set(member.classroom_id, roster);
  }

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const [{ data: progressData, error: progressError }, { data: linkData, error: linkError }] =
    assignmentIds.length
      ? await Promise.all([
          supabase
            .from("student_assignment_progress")
            .select(
              "assignment_id, student_id, status, started_at, completed_at, updated_at",
            )
            .in("assignment_id", assignmentIds)
            .limit(MAX_PROGRESS_ROWS),
          supabase
            .from("assignment_practice_sessions")
            .select("assignment_id, student_id, practice_session_id, created_at")
            .in("assignment_id", assignmentIds)
            .order("created_at", { ascending: false })
            .limit(MAX_PRACTICE_LINKS),
        ])
      : [
          { data: [] as ProgressRow[], error: null },
          { data: [] as PracticeLinkRow[], error: null },
        ];

  if (progressError) throw new Error(progressError.message);
  if (linkError) throw new Error(linkError.message);

  const progressRows = (progressData ?? []) as ProgressRow[];
  const practiceLinks = (linkData ?? []) as PracticeLinkRow[];
  const practiceSessionIds = Array.from(
    new Set(practiceLinks.map((link) => link.practice_session_id)),
  );
  const activeStudentIds = Array.from(
    new Set(Array.from(rosterByClassroomId.values()).flatMap((roster) => Array.from(roster))),
  );

  const [{ data: sessionData, error: sessionError }, { data: profileData, error: profileError }] =
    await Promise.all([
      practiceSessionIds.length
        ? supabase
            .from("practice_sessions")
            .select("id, last_activity_at")
            .in("id", practiceSessionIds)
            .limit(MAX_PRACTICE_LINKS)
        : Promise.resolve({ data: [] as PracticeSessionRow[], error: null }),
      activeStudentIds.length
        ? supabase
            .from("profiles")
            .select("id, username, email, full_name, display_name")
            .in("id", activeStudentIds)
            .limit(MAX_PROFILES)
        : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    ]);

  if (sessionError) throw new Error(sessionError.message);
  if (profileError) throw new Error(profileError.message);

  const { data: attemptData, error: attemptError } = practiceSessionIds.length
    ? await supabase
        .from("practice_attempts")
        .select("session_id, user_id, is_correct, created_at")
        .in("session_id", practiceSessionIds)
        .order("created_at", { ascending: false })
        .limit(MAX_PRACTICE_ATTEMPTS)
    : { data: [] as PracticeAttemptRow[], error: null };

  if (attemptError) throw new Error(attemptError.message);

  const classroomNameById = new Map(
    classrooms.map((classroom) => [classroom.id, classroom.name]),
  );
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const progressByKey = new Map(
    progressRows.map((progress) => [rowKey(progress.assignment_id, progress.student_id), progress]),
  );
  const sessionById = new Map(
    ((sessionData ?? []) as PracticeSessionRow[]).map((session) => [session.id, session]),
  );
  const profileById = new Map(
    ((profileData ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const linksByAssignmentStudent = new Map<string, PracticeLinkRow[]>();
  const attemptsBySessionId = new Map<string, PracticeAttemptRow[]>();

  for (const link of practiceLinks) {
    const assignment = assignmentById.get(link.assignment_id);
    if (!assignment || !rosterByClassroomId.get(assignment.classroom_id)?.has(link.student_id)) {
      continue;
    }

    const key = rowKey(link.assignment_id, link.student_id);
    const links = linksByAssignmentStudent.get(key) ?? [];
    links.push(link);
    linksByAssignmentStudent.set(key, links);
  }

  for (const attempt of (attemptData ?? []) as PracticeAttemptRow[]) {
    const attempts = attemptsBySessionId.get(attempt.session_id) ?? [];
    attempts.push(attempt);
    attemptsBySessionId.set(attempt.session_id, attempts);
  }

  function studentAssignmentEvidence(assignment: AssignmentRow, studentId: string) {
    const key = rowKey(assignment.id, studentId);
    const progress = progressByKey.get(key);
    const links = linksByAssignmentStudent.get(key) ?? [];
    const attempts = links.flatMap((link) =>
      (attemptsBySessionId.get(link.practice_session_id) ?? []).filter(
        (attempt) => attempt.user_id === studentId,
      ),
    );
    const latestActivityAt = latestIso([
      progress?.updated_at,
      ...links.flatMap((link) => [
        link.created_at,
        sessionById.get(link.practice_session_id)?.last_activity_at,
      ]),
      ...attempts.map((attempt) => attempt.created_at),
    ]);
    const status =
      progress?.status === "completed"
        ? "completed"
        : progress?.status === "in_progress" || links.length
          ? "in_progress"
          : "not_started";

    return {
      attempts,
      latestActivityAt,
      links,
      status: status satisfies StudentAssignmentProgress["status"],
      wrongCount: attempts.filter((attempt) => attempt.is_correct === false).length,
    };
  }

  const studentsNeedingAttention = new Set<string>();
  const attentionQueue: TeacherProgressAttentionItem[] = [];
  let assignedStudentSlotCount = 0;
  let completedStudentSlotCount = 0;

  const assignmentSummaries = assignments.map((assignment) => {
    const roster = rosterByClassroomId.get(assignment.classroom_id) ?? new Set<string>();
    const studentIds = assignment.status === "assigned" ? Array.from(roster) : [];
    const studentEvidence = studentIds.map((studentId) => ({
      studentId,
      ...studentAssignmentEvidence(assignment, studentId),
    }));
    const completedCount = studentEvidence.filter(
      (evidence) => evidence.status === "completed",
    ).length;
    const inProgressCount = studentEvidence.filter(
      (evidence) => evidence.status === "in_progress",
    ).length;
    const notStartedCount = Math.max(0, studentIds.length - completedCount - inProgressCount);
    const attempts = studentEvidence.flatMap((evidence) => evidence.attempts);
    const recentWrongCount = attempts.filter((attempt) => attempt.is_correct === false).length;
    const latestActivityAt = latestIso([
      assignment.updated_at,
      ...studentEvidence.map((evidence) => evidence.latestActivityAt),
    ]);
    const completionRate = studentIds.length
      ? Math.round((completedCount / studentIds.length) * 100)
      : null;
    const summary: TeacherProgressAssignment = {
      assignmentId: assignment.id,
      classroomId: assignment.classroom_id,
      classroomName: classroomNameById.get(assignment.classroom_id) ?? "Classroom",
      completedCount,
      completionRate,
      dueAt: assignment.due_at,
      inProgressCount,
      latestActivityAt,
      notStartedCount,
      recentAttemptCount: attempts.length,
      recentWrongCount,
      status: assignment.status,
      studentCount: studentIds.length,
      title: assignment.title,
    };

    if (assignment.status === "assigned") {
      assignedStudentSlotCount += studentIds.length;
      completedStudentSlotCount += completedCount;

      const now = Date.now();
      const dueTime = safeTime(assignment.due_at);
      const dueSoonTime = now + 7 * 24 * 60 * 60 * 1000;
      const reasons: TeacherProgressAttentionReason[] = [];
      const hasStartedEvidence = inProgressCount + completedCount > 0 || attempts.length > 0;

      if (dueTime && dueTime < now && completedCount < studentIds.length) {
        reasons.push("overdue");
      } else if (dueTime && dueTime <= dueSoonTime && completedCount < studentIds.length) {
        reasons.push("due_soon");
      }
      if (studentIds.length && completionRate !== null && completionRate < 50 && hasStartedEvidence) {
        reasons.push("low_completion");
      }
      if (attempts.length >= 3 && recentWrongCount / attempts.length >= 0.5) {
        reasons.push("high_wrong_rate");
      }

      if (reasons.length) {
        const attentionStudentIds = new Set<string>();
        for (const evidence of studentEvidence) {
          const hasLowAccuracy =
            evidence.attempts.length >= 2 &&
            evidence.wrongCount / evidence.attempts.length >= 0.5;
          if (evidence.status !== "completed" || hasLowAccuracy) {
            attentionStudentIds.add(evidence.studentId);
            studentsNeedingAttention.add(evidence.studentId);
          }
        }

        attentionQueue.push({
          ...summary,
          reasons,
          studentsNeedingAttentionCount: attentionStudentIds.size,
        });
      }
    }

    return summary;
  });

  const recentEvidence = practiceLinks
    .flatMap((link) => {
      const assignment = assignmentById.get(link.assignment_id);
      if (
        !assignment ||
        assignment.status !== "assigned" ||
        !rosterByClassroomId.get(assignment.classroom_id)?.has(link.student_id)
      ) {
        return [];
      }

      const attempts = (attemptsBySessionId.get(link.practice_session_id) ?? []).filter(
        (attempt) => attempt.user_id === link.student_id,
      );
      const progress = progressByKey.get(rowKey(link.assignment_id, link.student_id));
      const latestActivityAt =
        latestIso([
          link.created_at,
          sessionById.get(link.practice_session_id)?.last_activity_at,
          ...attempts.map((attempt) => attempt.created_at),
        ]) ?? link.created_at;

      return [
        {
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          classroomId: assignment.classroom_id,
          classroomName: classroomNameById.get(assignment.classroom_id) ?? "Classroom",
          correctCount: attempts.filter((attempt) => attempt.is_correct === true).length,
          latestActivityAt,
          practiceSessionId: link.practice_session_id,
          status:
            progress?.status === "completed"
              ? "completed"
              : "in_progress",
          studentId: link.student_id,
          studentName: profileDisplayName(profileById.get(link.student_id)),
          totalAttemptCount: attempts.length,
          wrongCount: attempts.filter((attempt) => attempt.is_correct === false).length,
        } satisfies TeacherProgressEvidenceItem,
      ];
    })
    .sort((a, b) => safeTime(b.latestActivityAt) - safeTime(a.latestActivityAt));

  const recentCutoff = Date.now() - RECENT_EVIDENCE_DAYS * 24 * 60 * 60 * 1000;
  const recentEvidenceCount = recentEvidence.filter(
    (evidence) => safeTime(evidence.latestActivityAt) >= recentCutoff,
  ).length;

  return {
    assignments: assignmentSummaries.sort((a, b) => {
      const statusDelta = (a.status === "assigned" ? 0 : 1) - (b.status === "assigned" ? 0 : 1);
      return statusDelta || safeTime(b.latestActivityAt) - safeTime(a.latestActivityAt);
    }),
    attentionQueue: attentionQueue
      .sort((a, b) => {
        const priorityDelta =
          attentionPriority(a.reasons[0]) - attentionPriority(b.reasons[0]);
        return priorityDelta || safeTime(a.dueAt) - safeTime(b.dueAt);
      })
      .slice(0, 10),
    hasAssignedWork: assignments.some((assignment) => assignment.status === "assigned"),
    hasClassrooms: true,
    hasEvidence: recentEvidence.length > 0,
    overview: {
      activeAssignmentCount: assignments.filter((assignment) => assignment.status === "assigned")
        .length,
      activeClassroomCount: classrooms.length,
      assignedStudentSlotCount,
      completedStudentSlotCount,
      completionRate: assignedStudentSlotCount
        ? Math.round((completedStudentSlotCount / assignedStudentSlotCount) * 100)
        : null,
      draftAssignmentCount: assignments.filter((assignment) => assignment.status === "draft")
        .length,
      recentEvidenceCount,
      studentsNeedingAttentionCount: studentsNeedingAttention.size,
    },
    recentEvidence: recentEvidence.slice(0, 12),
  };
}
