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
  generateClassroomJoinCode,
  resolveClassroomOrganizationId,
} from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";

const classroomCreateSchema = z.object({
  description: z.string().trim().max(2000).optional().default(""),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120).optional().default(""),
});

const classroomStudentRemoveSchema = z.object({
  classroomId: z.string().uuid(),
  memberId: z.string().uuid(),
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

    const { data: createdClassrooms, error: classroomError } = await supabase.rpc(
      "create_teacher_classroom",
      {
        p_description: parsed.description || null,
        p_join_code: joinCode,
        p_name: parsed.name,
        p_organization_id: organizationId,
        p_subject: parsed.subject || null,
      },
    );

    if (classroomError) {
      throw new Error(classroomError.message);
    }

    const createdClassroom = Array.isArray(createdClassrooms)
      ? createdClassrooms[0]
      : createdClassrooms;

    if (!createdClassroom?.classroom_id) {
      throw new Error("Classroom creation did not return a classroom id.");
    }

    const displayCode = createdClassroom.display_code || joinCode;

    revalidatePath("/teacher/classrooms");
    redirectWithSaved(
      `/teacher/classrooms/${createdClassroom.classroom_id}?newCode=${encodeURIComponent(displayCode)}`,
      "Classroom created. The join code is also available on the class page.",
    );
  } catch (error) {
    redirectWithError("/teacher/classrooms", formatActionError(error));
  }
}

export async function removeClassroomStudent(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    await requireTeacher();
    const parsed = classroomStudentRemoveSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: member, error: memberError } = await supabase
      .from("classroom_members")
      .select("id, classroom_id, role, status")
      .eq("id", parsed.memberId)
      .eq("classroom_id", parsed.classroomId)
      .single();

    if (memberError) {
      throw new Error(memberError.message);
    }
    if (member.role !== "student") {
      throw new Error("Only student memberships can be removed from this action.");
    }

    const { error: updateError } = await supabase
      .from("classroom_members")
      .update({ status: "removed" })
      .eq("id", parsed.memberId)
      .eq("classroom_id", parsed.classroomId)
      .eq("role", "student");

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath(`/teacher/classrooms/${parsed.classroomId}`);
    revalidatePath(`/teacher/classrooms/${parsed.classroomId}/people`);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/people`,
      "Student removed from this classroom. Their source bank access remains unchanged.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/people`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}
