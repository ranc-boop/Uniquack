"use client";

import { ExternalLink } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  buildFocusHref,
  FOCUS_PROTOCOL_SCHEMA_VERSION,
  focusChannelName,
  isFocusChannelMessage,
  type FocusChannelMessage,
  type FocusTaskKind,
} from "@/lib/teacher-focus-workspace";
import { cn } from "@/lib/utils";

type FocusTaskLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children" | "href" | "onClick" | "target"
> & {
  bankId: string;
  children: ReactNode;
  href: string;
  returnTo: string;
  taskKind: FocusTaskKind;
  triggerId: string;
};

type ParentLaunchState = {
  channel: BroadcastChannel;
  cleanup: () => void;
};

function randomToken(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function restoreTriggerFocus(triggerId: string) {
  const target = document.getElementById(triggerId);

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "auto" });
  return document.activeElement === target;
}

export function FocusTaskLink({
  bankId,
  children,
  className,
  href,
  returnTo,
  taskKind,
  triggerId,
  ...props
}: FocusTaskLinkProps) {
  const launchesRef = useRef(new Map<string, ParentLaunchState>());
  const [announcement, setAnnouncement] = useState("");

  useEffect(
    () => () => {
      for (const launch of launchesRef.current.values()) {
        launch.cleanup();
      }
      launchesRef.current.clear();
    },
    [],
  );

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      !("BroadcastChannel" in window)
    ) {
      return;
    }

    const launchId = randomToken(24);
    const launchHref = buildFocusHref({ href, launchId, returnTo });
    const connectionNonce = randomToken(16);
    const channel = new BroadcastChannel(focusChannelName(launchId));
    const storageKey = `edustruct:focus-launch:${launchId}`;
    let pendingVisibilityHandler: (() => void) | null = null;
    let cleanupTimer = 0;

    event.currentTarget.href = launchHref;

    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          bankId,
          createdAt: Date.now(),
          launchId,
          parentLocation: `${window.location.pathname}${window.location.search}`,
          returnTo,
          taskKind,
          triggerId,
        }),
      );
    } catch {
      // Coordination remains optional. The child keeps a safe same-tab return.
    }

    const cleanup = () => {
      if (pendingVisibilityHandler) {
        document.removeEventListener(
          "visibilitychange",
          pendingVisibilityHandler,
        );
      }
      window.clearTimeout(cleanupTimer);
      channel.close();
      launchesRef.current.delete(launchId);
    };

    const acknowledgeCompletion = () => {
      const focusNow = () => {
        restoreTriggerFocus(triggerId);
        setAnnouncement("Preview closed. Focus returned to its launch control.");
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          // Non-critical cleanup only.
        }
      };

      if (document.visibilityState === "visible") {
        focusNow();
      } else {
        pendingVisibilityHandler = () => {
          if (document.visibilityState !== "visible") return;
          focusNow();
          if (pendingVisibilityHandler) {
            document.removeEventListener(
              "visibilitychange",
              pendingVisibilityHandler,
            );
            pendingVisibilityHandler = null;
          }
        };
        document.addEventListener("visibilitychange", pendingVisibilityHandler);
      }

      const ack: FocusChannelMessage = {
        connectionNonce,
        event: "completion-ack",
        launchId,
        schemaVersion: FOCUS_PROTOCOL_SCHEMA_VERSION,
        status: "parent_ready",
        statusCounts: { processed: 0, total: 0 },
        taskKind,
      };
      channel.postMessage(ack);
      window.setTimeout(() => {
        window.clearTimeout(cleanupTimer);
        channel.close();
        launchesRef.current.delete(launchId);
      }, 750);
    };

    channel.addEventListener("message", (messageEvent) => {
      const message = messageEvent.data;

      if (
        !isFocusChannelMessage(message) ||
        message.launchId !== launchId ||
        message.taskKind !== taskKind
      ) {
        return;
      }

      if (message.event === "ready") {
        channel.postMessage({
          connectionNonce,
          event: "parent-ack",
          launchId,
          schemaVersion: FOCUS_PROTOCOL_SCHEMA_VERSION,
          status: "parent_connected",
          statusCounts: { processed: 0, total: 0 },
          taskKind,
        } satisfies FocusChannelMessage);
        return;
      }

      if (
        message.event === "completion" &&
        message.connectionNonce === connectionNonce &&
        message.status === "preview_complete"
      ) {
        acknowledgeCompletion();
      }
    });

    cleanupTimer = window.setTimeout(cleanup, 10 * 60 * 1000);
    launchesRef.current.set(launchId, { channel, cleanup });
  }

  return (
    <>
      <a
        {...props}
        className={cn(
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
          className,
        )}
        href={buildFocusHref({ href, returnTo })}
        id={triggerId}
        onClick={handleClick}
        referrerPolicy="no-referrer"
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
        <ExternalLink aria-hidden="true" className="h-4 w-4" />
        <span>Opens in new tab</span>
      </a>
      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {announcement}
      </span>
    </>
  );
}
