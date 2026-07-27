"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireTeacher } from "@/lib/auth/guards";
import {
  buildAssignmentSourceSummary,
  getCourseBuilderBridgeSource,
} from "@/lib/course-builder/assignment-bridge";
import { createClient } from "@/lib/supabase/server";
import { getManagedClassroom } from "@/lib/teacher-assignments";

const bridgeAssignmentSchema = z.object({
  classroomId: z.string().uuid(),
  dueAt: z.string().trim().optional().default(""),
  instructions: z.string().trim().max(4000).optional().default(""),
  publishMode: z.enum(["draft", "assigned"]).default("draft"),
  sourceId: z.string().uuid(),
  sourceKind: z.enum(["course_builder_run", "practice_framework"]),
  title: z.string().trim().max(180).optional().default(""),
});

function normalizeDueAt(value: string) {
  if (!value) return null;
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Due date must be a valid date and time.");
  }

  return parsed.toISOString();
}

export async function createAssignmentFromCourseBuilder(formData: FormData) {
  try {
    const profile = await requireTeacher();
    const parsed = bridgeAssignmentSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const classroom = await getManagedClassroom({
      classroomId: parsed.classroomId,
      supabase,
    });
    const source = await getCourseBuilderBridgeSource({
      sourceId: parsed.sourceId,
      sourceKind: parsed.sourceKind,
      supabase,
    });

    if (source.organizationId && source.organizationId !== classroom.organization_id) {
      throw new Error("This Course Builder source belongs to a different organization.");
    }

    const questionIds = source.eligibleQuestions.map((question) => question.id);

    if (!questionIds.length) {
      throw new Error(
        "No reviewed Library questions are available from this source yet. Review questions first.",
      );
    }

    const title = parsed.title.trim() || `${source.title} assignment`;
    const instructions =
      parsed.instructions.trim() ||
      `Created from Course Builder: ${source.title}. Review before assigning.`;
    const assignedAt =
      parsed.publishMode === "assigned" ? new Date().toISOString() : null;
    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .insert({
        assigned_at: assignedAt,
        classroom_id: classroom.id,
        created_by: profile.id,
        due_at: normalizeDueAt(parsed.dueAt),
        instructions,
        organization_id: classroom.organization_id,
        source_kind: source.kind,
        source_record_id: source.id,
        source_summary: buildAssignmentSourceSummary(source),
        status: parsed.publishMode,
        title,
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

    revalidatePath("/teacher/course-builder");
    revalidatePath(`/teacher/classrooms/${classroom.id}`);
    revalidatePath(`/teacher/classrooms/${classroom.id}/assignments`);
    revalidatePath("/student/work");
    redirectWithSaved(
      `/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`,
      parsed.publishMode === "assigned"
        ? "Course Builder assignment assigned to the classroom."
        : "Course Builder assignment saved as a teacher draft.",
    );
  } catch (error) {
    redirectWithError("/teacher/course-builder", formatActionError(error));
  }
}
