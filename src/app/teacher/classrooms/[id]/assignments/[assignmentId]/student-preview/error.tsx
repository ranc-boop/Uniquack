"use client";

import { usePathname } from "next/navigation";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherStudentPreviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const assignmentHref = pathname.replace(/\/student-preview\/?$/, "");

  return (
    <TeacherRouteError
      description="The read-only student view did not change the Assignment. Retry it or return to Assignment detail."
      reset={reset}
      returnHref={assignmentHref}
      returnLabel="Back to Assignment detail"
      title="Student preview could not be loaded"
    />
  );
}
