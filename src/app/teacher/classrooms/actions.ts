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
} from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";

const classroomCreateSchema = z.object({
  description: z.string().trim().max(2000).optional().default(""),
  name: z.string().trim().min(1).max(120),
  requestId: z.string().uuid(),
  subject: z.string().trim().max(120).optional().default(""),
});

const classroomStudentRemoveSchema = z.object({
  classroomId: z.string().uuid(),
  confirmRemoval: z.literal("yes"),
  memberId: z.string().uuid(),
});

const classroomJoinCodeCreateSchema = z.object({
  classroomId: z.string().uuid(),
  redirectTo: z.enum(["overview", "people", "settings", "students"]).optional().default("people"),
});

const classroomJoinCodeLifecycleSchema = z.object({
  classroomId: z.string().uuid(),
});

const classroomSettingsUpdateSchema = z.object({
  classroomId: z.string().uuid(),
  description: z.string().trim().max(2000).optional().default(""),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120).optional().default(""),
});

const classroomArchiveSchema = z.object({
  classroomId: z.string().uuid(),
  confirmArchive: z.literal("yes"),
});

const classroomReopenSchema = z.object({
  classroomId: z.string().uuid(),
});

const classroomStudentRestoreSchema = z.object({
  classroomId: z.string().uuid(),
  memberId: z.string().uuid(),
});

const classroomCoTeacherAddSchema = z.object({
  classroomId: z.string().uuid(),
  teacherLookup: z.string().trim().min(3).max(180),
});

const classroomCoTeacherRemoveSchema = z.object({
  classroomId: z.string().uuid(),
  confirmRemoval: z.literal("yes"),
  memberId: z.string().uuid(),
});

type ClassroomActionClient = Awaited<ReturnType<typeof createClient>>;

function classroomPath(classroomId: string, section: "overview" | "people" | "settings" | "students" | "teachers") {
  if (section === "overview") return `/teacher/classrooms/${classroomId}`;
  return `/teacher/classrooms/${classroomId}/${section}`;
}

async function getManagedClassroomForAction({
  classroomId,
  supabase,
}: {
  classroomId: string;
  supabase: ClassroomActionClient;
}) {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, organization_id, owner_id, name, status")
    .eq("id", classroomId)
    .single();

  if (error) {
    throw new Error("Classroom was not found or you no longer manage it.");
  }

  return data;
}

async function getOwnerClassroomForAction({
  classroomId,
  profileId,
  supabase,
}: {
  classroomId: string;
  profileId: string;
  supabase: ClassroomActionClient;
}) {
  const classroom = await getManagedClassroomForAction({ classroomId, supabase });

  if (classroom.owner_id !== profileId) {
    throw new Error("Only the classroom owner can manage co-teachers.");
  }

  return classroom;
}

async function insertJoinCode({
  classroomId,
  profileId,
  supabase,
}: {
  classroomId: string;
  profileId: string;
  supabase: ClassroomActionClient;
}) {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const joinCode = generateClassroomJoinCode();
    const { error: insertError } = await supabase.from("classroom_join_codes").insert({
      classroom_id: classroomId,
      code_hash: hashClassroomJoinCode(joinCode),
      code_hint: classroomJoinCodeHint(joinCode),
      created_by: profileId,
      display_code: joinCode,
      status: "active",
    });

    if (!insertError) return joinCode;

    lastError = insertError.message;
    if (insertError.code !== "23505") break;
  }

  throw new Error(lastError ?? "Could not create a classroom join code.");
}

function revalidateClassroom(classroomId: string) {
  revalidatePath("/teacher/classrooms");
  revalidatePath(`/teacher/classrooms/${classroomId}`);
  revalidatePath(`/teacher/classrooms/${classroomId}/people`);
  revalidatePath(`/teacher/classrooms/${classroomId}/students`);
  revalidatePath(`/teacher/classrooms/${classroomId}/teachers`);
  revalidatePath(`/teacher/classrooms/${classroomId}/settings`);
  revalidatePath(`/teacher/classrooms/${classroomId}/assignments`);
  revalidatePath(`/teacher/classrooms/${classroomId}/analytics`);
  revalidatePath(`/teacher/classrooms/${classroomId}/blueprints`);
  revalidatePath("/teacher/publish");
}

