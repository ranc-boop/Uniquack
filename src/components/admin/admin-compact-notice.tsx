import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { AdminInfoTip } from "@/components/admin/admin-info-tip";
import { cn } from "@/lib/utils";

type AdminCompactNoticeProps = {
  children: ReactNode;
  className?: string;
  label: string;
  tone?: "error" | "info" | "success" | "warning";
};

const toneStyles = {
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
};

const toneIcons = {
  error: XCircle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
};

export function AdminCompactNotice({
  children,
  className,
  label,
  tone = "info",
}: AdminCompactNoticeProps) {
  const Icon = toneIcons[tone];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm",
        toneStyles[tone],
        className,
      )}
      role={tone === "error" || tone === "warning" ? "alert" : undefined}
    >
      <span className="sr-only">{label}</span>
      <AdminInfoTip
        icon={<Icon aria-hidden="true" className="size-4" />}
        label={`${label} details`}
        panelClassName="w-80"
      >
        {children}
      </AdminInfoTip>
    </div>
  );
}
