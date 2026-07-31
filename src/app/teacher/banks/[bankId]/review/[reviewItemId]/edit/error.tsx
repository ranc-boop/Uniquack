"use client";

import { usePathname } from "next/navigation";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherQuestionEditError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const returnHref = pathname.replace(/\/review\/[^/]+\/edit\/?$/, "/review");

  return (
    <TeacherRouteError
      description="Retry the editor or return to Review."
      reset={reset}
      returnHref={returnHref}
      returnLabel="Back to Review"
      title="Question editor could not be loaded"
    />
  );
}
