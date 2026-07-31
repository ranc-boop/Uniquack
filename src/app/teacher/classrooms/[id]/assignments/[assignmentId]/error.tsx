"use client";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherAssignmentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <TeacherRouteError
      description="The Assignment was not changed. Retry the evidence read, or return to Classrooms to choose another delivery."
      reset={reset}
      returnHref="/teacher/classrooms"
      returnLabel="Back to Classrooms"
      title="Assignment evidence could not be loaded"
    />
  );
}
