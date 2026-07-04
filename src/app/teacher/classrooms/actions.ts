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
  classroomJoinCodeHint,
  generateClassroomJoinCode,
  hashClassroomJoinCode,
  resolveClassroomOrganizationId,
} from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";

const classroomCreateSchema = z.object({
  description: z.string().trim().max(2000).optional().default(""),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120).optional().default(""),
});

export async function createClassroom(formData: FormData) {
  try {
    const profile = await requireTeacher();
    const parsed = classroomCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const organizationId = await resolveClassroomOrganizationId({
      allowedRoles: ["admin", "teacher"],
      profile,
      supabase,
    });
    const joinCode = generateClassroomJoinCode();

    const { data: classroom, error: classroomError } = await supabase
      .from("classrooms")
      .insert({
        created_by: profile.id,
        description: parsed.description || null,
        name: parsed.name,
        organization_id: organizationId,
        owner_id: profile.id,
        subject: parsed.subject || null,
        updated_by: profile.id,
      })
      .select("id")
      .single();

    if (classroomError) {
      throw new Error(classroomError.message);
    }

    const { error: memberError } = await supabase
      .from("classroom_members")
      .insert({
        classroom_id: classroom.id,
        joined_at: new Date().toISOString(),
        role: "teacher",
        status: "active",
        user_id: profile.id,
      });

    if (memberError) {
      throw new Error(memberError.message);
    }

    const { error: joinCodeError } = await supabase
      .from("classroom_join_codes")
      .insert({
        classroom_id: classroom.id,
        code_hash: hashClassroomJoinCode(joinCode),
        code_hint: classroomJoinCodeHint(joinCode),
        created_by: profile.id,
        status: "active",
      });

    if (joinCodeError) {
      throw new Error(joinCodeError.message);
    }

    revalidatePath("/teacher/classrooms");
    redirectWithSaved(
      `/teacher/classrooms/${classroom.id}?newCode=${encodeURIComponent(joinCode)}`,
      "Classroom created. Copy the join code now.",
    );
  } catch (error) {
    redirectWithError("/teacher/classrooms", formatActionError(error));
  }
}
