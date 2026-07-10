"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireTeacher } from "@/lib/auth/guards";
import { getManagedClassroom } from "@/lib/teacher-assignments";
import { createClient } from "@/lib/supabase/server";

const assignmentCreateSchema = z.object({
  classroomId: z.string().uuid(),
  dueAt: z.string().trim().optional().default(""),
  instructions: z.string().trim().max(4000).optional().default(""),
  publishMode: z.enum(["draft", "assigned"]).default("assigned"),
  title: z.string().trim().min(1).max(180),
});

function normalizeDueAt(value: string) {
  if (!value) return null;
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Due date must be a valid date and time.");
  }

  return parsed.toISOString();
}

export async function createTeacherAssignment(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = assignmentCreateSchema.parse(Object.fromEntries(formData));
    const questionIds = Array.from(
      new Set(
        formData
          .getAll("questionIds")
          .map((value) => String(value))
          .filter(Boolean),
      ),
    );

    if (!questionIds.length) {
      throw new Error("Select at least one published question.");
    }

    const supabase = await createClient();
    const classroom = await getManagedClassroom({
      classroomId: parsed.classroomId,
      supabase,
    });

    if (classroom.status !== "active") {
      throw new Error("Reopen this classroom before creating new assignments.");
    }

    const { data: questions, error: questionError } = await supabase
      .from("questions")
      .select("id, status")
      .in("id", questionIds)
      .eq("status", "published");

    if (questionError) {
      throw new Error(questionError.message);
    }

    const publishedQuestionIds = new Set((questions ?? []).map((question) => question.id));

    if (publishedQuestionIds.size !== questionIds.length) {
      throw new Error("Assignments can include only published Question Bank questions.");
    }

    const assignedAt =
      parsed.publishMode === "assigned" ? new Date().toISOString() : null;
    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .insert({
        assigned_at: assignedAt,
        classroom_id: classroom.id,
        created_by: profile.id,
        due_at: normalizeDueAt(parsed.dueAt),
        instructions: parsed.instructions,
        organization_id: classroom.organization_id,
        status: parsed.publishMode,
        title: parsed.title,
      })
      .select("id")
      .single();

    if (assignmentError) {
      throw new Error(assignmentError.message);
    }

    const { error: itemError } = await supabase.from("assignment_items").insert(
      questionIds.map((questionId, index) => ({
        assignment_id: assignment.id,
        item_type: "question",
        order_index: index + 1,
        points: 1,
        question_id: questionId,
      })),
    );

    if (itemError) {
      throw new Error(itemError.message);
    }

    revalidatePath(`/teacher/classrooms/${classroom.id}`);
    revalidatePath(`/teacher/classrooms/${classroom.id}/assignments`);
    revalidatePath("/student/work");
    redirectWithSaved(
      `/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`,
      parsed.publishMode === "assigned"
        ? "Assignment assigned to the classroom."
        : "Assignment saved as draft.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/assignments/new`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}
