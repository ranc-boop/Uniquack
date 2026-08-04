import type {
  AIPdfBurstItemSafeStatus,
  AIPdfBurstSafeItem,
} from "@/lib/ai-pdf-import/burst-contract";

export type PdfBurstLocalPhase =
  | "selected"
  | "reserving"
  | "reserved"
  | "uploading"
  | "finalizing"
  | "failed";

export type PdfBurstLocalRequestState = "cancellation_requested" | null;

export type PdfBurstDisplayStatus =
  | PdfBurstLocalPhase
  | AIPdfBurstItemSafeStatus;

export type PdfBurstDurableSnapshot = Pick<
  AIPdfBurstSafeItem,
  "safeErrorCode" | "status"
>;

const durableProgress: Record<AIPdfBurstItemSafeStatus, number> = {
  reserved: 0,
  finalizing: 1,
  admission_ready: 2,
  queued: 3,
  processing: 4,
  completed: 5,
  failed: 5,
  cancelled: 5,
};

const durableTerminalStatuses = new Set<AIPdfBurstItemSafeStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const cancellableDurableStatuses = new Set<AIPdfBurstItemSafeStatus>([
  "reserved",
  "admission_ready",
  "queued",
]);

type PdfBurstCancellationRequestItem = {
  durableSnapshot: PdfBurstDurableSnapshot | null;
  localRequestState: PdfBurstLocalRequestState;
  localWarningCode: string | null;
};

function sameDurableSnapshot(
  left: PdfBurstDurableSnapshot,
  right: PdfBurstDurableSnapshot,
) {
  return (
    left.status === right.status && left.safeErrorCode === right.safeErrorCode
  );
}

export function mergePdfBurstDurableSnapshot(
  current: PdfBurstDurableSnapshot | null,
  incoming: PdfBurstDurableSnapshot | null | undefined,
): PdfBurstDurableSnapshot | null {
  if (!incoming) return current;
  if (!current) return incoming;
  if (sameDurableSnapshot(current, incoming)) return current;

  if (durableTerminalStatuses.has(current.status)) return current;
  if (durableTerminalStatuses.has(incoming.status)) return incoming;
  if (durableProgress[incoming.status] < durableProgress[current.status]) {
    return current;
  }
  return incoming;
}

export function mergePdfBurstDurableSnapshotsByClientKey<
  Item extends {
    clientItemKey: string;
    durableSnapshot: PdfBurstDurableSnapshot | null;
  },
>(
  items: Item[],
  incomingByClientKey: ReadonlyMap<
    string,
    PdfBurstDurableSnapshot | null | undefined
  >,
) {
  let changed = false;
  const next = items.map((item) => {
    const durableSnapshot = mergePdfBurstDurableSnapshot(
      item.durableSnapshot,
      incomingByClientKey.get(item.clientItemKey),
    );
    if (durableSnapshot === item.durableSnapshot) return item;
    changed = true;
    return { ...item, durableSnapshot };
  });
  return changed ? next : items;
}

export function markPdfBurstCancellationRequested<
  Item extends PdfBurstCancellationRequestItem,
>(items: Item[]): Item[] {
  let changed = false;
  const next = items.map((item) => {
    if (
      !item.durableSnapshot ||
      !cancellableDurableStatuses.has(item.durableSnapshot.status) ||
      (item.localRequestState === "cancellation_requested" &&
        item.localWarningCode === null)
    ) {
      return item;
    }
    changed = true;
    return {
      ...item,
      localRequestState: "cancellation_requested" as const,
      localWarningCode: null,
    };
  });
  return changed ? next : items;
}

export function markPdfBurstCancellationRequestFailed<
  Item extends PdfBurstCancellationRequestItem,
>(items: Item[]): Item[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.localRequestState !== "cancellation_requested") return item;
    changed = true;
    return {
      ...item,
      localRequestState: null,
      localWarningCode: "cancellation_request_failed",
    };
  });
  return changed ? next : items;
}

export function reconcilePdfBurstDisplayState({
  durable,
  localPhase,
  localRequestState,
  localWarningCode,
}: {
  durable: PdfBurstDurableSnapshot | null;
  localPhase: PdfBurstLocalPhase;
  localRequestState: PdfBurstLocalRequestState;
  localWarningCode: string | null;
}) {
  const visibleLocalRequestState =
    localRequestState === "cancellation_requested" &&
    (!durable || cancellableDurableStatuses.has(durable.status))
      ? localRequestState
      : null;

  if (!durable) {
    return {
      durableStatusKnown: false,
      localRequestState: visibleLocalRequestState,
      localWarningCode,
      safeErrorCode: null,
      shouldPoll:
        visibleLocalRequestState !== null ||
        ["reserving", "uploading", "finalizing"].includes(localPhase),
      status: localPhase as PdfBurstDisplayStatus,
    };
  }

  if (durable.status === "reserved") {
    const status = ["uploading", "finalizing", "failed"].includes(
      localPhase,
    )
      ? localPhase
      : "reserved";
    return {
      durableStatusKnown: true,
      localRequestState: visibleLocalRequestState,
      localWarningCode,
      safeErrorCode: durable.safeErrorCode,
      shouldPoll: localPhase !== "failed",
      status: status as PdfBurstDisplayStatus,
    };
  }

  return {
    durableStatusKnown: true,
    localRequestState: visibleLocalRequestState,
    localWarningCode,
    safeErrorCode: durable.safeErrorCode,
    shouldPoll: !durableTerminalStatuses.has(durable.status),
    status: durable.status as PdfBurstDisplayStatus,
  };
}
