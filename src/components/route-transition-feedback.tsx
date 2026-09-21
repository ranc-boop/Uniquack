"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/i18n/locale-provider";

type ProgressPhase = "complete" | "idle" | "loading";

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
  const { t } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [phase, setPhase] = useState<ProgressPhase>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTarget = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    if (!pendingTarget || pendingTarget !== currentTarget) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    completionRef.current = setTimeout(() => setPhase("complete"), 0);
    idleRef.current = setTimeout(() => {
      setPendingTarget(null);
      setPhase("idle");
    }, 180);
    return () => {
      if (completionRef.current) clearTimeout(completionRef.current);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [currentTarget, pendingTarget]);

  useEffect(() => {
    function beginNavigation(event: MouseEvent) {
      const element = event.target;
      if (!(element instanceof Element)) return;
      const anchor = element.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.dataset.routeProgress !== "page") return;
      if (!isPlainInternalNavigation(event, anchor)) return;

      setPendingTarget(`${new URL(anchor.href).pathname}${new URL(anchor.href).search}`);
      setPhase("loading");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setPendingTarget(null);
        setPhase("idle");
      }, 10_000);
    }

    document.addEventListener("click", beginNavigation, true);
    return () => {
      document.removeEventListener("click", beginNavigation, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (completionRef.current) clearTimeout(completionRef.current);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, []);

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={`route-progress is-${phase}`}
      role="status"
    >
      <span className="route-progress-bar" />
      <span className="sr-only">{phase === "loading" ? t("common.loadingPage") : ""}</span>
    </div>
  );
}
