"use client";

import { usePathname } from "next/navigation";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherReviewPreviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const returnHref = pathname.replace(/\/review\/[^/]+\/?$/, "/review");

  return (
    <TeacherRouteError
      description="The read-only preview did not approve or change this Review Draft. Retry it or return to Review."
      reset={reset}
      returnHref={returnHref}
      returnLabel="Back to Review"
      title="Review Draft preview could not be loaded"
    />
  );
}
