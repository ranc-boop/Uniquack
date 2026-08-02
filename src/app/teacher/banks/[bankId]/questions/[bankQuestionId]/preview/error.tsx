"use client";

import { usePathname } from "next/navigation";

import { TeacherRouteError } from "@/components/teacher/teacher-route-error";

export default function TeacherQuestionPreviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const returnHref = pathname.replace(
    /\/questions\/[^/]+\/preview\/?$/,
    "/questions",
  );

  return (
    <TeacherRouteError
      description="The read-only question preview did not change this Library. Retry it or return to the question list."
      reset={reset}
      returnHref={returnHref}
      returnLabel="Back to Library questions"
      title="Question preview could not be loaded"
    />
  );
}
