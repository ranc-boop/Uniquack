"use client";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherProgressError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <TeacherRouteError
      description="No student evidence was changed. Retry the read, or return to the Teacher Workspace and continue another task."
      reset={reset}
      returnHref="/teacher"
      returnLabel="Teacher Workspace"
      title="Student evidence could not be loaded"
    />
  );
}
