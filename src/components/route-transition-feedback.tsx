"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isPlainInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  ) {
    return false;
  }

  const target = new URL(anchor.href, window.location.href);
  const current = new URL(window.location.href);
  if (target.origin !== current.origin) return false;
  if (
    target.pathname === current.pathname &&
    target.search === current.search
  ) {
    return false;
  }

  return true;
}

export function RouteTransitionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTarget = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  const pending = pendingTarget !== null && pendingTarget !== currentTarget;

  useEffect(() => {
    function beginNavigation(event: MouseEvent) {
      const element = event.target;
      if (!(element instanceof Element)) return;
      const anchor = element.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isPlainInternalNavigation(event, anchor)) return;

      setPendingTarget(`${new URL(anchor.href).pathname}${new URL(anchor.href).search}`);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setPendingTarget(null), 10_000);
    }

    document.addEventListener("click", beginNavigation, true);
    return () => {
      document.removeEventListener("click", beginNavigation, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={pending ? "route-progress is-active" : "route-progress"}
      role="status"
    >
      <span className="route-progress-bar" />
      <span className="sr-only">{pending ? "Loading page" : ""}</span>
    </div>
  );
}
