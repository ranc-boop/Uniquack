import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminInfoTip } from "@/components/admin/admin-info-tip";
import { cn } from "@/lib/utils";

type AdminCardProps = {
  actions?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  contentClassName?: string;
  description?: ReactNode;
  help?: ReactNode;
  helpLabel?: string;
  title: ReactNode;
};

export function AdminCard({
  actions,
  badge,
  children,
  className,
  compact = false,
  contentClassName,
  description,
  help,
  helpLabel,
  title,
}: AdminCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader
        className={cn(
          "flex flex-col gap-3 space-y-0",
          compact ? "p-4" : "p-5",
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base leading-6">{title}</CardTitle>
              {help ? (
                <AdminInfoTip label={helpLabel}>{help}</AdminInfoTip>
              ) : null}
              {badge}
            </div>
            {description ? (
              <div className="text-sm leading-6 text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      </CardHeader>
      {children ? (
        <CardContent
          className={cn(compact ? "p-4 pt-0" : "p-5 pt-0", contentClassName)}
        >
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}

export const AdminSectionCard = AdminCard;
