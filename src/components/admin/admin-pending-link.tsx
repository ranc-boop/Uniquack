"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import {
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";

type AdminPendingLinkProps = {
  "aria-current"?: "page" | "true";
  children: ReactNode;
  className?: string;
  href: string;
  pendingLabel: string;
  title?: string;
};

export function AdminPendingLink({
  "aria-current": ariaCurrent,
  children,
  className,
  href,
  pendingLabel,
  title,
}: AdminPendingLinkProps) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const waiting = isPending && pendingHref === href;

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
    startTransition(() => router.push(href));
  }

  return (
    <Link
      aria-busy={waiting || undefined}
      aria-current={ariaCurrent}
      className={className}
      href={href}
      onClick={navigate}
      onFocus={prefetchTarget}
      onMouseEnter={prefetchTarget}
      prefetch={false}
      title={title}
    >
      {waiting ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:animate-spin"
        />
      ) : null}
      {children}
      {waiting ? <span className="sr-only">Loading {pendingLabel}</span> : null}
    </Link>
  );
}
