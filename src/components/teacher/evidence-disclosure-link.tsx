"use client";

import type { MouseEvent } from "react";

export function EvidenceDisclosureLink({
  children,
  targetId,
}: {
  children: React.ReactNode;
  targetId: string;
}) {
  function revealEvidence(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    let current: HTMLElement | null = target;
    while (current) {
      if (current instanceof HTMLDetailsElement) current.open = true;
      current = current.parentElement;
    }
    window.history.replaceState(null, "", `#${targetId}`);
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
    });
  }

  return (
    <a
      className="teacher-focus-ring inline-flex min-h-11 items-center rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-50"
      href={`#${targetId}`}
      onClick={revealEvidence}
    >
      {children}
    </a>
  );
}
