import { redirect } from "next/navigation";

import { requireStudentWorkspace } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function StudentStudyGroupsRedirect() {
  await requireStudentWorkspace();
  redirect("/student/classrooms");
}
