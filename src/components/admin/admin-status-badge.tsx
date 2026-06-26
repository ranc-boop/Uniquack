import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  approved: "Approved",
  archived: "Archived",
  blocked: "Blocked",
  calibration_stale: "Calibration stale",
  deprecated: "Deprecated",
  draft: "Draft",
  error: "Error",
  generation_ready: "Generation ready",
  imported: "Imported",
  info: "Info",
  needs_edit: "Needs edit",
  needs_more_evidence: "Needs more evidence",
  needs_review: "Needs review",
  pending: "Pending",
  pending_review: "Pending review",
  published: "Published",
  rejected: "Rejected",
  success: "Success",
  trash: "Trash",
  uncalibrated: "Uncalibrated",
  warning: "Warning",
};

const statusClasses: Record<string, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blocked: "border-destructive/30 bg-destructive/10 text-destructive",
  calibration_stale: "border-amber-200 bg-amber-50 text-amber-900",
  deprecated: "border-slate-200 bg-slate-50 text-slate-700",
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  generation_ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  imported: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  needs_edit: "border-amber-200 bg-amber-50 text-amber-900",
  needs_more_evidence: "border-amber-200 bg-amber-50 text-amber-900",
  needs_review: "border-amber-200 bg-amber-50 text-amber-900",
  pending: "border-sky-200 bg-sky-50 text-sky-800",
  pending_review: "border-sky-200 bg-sky-50 text-sky-800",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  trash: "border-destructive/30 bg-destructive/10 text-destructive",
  uncalibrated: "border-amber-200 bg-amber-50 text-amber-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

type AdminStatusBadgeProps = {
  children?: ReactNode;
  className?: string;
  status: string | null | undefined;
};

function humanizeStatus(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

export function AdminStatusBadge({
  children,
  className,
  status,
}: AdminStatusBadgeProps) {
  const safeStatus = status?.trim() || "info";

  return (
    <Badge
      className={cn(
        "border font-medium capitalize hover:bg-inherit",
        statusClasses[safeStatus] ?? statusClasses.info,
        className,
      )}
      variant="outline"
    >
      {children ?? humanizeStatus(safeStatus)}
    </Badge>
  );
}
