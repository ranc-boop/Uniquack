"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export function focusStudyDetails(element: HTMLElement | null) {
  element?.scrollIntoView({ behavior: "smooth", block: "start" });
  element?.focus({ preventScroll: true });
}

export function PracticeAssignmentHandoff({
  assignmentId,
  visible,
}: {
  assignmentId?: string | null;
  visible: boolean;
}) {
  if (!assignmentId || !visible) return null;

  return (
    <section
      aria-labelledby="assignment-round-next-step-heading"
      className="student-panel p-5"
    >
      <p className="student-eyebrow">Assignment round saved</p>
      <h2
        className="mt-2 text-lg font-bold text-slate-950"
        id="assignment-round-next-step-heading"
      >
        Choose what to do next
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Review this Assignment and teacher feedback, or return to My Work. Your
        Practice evidence is already saved.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild className="min-h-11">
          <Link href={`/student/work/${assignmentId}`}>
            Review this Assignment
          </Link>
        </Button>
        <Button asChild className="min-h-11" variant="outline">
          <Link href="/student/work">Back to My Work</Link>
        </Button>
      </div>
    </section>
  );
}
