"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const resumeSchema = z.object({
  assignmentId: z.string().uuid(),
  classroomId: z.string().uuid(),
});

export async function resumeQuarantinedAssignment(formData: FormData) {
  const classroomId = String(formData.get("classroomId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const fallbackPath =
    classroomId && assignmentId
      ? `/teacher/classrooms/${classroomId}/assignments/${assignmentId}`
      : "/teacher/classrooms";

  try {
    await requireTeacher();
    const parsed = resumeSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.rpc("resume_quarantined_assignment", {
      p_assignment_id: parsed.assignmentId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(
      `/teacher/classrooms/${parsed.classroomId}/assignments/${parsed.assignmentId}`,
    );
    revalidatePath(`/teacher/classrooms/${parsed.classroomId}/assignments`);
    revalidatePath("/student/work");
    redirectWithSaved(
      fallbackPath,
      "Assignment delivery resumed. Existing student progress was preserved.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

