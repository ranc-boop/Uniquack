"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

export function TeacherRouteError({
  description,
  reset,
  returnHref,
  returnLabel,
  title,
}: {
  description: string;
  reset: () => void;
  returnHref: string;
  returnLabel: string;
  title: string;
}) {
  const alertRef = useRef<HTMLElement>(null);

  useEffect(() => {
    alertRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="teacher-shell">
      <section
        className="teacher-panel mx-auto max-w-3xl p-6 sm:p-8"
        ref={alertRef}
        role="alert"
        tabIndex={-1}
      >
        <p className="teacher-eyebrow">Could not load this workspace</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button className="min-h-11" onClick={reset} type="button">
            Try again
          </Button>
          <Button asChild className="min-h-11" variant="outline">
            <Link href={returnHref}>{returnLabel}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
