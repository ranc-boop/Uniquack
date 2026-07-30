import { ArrowRight, ExternalLink } from "lucide-react";
import {
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

import { buildFocusHref } from "@/lib/teacher-focus-workspace";
import type { FocusTaskKind } from "@/lib/teacher-focus-workspace";
import { cn } from "@/lib/utils";

type FocusTaskLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children" | "href" | "target"
> & {
  children: ReactNode;
  href: string;
  newTabLabel?: string;
  returnTo: string;
  taskKind: FocusTaskKind;
  triggerId: string;
};

/**
 * Focused work stays in the current tab by default. The link remains a native
 * anchor so teachers can still use the browser's open-in-new-tab affordances.
 */
export function FocusTaskLink({
  children,
  className,
  href,
  newTabLabel,
  returnTo,
  taskKind,
  triggerId,
  ...props
}: FocusTaskLinkProps) {
  const focusHref = buildFocusHref({ href, returnTo });

  return (
    <span className="inline-flex items-stretch gap-1">
      <a
        {...props}
        className={cn(
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
          className,
        )}
        data-focus-task-kind={taskKind}
        href={focusHref}
        id={triggerId}
        referrerPolicy="no-referrer"
      >
        {children}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </a>
      {newTabLabel ? (
        <a
          aria-label={`${newTabLabel} (opens in new tab)`}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          href={focusHref}
          referrerPolicy="no-referrer"
          rel="noopener noreferrer"
          target="_blank"
          title={`${newTabLabel} (opens in new tab)`}
        >
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          <span>Open in new tab</span>
        </a>
      ) : null}
    </span>
  );
}

export function FocusTaskForm({
  bankId,
  children,
  className,
  destination,
  returnTo,
  selectedIds,
  taskKind,
  triggerId,
}: {
  bankId: string;
  children: ReactNode;
  className?: string;
  destination: "question_preview" | "review_preview";
  returnTo: string;
  selectedIds: string[];
  taskKind: FocusTaskKind;
  triggerId: string;
}) {
  return (
    <form action="/api/teacher/focus-selections" className="inline-flex" method="post">
      <input name="bankId" type="hidden" value={bankId} />
      <input name="destination" type="hidden" value={destination} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {selectedIds.map((selectedId) => (
        <input
          key={selectedId}
          name="selectedId"
          type="hidden"
          value={selectedId}
        />
      ))}
      <button
        className={cn(
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
          className,
        )}
        data-focus-task-kind={taskKind}
        disabled={!selectedIds.length}
        id={triggerId}
        type="submit"
      >
        {children}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </form>
  );
}
