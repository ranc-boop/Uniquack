"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import {
  forwardRef,
  useState,
  useTransition,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";

export type RoutePendingLinkProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  "href"
> & {
  feedback?: "inline" | "page";
  href: string;
  pendingLabel?: string;
};

export const RoutePendingLink = forwardRef<
  HTMLAnchorElement,
  RoutePendingLinkProps
>(function RoutePendingLink({
  children,
  feedback = "inline",
  href,
  onClick,
  onFocus,
  onMouseEnter,
  pendingLabel = "Opening…",
  target,
  ...props
}, ref) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const waiting = isPending && pendingHref === href;
  const showInlineFeedback = feedback === "inline" && waiting;

  function prefetchTarget() {
    router.prefetch(href);
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === "_blank"
    ) {
      return;
    }

    const targetUrl = new URL(href, window.location.href);
    if (
      targetUrl.origin !== window.location.origin ||
      targetUrl.hash ||
      `${targetUrl.pathname}${targetUrl.search}` ===
        `${window.location.pathname}${window.location.search}`
    ) {
      return;
    }

    event.preventDefault();
    setPendingHref(href);
    startTransition(() => router.push(href));
  }

  return (
    <Link
      {...props}
      aria-busy={waiting || undefined}
      data-route-progress={feedback === "page" ? "page" : undefined}
      href={href}
      onClick={navigate}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) prefetchTarget();
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) prefetchTarget();
      }}
      prefetch={false}
      ref={ref}
      target={target}
    >
      {showInlineFeedback ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:animate-spin"
        />
      ) : null}
      {children}
      {showInlineFeedback ? <span aria-live="polite" className="sr-only" role="status">Loading {pendingLabel}</span> : null}
    </Link>
  );
});
