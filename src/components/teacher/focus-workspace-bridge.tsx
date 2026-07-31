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
    <nav
      aria-label="Preview navigation"
      className="flex flex-wrap justify-end gap-2"
    >
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
    </nav>
  );
}
