"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export function FocusWorkspaceBridge({
  mainId,
  returnHref,
  returnSurfaceLabel = "Library list",
}: {
  mainId: string;
  returnHref: string;
  returnSurfaceLabel?: string;
}) {
  useEffect(() => {
    document.getElementById(mainId)?.focus({ preventScroll: true });
  }, [mainId]);

  return (
    <section
      aria-label="Preview navigation"
      className="flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-sm font-bold text-slate-950">
          Focused, read-only workspace
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {returnSurfaceLabel === "Assignment detail"
            ? "Return to Assignment detail when you finish. This preview does not change the Assignment."
            : `Return to ${returnSurfaceLabel} when you finish. Your filters, page, selection, and scroll position are preserved on this device.`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button asChild className="min-h-11 whitespace-normal">
          <a
            href={returnHref}
            referrerPolicy="no-referrer"
          >
            <ArrowLeft aria-hidden="true" />
            Back to {returnSurfaceLabel}
          </a>
        </Button>
        <Button
          asChild
          className="min-h-11 whitespace-normal"
          variant="outline"
        >
          <a
            aria-label={`Open ${returnSurfaceLabel} in a new tab`}
            href={returnHref}
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" />
            Open in new tab
          </a>
        </Button>
      </div>
    </section>
  );
}
