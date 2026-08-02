"use client";

import Link from "next/link";

import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function PracticeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm" role="alert">
        <AlertTriangle aria-hidden="true" className="h-8 w-8 text-amber-700" />
        <h1 className="mt-4 text-2xl font-bold">Practice hit a recoverable error</h1>
        <p className="mt-2 leading-7">
          Your saved sessions and submitted evidence are still stored. Retry this view; if the
          current round is no longer active, Practice will restore the latest saved state.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={reset} type="button">
            <RefreshCcw aria-hidden="true" className="h-4 w-4" />
            Retry Practice
          </Button>
          <Button asChild variant="outline">
            <Link href="/practice">Return to Practice home</Link>
          </Button>
        </div>
        {error.digest ? (
          <p className="mt-4 text-xs text-amber-800">Reference: {error.digest}</p>
        ) : null}
      </section>
    </main>
  );
}
