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
  children: ReactNode;
  fallbackFocusId: string;
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

function restoreElementFocus(elementId: string) {
  const target = document.getElementById(elementId);

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (!target.matches("a, button, input, select, textarea, [tabindex]")) {
    target.tabIndex = -1;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "auto" });
  return document.activeElement === target;
}

export function FocusTaskLink({
  children,
  className,
  fallbackFocusId,
  href,
  returnTo,
  taskKind,
  triggerId,
  ...props
}: FocusTaskLinkProps) {
  const launchesRef = useRef(new Map<string, ParentLaunchState>());
  const nextLaunchTimerRef = useRef(0);
  const [announcement, setAnnouncement] = useState("");
  const [preparedLaunchId, setPreparedLaunchId] = useState("");

  useEffect(() => {
    const launches = launchesRef.current;
    const prepareTimer = window.setTimeout(() => {
      setPreparedLaunchId(randomToken(24));
    }, 0);

    return () => {
      window.clearTimeout(prepareTimer);
      window.clearTimeout(nextLaunchTimerRef.current);
      for (const launch of launches.values()) {
        launch.cleanup();
      }
      launches.clear();
    };
  }, []);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      !preparedLaunchId ||
      !("BroadcastChannel" in window)
    ) {
      return;
    }

    const launchId = preparedLaunchId;
    const connectionNonce = randomToken(16);
    const channel = new BroadcastChannel(focusChannelName(launchId));
    let pendingVisibilityHandler: (() => void) | null = null;
    let cleanupTimer = 0;

    window.clearTimeout(nextLaunchTimerRef.current);
    nextLaunchTimerRef.current = window.setTimeout(() => {
      setPreparedLaunchId(randomToken(24));
    }, 0);

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
        if (restoreElementFocus(triggerId)) {
          setAnnouncement(
            "Preview closed. Focus returned to its launch control.",
          );
        } else {
          const nextTask = Array.from(
            document.querySelectorAll<HTMLElement>(
              `[data-focus-task-kind="${taskKind}"]`,
            ),
          ).find((candidate) => candidate.id !== triggerId);

          if (nextTask && restoreElementFocus(nextTask.id)) {
            setAnnouncement(
              "Preview closed. The original item is no longer available, so focus moved to another available task.",
            );
          } else if (restoreElementFocus(fallbackFocusId)) {
            setAnnouncement(
              "Preview closed. The original item is no longer available, so focus moved to the results.",
            );
          } else {
            setAnnouncement(
              "Preview closed. Its original launch control is no longer available.",
            );
          }
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
        data-focus-launch-ready={preparedLaunchId ? "true" : "false"}
        href={buildFocusHref({
          href,
          launchId: preparedLaunchId,
          returnTo,
        })}
        id={triggerId}
        data-focus-task-kind={taskKind}
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
