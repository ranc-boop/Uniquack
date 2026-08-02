"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";

import { LoaderCircle } from "lucide-react";

type TeacherPendingLinkProps = {
  "aria-current"?: "page" | "true";
  children: ReactNode;
  className?: string;
  href: string;
  pendingLabel: string;
};

export function TeacherPendingLink({
  "aria-current": ariaCurrent,
  children,
  className,
  href,
  pendingLabel,
}: TeacherPendingLinkProps) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pending = isTransitionPending && pendingHref === href;

  function prefetchTarget() {
    router.prefetch(href);
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = new URL(href, window.location.href);
    if (
      target.origin !== window.location.origin ||
      target.hash ||
      `${target.pathname}${target.search}` ===
        `${window.location.pathname}${window.location.search}`
    ) {
      return;
    }

    event.preventDefault();
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <Link
      aria-busy={pending || undefined}
      aria-current={ariaCurrent}
      className={className}
      href={href}
      onClick={navigate}
      onFocus={prefetchTarget}
      onMouseEnter={prefetchTarget}
      prefetch={false}
    >
      {pending ? (
        <LoaderCircle
          aria-hidden="true"
          className="h-4 w-4 shrink-0 motion-safe:animate-spin"
        />
      ) : null}
      <span>{children}</span>
      {pending ? <span className="sr-only">Loading {pendingLabel}</span> : null}
    </Link>
  );
}
