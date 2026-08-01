import "server-only";

import { createClient } from "@/lib/supabase/server";
import { profileLabel } from "@/lib/classrooms";
import {
  listTeacherClassroomAssignments,
  type TeacherAssignmentSummary,
} from "@/lib/teacher-assignments";
import type {
  Assignment,
  Classroom,
  ClassroomJoinCode,
  ClassroomMember,
  Profile,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ClassroomBase = Pick<
  Classroom,
  | "created_at"
  | "description"
  | "id"
  | "name"
  | "organization_id"
  | "owner_id"
  | "status"
  | "subject"
  | "updated_at"
>;

export type TeacherClassroomChoice = Pick<
  ClassroomBase,
  "id" | "name" | "status" | "subject" | "updated_at"
>;

type AssignmentBase = Pick<
  Assignment,
  | "classroom_id"
  | "created_at"
  | "due_at"
  | "id"
  | "source_kind"
  | "source_record_id"
  | "status"
  | "title"
  | "updated_at"
>;

export type TeacherClassroomSummary = ClassroomBase & {
  activeAssignmentCount: number;
  assignmentCount: number;
  coTeacherCount: number;
  completionRate: number | null;
  draftAssignmentCount: number;
  joinCodeHint: string | null;
  joinCodeStatus: ClassroomJoinCode["status"] | null;
  joinCodeUpdatedAt: string | null;
  joinCodeVisible: string | null;
  latestActivityAt: string | null;
  latestAssignment: AssignmentBase | null;
  linkedBlueprintCount: number | null;
  studentCount: number;
  teacherCount: number;
};

export type TeacherClassroomRosterMember = Pick<
  ClassroomMember,
  "created_at" | "id" | "joined_at" | "role" | "status" | "user_id"
> & {
  assignmentSummary: {
    assignedCount: number;
    completedCount: number;
    inProgressCount: number;
    latestActivityAt: string | null;
    linkedPracticeSessionCount: number;
    needsAttention: boolean;
  };
  displayName: string;
  email: string | null;
  profile: Pick<
    Profile,
    "display_name" | "email" | "full_name" | "id" | "role" | "username"
  > | null;
};

export type TeacherClassroomWorkspace = {
  assignments: TeacherAssignmentSummary[];
  classroom: TeacherClassroomSummary;
  roster: TeacherClassroomRosterMember[];
};

function maxIso(values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

function newerAssignment(current: AssignmentBase | null, next: AssignmentBase) {
  if (!current) return next;
  const currentDate = current.updated_at ?? current.created_at;
  const nextDate = next.updated_at ?? next.created_at;
  return nextDate > currentDate ? next : current;
}

async function buildClassroomSummaries({
  classrooms,
  supabase,
}: {
  classrooms: ClassroomBase[];
  supabase: SupabaseServerClient;
}) {
  if (!classrooms.length) return [];

  const classroomIds = classrooms.map((classroom) => classroom.id);
  const [
    { data: members, error: memberError },
    { data: assignments, error: assignmentError },
    { data: joinCodes, error: joinCodeError },
  ] = await Promise.all([
    supabase
      .from("classroom_members")
      .select("classroom_id, user_id, role, status")
      .in("classroom_id", classroomIds),
    supabase
      .from("assignments")
      .select(
        "id, classroom_id, title, status, due_at, source_kind, source_record_id, created_at, updated_at",
      )
      .in("classroom_id", classroomIds),
    supabase
      .from("classroom_join_codes")
      .select("classroom_id, display_code, code_hint, status, created_at, updated_at")
      .in("classroom_id", classroomIds)
      .not("display_code", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  if (memberError) throw new Error(memberError.message);
  if (assignmentError) throw new Error(assignmentError.message);
  if (joinCodeError) throw new Error(joinCodeError.message);

  const assignmentRows = (assignments ?? []) as AssignmentBase[];
  const assignmentIds = assignmentRows.map((assignment) => assignment.id);
  const [{ data: progressRows }, { data: practiceLinks }, { data: assignmentItems }] =
    await Promise.all([
      assignmentIds.length
        ? supabase
            .from("student_assignment_progress")
            .select("assignment_id, student_id, status, updated_at")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] }),
      assignmentIds.length
        ? supabase
            .from("assignment_practice_sessions")
            .select("assignment_id, created_at")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] }),
      assignmentIds.length
        ? supabase
            .from("assignment_items")
            .select("assignment_id, source_bank_id")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] }),
    ]);

  const studentIdsByClassroom = new Map<string, Set<string>>();
  const coTeacherCountByClassroom = new Map<string, number>();
  const teacherCountByClassroom = new Map<string, number>();
  const assignmentCountByClassroom = new Map<string, number>();
  const activeAssignmentCountByClassroom = new Map<string, number>();
  const draftAssignmentCountByClassroom = new Map<string, number>();
  const latestAssignmentByClassroom = new Map<string, AssignmentBase>();
  const assignmentClassroomId = new Map<string, string>();
  const assignedAssignmentIdsByClassroom = new Map<string, Set<string>>();
  const latestActivityByClassroom = new Map<string, string>();
  const bankIdsByClassroom = new Map<string, Set<string>>();

  for (const member of members ?? []) {
    if (member.status !== "active") continue;
    if (member.role === "student") {
      const students = studentIdsByClassroom.get(member.classroom_id) ?? new Set<string>();
      students.add(member.user_id);
      studentIdsByClassroom.set(member.classroom_id, students);
      continue;
    }
    if (member.role === "co_teacher") {
      coTeacherCountByClassroom.set(
        member.classroom_id,
        (coTeacherCountByClassroom.get(member.classroom_id) ?? 0) + 1,
      );
    }
    teacherCountByClassroom.set(
      member.classroom_id,
      (teacherCountByClassroom.get(member.classroom_id) ?? 0) + 1,
    );
  }

  for (const assignment of assignmentRows) {
    assignmentClassroomId.set(assignment.id, assignment.classroom_id);
    assignmentCountByClassroom.set(
      assignment.classroom_id,
      (assignmentCountByClassroom.get(assignment.classroom_id) ?? 0) + 1,
    );
    latestAssignmentByClassroom.set(
      assignment.classroom_id,
      newerAssignment(
        latestAssignmentByClassroom.get(assignment.classroom_id) ?? null,
        assignment,
      ),
    );
    if (assignment.status === "assigned") {
      activeAssignmentCountByClassroom.set(
        assignment.classroom_id,
        (activeAssignmentCountByClassroom.get(assignment.classroom_id) ?? 0) + 1,
      );
      const assignedIds =
        assignedAssignmentIdsByClassroom.get(assignment.classroom_id) ?? new Set<string>();
      assignedIds.add(assignment.id);
      assignedAssignmentIdsByClassroom.set(assignment.classroom_id, assignedIds);
    }
    if (assignment.status === "draft") {
      draftAssignmentCountByClassroom.set(
        assignment.classroom_id,
        (draftAssignmentCountByClassroom.get(assignment.classroom_id) ?? 0) + 1,
      );
    }
    if (assignment.source_kind === "question_bank" && assignment.source_record_id) {
      const bankIds = bankIdsByClassroom.get(assignment.classroom_id) ?? new Set<string>();
      bankIds.add(assignment.source_record_id);
      bankIdsByClassroom.set(assignment.classroom_id, bankIds);
    }
    const latest = maxIso([assignment.updated_at, assignment.created_at]);
    if (latest) {
      latestActivityByClassroom.set(
        assignment.classroom_id,
        maxIso([latestActivityByClassroom.get(assignment.classroom_id), latest]) ?? latest,
      );
    }
  }

  for (const item of assignmentItems ?? []) {
    if (!item.source_bank_id) continue;
    const classroomId = assignmentClassroomId.get(item.assignment_id);
    if (!classroomId) continue;
    const bankIds = bankIdsByClassroom.get(classroomId) ?? new Set<string>();
    bankIds.add(item.source_bank_id);
    bankIdsByClassroom.set(classroomId, bankIds);
  }

  const allBankIds = Array.from(
    new Set(Array.from(bankIdsByClassroom.values()).flatMap((bankIds) => Array.from(bankIds))),
  );
  const { data: bankBlueprintRows } = allBankIds.length
    ? await supabase
        .from("bank_blueprints")
        .select("bank_id, blueprint_id, status")
        .in("bank_id", allBankIds)
        .eq("status", "active")
    : { data: [] };
  const blueprintIdsByBank = new Map<string, Set<string>>();

  for (const row of bankBlueprintRows ?? []) {
    const blueprintIds = blueprintIdsByBank.get(row.bank_id) ?? new Set<string>();
    blueprintIds.add(row.blueprint_id);
    blueprintIdsByBank.set(row.bank_id, blueprintIds);
  }

  const completedByClassroom = new Map<string, number>();

  for (const progress of progressRows ?? []) {
    const classroomId = assignmentClassroomId.get(progress.assignment_id);
    if (!classroomId) continue;
    const latest = progress.updated_at;
    if (latest) {
      latestActivityByClassroom.set(
        classroomId,
        maxIso([latestActivityByClassroom.get(classroomId), latest]) ?? latest,
      );
    }
    if (
      progress.status !== "completed" ||
      !assignedAssignmentIdsByClassroom.get(classroomId)?.has(progress.assignment_id) ||
      !studentIdsByClassroom.get(classroomId)?.has(progress.student_id)
    ) {
      continue;
    }
    completedByClassroom.set(classroomId, (completedByClassroom.get(classroomId) ?? 0) + 1);
  }

  for (const link of practiceLinks ?? []) {
    const classroomId = assignmentClassroomId.get(link.assignment_id);
    if (!classroomId || !link.created_at) continue;
    latestActivityByClassroom.set(
      classroomId,
      maxIso([latestActivityByClassroom.get(classroomId), link.created_at]) ?? link.created_at,
    );
  }

  const joinCodeByClassroom = new Map<
    string,
    Pick<ClassroomJoinCode, "code_hint" | "display_code" | "status" | "updated_at">
  >();
  for (const joinCode of joinCodes ?? []) {
    if (!joinCodeByClassroom.has(joinCode.classroom_id)) {
      joinCodeByClassroom.set(joinCode.classroom_id, joinCode);
    }
  }

  return classrooms.map((classroom) => {
    const studentCount = studentIdsByClassroom.get(classroom.id)?.size ?? 0;
    const activeAssignmentCount = activeAssignmentCountByClassroom.get(classroom.id) ?? 0;
    const denominator = studentCount * activeAssignmentCount;
    const bankIds = bankIdsByClassroom.get(classroom.id);
    const linkedBlueprintIds = new Set<string>();

    for (const bankId of bankIds ?? []) {
      for (const blueprintId of blueprintIdsByBank.get(bankId) ?? []) {
        linkedBlueprintIds.add(blueprintId);
      }
    }

    return {
      ...classroom,
      activeAssignmentCount,
      assignmentCount: assignmentCountByClassroom.get(classroom.id) ?? 0,
      coTeacherCount: coTeacherCountByClassroom.get(classroom.id) ?? 0,
      completionRate: denominator
        ? Math.round(((completedByClassroom.get(classroom.id) ?? 0) / denominator) * 100)
        : null,
      draftAssignmentCount: draftAssignmentCountByClassroom.get(classroom.id) ?? 0,
      joinCodeHint: joinCodeByClassroom.get(classroom.id)?.code_hint ?? null,
      joinCodeStatus: joinCodeByClassroom.get(classroom.id)?.status ?? null,
      joinCodeUpdatedAt: joinCodeByClassroom.get(classroom.id)?.updated_at ?? null,
      joinCodeVisible:
        joinCodeByClassroom.get(classroom.id)?.status === "active"
          ? (joinCodeByClassroom.get(classroom.id)?.display_code ?? null)
          : null,
      latestActivityAt: latestActivityByClassroom.get(classroom.id) ?? null,
      latestAssignment: latestAssignmentByClassroom.get(classroom.id) ?? null,
      linkedBlueprintCount: bankIds?.size ? linkedBlueprintIds.size : null,
      studentCount,
      teacherCount: teacherCountByClassroom.get(classroom.id) ?? 0,
    } satisfies TeacherClassroomSummary;
  });
}

