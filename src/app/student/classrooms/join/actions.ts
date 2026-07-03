"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireStudent } from "@/lib/auth/guards";
import { normalizeClassroomJoinCode } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";

const joinClassroomSchema = z.object({
  join_code: z.string().trim().min(6).max(32),
});

export async function joinClassroomByCode(formData: FormData) {
  try {
    await requireStudent();
    const parsed = joinClassroomSchema.parse(Object.fromEntries(formData));
    const joinCode = normalizeClassroomJoinCode(parsed.join_code);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("join_classroom_by_code", {
      join_code: joinCode,
    });

    if (error) {
      throw new Error(error.message);
    }

    const joined = data?.[0];

    if (!joined?.classroom_id) {
      throw new Error("Classroom join did not return a membership.");
    }

    revalidatePath("/student/classrooms");
    redirectWithSaved(
      "/student/classrooms",
      `Joined ${joined.classroom_name}.`,
    );
  } catch (error) {
    redirectWithError("/student/classrooms/join", formatActionError(error));
  }
}
