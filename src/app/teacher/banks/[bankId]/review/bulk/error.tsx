"use client";

import { usePathname } from "next/navigation";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherReviewBatchPreviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const returnHref = pathname.replace(/\/review\/bulk\/?$/, "/review");

  return (
    <TeacherRouteError
      description="The selected-draft preview did not approve or change any Review Draft. Retry it or return to Review."
      reset={reset}
      returnHref={returnHref}
      returnLabel="Back to Review"
      title="Selected Review Drafts could not be previewed"
    />
  );
}
