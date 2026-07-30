import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { FocusWorkspaceBridge } from "@/components/teacher/focus-workspace-bridge";

export function FocusWorkspaceShell({
  badges,
  children,
  description,
  eyebrow,
  returnHref,
  returnSurfaceLabel,
  title,
}: {
  badges?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  returnHref: string;
  returnSurfaceLabel?: string;
  title: string;
}) {
  const mainId = "focus-workspace-main";

  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8"
      id={mainId}
      tabIndex={-1}
    >
      <header className="rounded-lg border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="teacher-eyebrow">{eyebrow}</p>
            <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {description}
            </p>
            {badges ? (
              <div className="mt-3 flex flex-wrap gap-2">{badges}</div>
            ) : null}
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Read-only preview
          </div>
        </div>
      </header>

      <FocusWorkspaceBridge
        mainId={mainId}
        returnHref={returnHref}
        returnSurfaceLabel={returnSurfaceLabel}
      />

      {children}
    </main>
  );
}
