"use client";

import { CheckCircle2, ExternalLink, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  FOCUS_PROTOCOL_SCHEMA_VERSION,
  focusChannelName,
  isFocusChannelMessage,
  isValidFocusLaunchId,
  type FocusChannelMessage,
  type FocusTaskKind,
} from "@/lib/teacher-focus-workspace";

type ConnectionState =
  | "connected"
  | "connecting"
  | "return_failed"
  | "standalone"
  | "syncing";

export function FocusWorkspaceBridge({
  launchId,
  mainId,
  returnHref,
  returnSurfaceLabel = "Library list",
  taskKind,
}: {
  launchId?: string | null;
  mainId: string;
  returnHref: string;
  returnSurfaceLabel?: string;
  taskKind: FocusTaskKind;
}) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const nonceRef = useRef("");
  const syncTimeoutRef = useRef(0);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>(
      isValidFocusLaunchId(launchId) ? "connecting" : "standalone",
    );

  const sendCompletion = useCallback(() => {
    const channel = channelRef.current;
    const connectionNonce = nonceRef.current;

    if (!channel || !connectionNonce || !isValidFocusLaunchId(launchId)) {
      setConnectionState("standalone");
      return;
    }

    setConnectionState("syncing");
    channel.postMessage({
      connectionNonce,
      event: "completion",
      launchId,
      schemaVersion: FOCUS_PROTOCOL_SCHEMA_VERSION,
      status: "preview_complete",
      statusCounts: { processed: 0, total: 0, unchanged: 0 },
      taskKind,
    } satisfies FocusChannelMessage);

    window.clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = window.setTimeout(() => {
      setConnectionState("return_failed");
    }, 15_000);
  }, [launchId, taskKind]);

  useEffect(() => {
    const main = document.getElementById(mainId);
    main?.focus({ preventScroll: true });

    if (
      !isValidFocusLaunchId(launchId) ||
      !("BroadcastChannel" in window)
    ) {
      const unsupportedTimer = window.setTimeout(
        () => setConnectionState("standalone"),
        0,
      );
      return () => window.clearTimeout(unsupportedTimer);
    }

    const channel = new BroadcastChannel(focusChannelName(launchId));
    channelRef.current = channel;
    const readyMessage = {
      event: "ready",
      launchId,
      schemaVersion: FOCUS_PROTOCOL_SCHEMA_VERSION,
      status: "child_ready",
      statusCounts: { processed: 0, total: 0 },
      taskKind,
    } satisfies FocusChannelMessage;
    const retryTimers = [
      window.setTimeout(() => channel.postMessage(readyMessage), 0),
      window.setTimeout(() => channel.postMessage(readyMessage), 1_000),
      window.setTimeout(() => channel.postMessage(readyMessage), 3_000),
    ];
    const standaloneTimer = window.setTimeout(() => {
      if (!nonceRef.current) setConnectionState("standalone");
    }, 5_000);

    channel.addEventListener("message", (event) => {
      const message = event.data;

      if (
        !isFocusChannelMessage(message) ||
        message.launchId !== launchId ||
        message.taskKind !== taskKind
      ) {
        return;
      }

      if (
        message.event === "parent-ack" &&
        message.connectionNonce &&
        !nonceRef.current
      ) {
        nonceRef.current = message.connectionNonce;
        setConnectionState("connected");
        return;
      }

      if (
        message.event === "completion-ack" &&
        message.connectionNonce === nonceRef.current
      ) {
        window.clearTimeout(syncTimeoutRef.current);
        window.close();
        window.setTimeout(() => setConnectionState("return_failed"), 350);
      }
    });

    return () => {
      for (const timer of retryTimers) window.clearTimeout(timer);
      window.clearTimeout(standaloneTimer);
      window.clearTimeout(syncTimeoutRef.current);
      channel.close();
      channelRef.current = null;
    };
  }, [launchId, mainId, taskKind]);

  const statusCopy =
    connectionState === "connected"
      ? `The original ${returnSurfaceLabel} is connected. Closing this preview will restore your previous position.`
      : connectionState === "syncing"
        ? `Updating the original ${returnSurfaceLabel} before closing this preview.`
        : connectionState === "return_failed"
          ? `The preview is safe to close, but the original ${returnSurfaceLabel} has not confirmed return yet.`
          : connectionState === "standalone"
            ? `The original ${returnSurfaceLabel} is unavailable. This tab will stay open.`
            : `Connecting to the original ${returnSurfaceLabel}.`;

  return (
    <section
      aria-label="Preview return controls"
      className="rounded-lg border border-sky-200 bg-sky-50/70 p-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-sky-700"
          />
          <div>
            <p className="text-sm font-bold text-slate-950">
              Focused preview
            </p>
            <p
              aria-atomic="true"
              aria-live="polite"
              className="mt-1 text-sm leading-6 text-slate-600"
              role="status"
            >
              {statusCopy}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {connectionState === "connected" ? (
            <Button onClick={sendCompletion} type="button">
              <X aria-hidden="true" />
              Close and return
            </Button>
          ) : null}
          {connectionState === "syncing" ? (
            <Button disabled type="button">
              <RefreshCw
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              Syncing original {returnSurfaceLabel}
            </Button>
          ) : null}
          {connectionState === "return_failed" ? (
            <Button onClick={sendCompletion} type="button">
              <RefreshCw aria-hidden="true" />
              Retry return sync
            </Button>
          ) : null}
          {connectionState === "standalone" ||
          connectionState === "return_failed" ? (
            <>
              <Button asChild variant="outline">
                <a
                  href={returnHref}
                  referrerPolicy="no-referrer"
                  rel="noreferrer"
                >
                  <ExternalLink aria-hidden="true" />
                  Open original {returnSurfaceLabel} in this tab
                </a>
              </Button>
              <Button
                onClick={() => window.close()}
                type="button"
                variant="outline"
              >
                <X aria-hidden="true" />
                Close this tab
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <noscript>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Automatic return is unavailable without JavaScript. Close this tab
          with your browser, or{" "}
          <a
            className="font-semibold text-sky-800 underline"
            href={returnHref}
            referrerPolicy="no-referrer"
            rel="noreferrer"
          >
            open the original {returnSurfaceLabel} in this tab
          </a>
          .
        </p>
      </noscript>
    </section>
  );
}
