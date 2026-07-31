"use client";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherPublishError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <TeacherRouteError
      description="Your current form remains in this tab when the browser can preserve it. Retry first; if the source changed, return to Libraries and begin from the reviewed content."
      reset={reset}
      returnHref="/teacher/banks"
      returnLabel="Back to Libraries"
      title="Assignment creation is temporarily unavailable"
    />
  );
}
