import { notFound, redirect } from "next/navigation";

import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getManagedClassroom } from "@/lib/teacher-assignments";

export const dynamic = "force-dynamic";

export default async function NewTeacherAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTeacher();
  const { id } = await params;
  const supabase = await createClient();

  try {
    const classroom = await getManagedClassroom({
      classroomId: id,
      supabase,
    });

    if (!classroom || classroom.status !== "active") notFound();
  } catch {
    notFound();
  }

  redirect(`/teacher/publish?classroomId=${encodeURIComponent(id)}`);
}