export async function createClassroom(formData: FormData) {
  try {
    await requireTeacher();
    const parsed = classroomCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data: createdClassrooms, error: classroomError } = await supabase.rpc(
      "create_teacher_classroom",
      {
        p_description: parsed.description || null,
        p_name: parsed.name,
        p_organization_id: null,
        p_request_id: parsed.requestId,
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

    const displayCode = createdClassroom.display_code;

    if (!displayCode) {
      throw new Error("Classroom creation did not return a join code.");
    }

    revalidatePath("/teacher/classrooms");
    redirectWithSaved(
      `/teacher/classrooms/${createdClassroom.classroom_id}?newCode=${encodeURIComponent(displayCode)}`,
      "Classroom created. The join code is also available on the class page.",
    );
  } catch (error) {
    redirectWithError("/teacher/classrooms", formatActionError(error));
  }
}

export async function createClassroomJoinCode(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = classroomJoinCodeCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const classroom = await getManagedClassroomForAction({
      classroomId: parsed.classroomId,
      supabase,
    });

    if (classroom.status !== "active") {
      throw new Error("Reopen this classroom before enabling student joins.");
    }

    const { data: existingCodes, error: existingError } = await supabase
      .from("classroom_join_codes")
      .select("display_code")
      .eq("classroom_id", parsed.classroomId)
      .eq("status", "active")
      .not("display_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingCode = existingCodes?.[0]?.display_code;
    if (existingCode) {
      revalidateClassroom(parsed.classroomId);
      redirectWithSaved(
        `${classroomPath(parsed.classroomId, parsed.redirectTo)}?newCode=${encodeURIComponent(existingCode)}`,
        "This classroom already has an active join code.",
      );
    }

    const joinCode = await insertJoinCode({
      classroomId: parsed.classroomId,
      profileId: profile.id,
      supabase,
    });
    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `${classroomPath(parsed.classroomId, parsed.redirectTo)}?newCode=${encodeURIComponent(joinCode)}`,
      "Class join code created. Students can use it to join the roster only.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/people`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function rotateClassroomJoinCode(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = classroomJoinCodeLifecycleSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const classroom = await getManagedClassroomForAction({
      classroomId: parsed.classroomId,
      supabase,
    });

    if (classroom.status !== "active") {
      throw new Error("Reopen this classroom before rotating the join code.");
    }

    const { error: revokeError } = await supabase
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", parsed.classroomId)
      .eq("status", "active");

    if (revokeError) throw new Error(revokeError.message);

    const joinCode = await insertJoinCode({
      classroomId: parsed.classroomId,
      profileId: profile.id,
      supabase,
    });
    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/settings?newCode=${encodeURIComponent(joinCode)}`,
      "Join code rotated. Previous active codes are revoked.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/settings`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function disableClassroomJoining(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    await requireTeacher();
    const parsed = classroomJoinCodeLifecycleSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    await getManagedClassroomForAction({ classroomId: parsed.classroomId, supabase });

    const { error } = await supabase
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", parsed.classroomId)
      .eq("status", "active");

    if (error) throw new Error(error.message);

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/settings`,
      "Student joining disabled. Existing history remains available.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/settings`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function updateClassroomSettings(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = classroomSettingsUpdateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    await getManagedClassroomForAction({ classroomId: parsed.classroomId, supabase });

    const { error } = await supabase
      .from("classrooms")
      .update({
        description: parsed.description || null,
        name: parsed.name,
        subject: parsed.subject || null,
        updated_by: profile.id,
      })
      .eq("id", parsed.classroomId);

    if (error) throw new Error(error.message);

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/settings`,
      "Classroom settings saved.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/settings`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function archiveClassroom(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = classroomArchiveSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    await getManagedClassroomForAction({ classroomId: parsed.classroomId, supabase });

    const { error: classroomError } = await supabase
      .from("classrooms")
      .update({ status: "archived", updated_by: profile.id })
      .eq("id", parsed.classroomId);

    if (classroomError) throw new Error(classroomError.message);

    const { error: joinCodeError } = await supabase
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", parsed.classroomId)
      .eq("status", "active");

    if (joinCodeError) throw new Error(joinCodeError.message);

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/settings`,
      "Classroom archived. New joins and new publishing targets are blocked; history remains readable.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/settings`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function reopenClassroom(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = classroomReopenSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    await getManagedClassroomForAction({ classroomId: parsed.classroomId, supabase });

    const { error } = await supabase
      .from("classrooms")
      .update({ status: "active", updated_by: profile.id })
      .eq("id", parsed.classroomId);

    if (error) throw new Error(error.message);

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/settings`,
      "Classroom reopened. Create or rotate a join code when you want students to join.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/settings`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
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

    const { error: updateError } = await supabase.rpc(
      "set_classroom_student_membership_status",
      {
        p_classroom_id: parsed.classroomId,
        p_member_id: parsed.memberId,
        p_status: "removed",
      },
    );

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/students`,
      "Student removed from this classroom. Their source Library access remains unchanged.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/students`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function restoreClassroomStudent(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    await requireTeacher();
    const parsed = classroomStudentRestoreSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const classroom = await getManagedClassroomForAction({
      classroomId: parsed.classroomId,
      supabase,
    });

    if (classroom.status !== "active") {
      throw new Error("Reopen this classroom before restoring students to the active roster.");
    }

    const { data: member, error: memberError } = await supabase
      .from("classroom_members")
      .select("id, classroom_id, role, status")
      .eq("id", parsed.memberId)
      .eq("classroom_id", parsed.classroomId)
      .single();

    if (memberError) throw new Error(memberError.message);
    if (member.role !== "student") {
      throw new Error("Only student memberships can be restored from this action.");
    }

    const { error: updateError } = await supabase.rpc(
      "set_classroom_student_membership_status",
      {
        p_classroom_id: parsed.classroomId,
        p_member_id: parsed.memberId,
        p_status: "active",
      },
    );

    if (updateError) throw new Error(updateError.message);

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/students`,
      "Student restored to the active roster. Historical evidence was unchanged.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/students`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function addClassroomCoTeacher(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = classroomCoTeacherAddSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    await getOwnerClassroomForAction({
      classroomId: parsed.classroomId,
      profileId: profile.id,
      supabase,
    });

    const lookup = parsed.teacherLookup.toLowerCase();
    const query = lookup.includes("@")
      ? supabase
          .from("profiles")
          .select("id, role, status, email, username")
          .eq("email", lookup)
          .maybeSingle()
      : supabase
          .from("profiles")
          .select("id, role, status, email, username")
          .eq("username", lookup)
          .maybeSingle();
    const { data: teacherProfile, error: lookupError } = await query;

    if (lookupError) throw new Error(lookupError.message);
    if (!teacherProfile || teacherProfile.status !== "active") {
      throw new Error("No active teacher account was found for that email or username.");
    }
    if (!["teacher", "admin", "super_admin"].includes(teacherProfile.role)) {
      throw new Error("Only teacher-capable accounts can be added as co-teachers.");
    }
    if (teacherProfile.id === profile.id) {
      throw new Error("You are already the classroom owner.");
    }

    const { error: coTeacherError } = await supabase.rpc("add_classroom_co_teacher", {
      p_classroom_id: parsed.classroomId,
      p_teacher_user_id: teacherProfile.id,
    });

    if (coTeacherError) throw new Error(coTeacherError.message);

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/teachers`,
      "Co-teacher added for classroom operations only. Source Library membership was not changed.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/teachers`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}

export async function removeClassroomCoTeacher(formData: FormData) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");

  try {
    const profile = await requireTeacher();
    const parsed = classroomCoTeacherRemoveSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    await getOwnerClassroomForAction({
      classroomId: parsed.classroomId,
      profileId: profile.id,
      supabase,
    });

    const { data: member, error: memberError } = await supabase
      .from("classroom_members")
      .select("id, classroom_id, role, status, user_id")
      .eq("id", parsed.memberId)
      .eq("classroom_id", parsed.classroomId)
      .single();

    if (memberError) throw new Error(memberError.message);
    if (member.role !== "co_teacher") {
      throw new Error("Only co-teacher memberships can be removed from this action.");
    }
    if (member.user_id === profile.id) {
      throw new Error("The classroom owner cannot remove themselves.");
    }

    const { error } = await supabase.rpc("remove_classroom_co_teacher", {
      p_classroom_id: parsed.classroomId,
      p_member_id: parsed.memberId,
    });

    if (error) throw new Error(error.message);

    revalidateClassroom(parsed.classroomId);
    redirectWithSaved(
      `/teacher/classrooms/${parsed.classroomId}/teachers`,
      "Co-teacher removed from classroom operations. Library access was not changed.",
    );
  } catch (error) {
    const path = fallbackClassroomId
      ? `/teacher/classrooms/${fallbackClassroomId}/teachers`
      : "/teacher/classrooms";
    redirectWithError(path, formatActionError(error));
  }
}