export async function listTeacherClassroomSummaries({
  supabase,
}: {
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("classrooms")
    .select(
      "id, organization_id, owner_id, name, description, subject, status, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return buildClassroomSummaries({
    classrooms: (data ?? []) as ClassroomBase[],
    supabase,
  });
}

export async function listTeacherClassroomChoices({
  includeClassroomId,
  supabase,
}: {
  includeClassroomId?: string;
  supabase: SupabaseServerClient;
}) {
  const choiceQuery = supabase
    .from("classrooms")
    .select("id, name, subject, status, updated_at")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(50);
  const includedQuery = includeClassroomId
    ? supabase
        .from("classrooms")
        .select("id, name, subject, status, updated_at")
        .eq("id", includeClassroomId)
        .eq("status", "active")
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [
    { data: choices, error: choicesError },
    { data: included, error: includedError },
  ] = await Promise.all([choiceQuery, includedQuery]);

  if (choicesError) throw new Error(choicesError.message);
  if (includedError) throw new Error(includedError.message);

  const result = (choices ?? []) as TeacherClassroomChoice[];
  if (included && !result.some((classroom) => classroom.id === included.id)) {
    return [included as TeacherClassroomChoice, ...result];
  }

  return result;
}

export async function getTeacherClassroomWorkspace({
  classroomId,
  supabase,
}: {
  classroomId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherClassroomWorkspace | null> {
  const { data: classroom, error } = await supabase
    .from("classrooms")
    .select(
      "id, organization_id, owner_id, name, description, subject, status, created_at, updated_at",
    )
    .eq("id", classroomId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!classroom) return null;

  const [
    summaries,
    { data: roster, error: rosterError },
    assignments,
  ] = await Promise.all([
    buildClassroomSummaries({
      classrooms: [classroom as ClassroomBase],
      supabase,
    }),
    supabase
      .from("classroom_members")
      .select("id, user_id, role, status, joined_at, created_at")
      .eq("classroom_id", classroomId)
      .order("role", { ascending: true })
      .order("created_at", { ascending: true }),
    listTeacherClassroomAssignments({
      classroomId,
      supabase,
    }),
  ]);
  const [summary] = summaries;

  if (rosterError) throw new Error(rosterError.message);

  const userIds = Array.from(new Set((roster ?? []).map((member) => member.user_id)));
  const assignedAssignmentIds = assignments
    .filter((assignment) => assignment.status === "assigned")
    .map((assignment) => assignment.id);
  const [
    { data: progressRows },
    { data: practiceLinks },
    { data: profiles },
  ] = await Promise.all([
    assignedAssignmentIds.length
      ? supabase
          .from("student_assignment_progress")
          .select("assignment_id, student_id, status, updated_at")
          .in("assignment_id", assignedAssignmentIds)
      : Promise.resolve({ data: [] }),
    assignedAssignmentIds.length
      ? supabase
          .from("assignment_practice_sessions")
          .select("assignment_id, student_id, created_at")
          .in("assignment_id", assignedAssignmentIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase
          .from("profiles")
          .select("id, username, email, full_name, display_name, role")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map(
    ((profiles ?? []) as TeacherClassroomRosterMember["profile"][]).map((profile) => [
      profile?.id ?? "",
      profile,
    ]),
  );
  const assignedCount = assignedAssignmentIds.length;
  const studentProgressById = new Map<
    string,
    TeacherClassroomRosterMember["assignmentSummary"]
  >();

  for (const member of roster ?? []) {
    if (member.role !== "student") continue;
    studentProgressById.set(member.user_id, {
      assignedCount,
      completedCount: 0,
      inProgressCount: 0,
      latestActivityAt: null,
      linkedPracticeSessionCount: 0,
      needsAttention: assignedCount > 0,
    });
  }

  for (const progress of progressRows ?? []) {
    const summary = studentProgressById.get(progress.student_id);
    if (!summary) continue;
    if (progress.status === "completed") {
      summary.completedCount += 1;
    } else if (progress.status === "in_progress") {
      summary.inProgressCount += 1;
    }
    summary.latestActivityAt =
      maxIso([summary.latestActivityAt, progress.updated_at]) ?? summary.latestActivityAt;
    summary.needsAttention = summary.completedCount < summary.assignedCount;
  }

  for (const link of practiceLinks ?? []) {
    const summary = studentProgressById.get(link.student_id);
    if (!summary) continue;
    summary.linkedPracticeSessionCount += 1;
    summary.latestActivityAt =
      maxIso([summary.latestActivityAt, link.created_at]) ?? summary.latestActivityAt;
    if (summary.completedCount < summary.assignedCount) {
      summary.inProgressCount = Math.max(summary.inProgressCount, 1);
    }
  }

  return {
    assignments,
    classroom: summary,
    roster: ((roster ?? []) as Array<
      Pick<ClassroomMember, "created_at" | "id" | "joined_at" | "role" | "status" | "user_id">
    >).map((member) => {
      const profile = profileById.get(member.user_id) ?? null;
      return {
        ...member,
        assignmentSummary: studentProgressById.get(member.user_id) ?? {
          assignedCount,
          completedCount: 0,
          inProgressCount: 0,
          latestActivityAt: null,
          linkedPracticeSessionCount: 0,
          needsAttention: assignedCount > 0,
        },
        displayName: profileLabel(profile ?? {}),
        email: profile?.email ?? null,
        profile,
      };
    }),
  };
}
