"use client";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherReviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <TeacherRouteError
      description="No Review Draft was approved or rejected. Retry the list, or return to Libraries and choose the source again."
      reset={reset}
      returnHref="/teacher/banks"
      returnLabel="Back to Libraries"
      title="Review Drafts could not be loaded"
    />
  );
}
