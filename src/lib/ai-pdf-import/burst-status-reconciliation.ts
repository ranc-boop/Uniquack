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
  | "failed"
  | "cancelled";

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

export function reconcilePdfBurstDisplayState({
  durable,
  localPhase,
  localWarningCode,
}: {
  durable: PdfBurstDurableSnapshot | null;
  localPhase: PdfBurstLocalPhase;
  localWarningCode: string | null;
}) {
  if (!durable) {
    return {
      durableStatusKnown: false,
      localWarningCode,
      safeErrorCode: null,
      shouldPoll: ["reserving", "uploading", "finalizing"].includes(localPhase),
      status: localPhase as PdfBurstDisplayStatus,
    };
  }

  if (durable.status === "reserved") {
    const status = ["uploading", "finalizing", "failed", "cancelled"].includes(
      localPhase,
    )
      ? localPhase
      : "reserved";
    return {
      durableStatusKnown: true,
      localWarningCode,
      safeErrorCode: durable.safeErrorCode,
      shouldPoll: localPhase !== "failed",
      status: status as PdfBurstDisplayStatus,
    };
  }

  return {
    durableStatusKnown: true,
    localWarningCode,
    safeErrorCode: durable.safeErrorCode,
    shouldPoll: !durableTerminalStatuses.has(durable.status),
    status: durable.status as PdfBurstDisplayStatus,
  };
}
