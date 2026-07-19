import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleDot, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  approved: "Approved",
  active: "Active",
  archived: "Archived",
  admin: "Admin",
  blocked: "Blocked",
  calibration_stale: "Calibration stale",
  deprecated: "Deprecated",
  draft: "Draft",
  disabled: "Disabled",
  enabled: "Enabled",
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
  running: "Running",
  student: "Student",
  super_admin: "Super admin",
  success: "Success",
  trash: "Trash",
  teacher: "Teacher",
  uncalibrated: "Uncalibrated",
  warning: "Warning",
};

const statusClasses: Record<string, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blocked: "border-destructive/30 bg-destructive/10 text-destructive",
  calibration_stale: "border-amber-200 bg-amber-50 text-amber-900",
  deprecated: "border-slate-200 bg-slate-50 text-slate-700",
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  disabled: "border-slate-200 bg-slate-50 text-slate-700",
  enabled: "border-emerald-200 bg-emerald-50 text-emerald-800",
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
  running: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  student: "border-slate-200 bg-slate-50 text-slate-700",
  super_admin: "border-violet-200 bg-violet-50 text-violet-800",
  teacher: "border-sky-200 bg-sky-50 text-sky-800",
  trash: "border-destructive/30 bg-destructive/10 text-destructive",
  uncalibrated: "border-amber-200 bg-amber-50 text-amber-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

type AdminStatusBadgeProps = {
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  status: string | null | undefined;
};

function humanizeStatus(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

export function AdminStatusBadge({
  children,
  className,
  compact = true,
  status,
}: AdminStatusBadgeProps) {
  const safeStatus = status?.trim() || "info";
  const label = humanizeStatus(safeStatus);
  const StatusIcon = [
    "approved",
    "published",
    "success",
    "active",
    "enabled",
    "imported",
    "generation_ready",
  ].includes(safeStatus)
    ? CircleCheck
    : [
          "error",
          "blocked",
          "rejected",
          "trash",
          "warning",
          "needs_review",
          "needs_edit",
          "needs_more_evidence",
        ].includes(safeStatus)
      ? CircleAlert
      : ["pending", "pending_review", "calibration_stale", "uncalibrated"].includes(
            safeStatus,
          )
        ? Clock3
        : CircleDot;

  return (
    <Badge
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(
        "border font-medium capitalize hover:bg-inherit",
        compact && "size-7 justify-center rounded-full p-0",
        statusClasses[safeStatus] ?? statusClasses.info,
        className,
      )}
      variant="outline"
    >
      {compact ? (
        <>
          <StatusIcon aria-hidden="true" className="size-3.5" />
          {children ? <span className="sr-only">{children}</span> : null}
        </>
      ) : (
        children ?? label
      )}
    </Badge>
  );
}
