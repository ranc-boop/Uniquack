import type { ReactNode } from "react";

import { FocusWorkspaceBridge } from "@/components/teacher/focus-workspace-bridge";

export function FocusWorkspaceShell({
  badges,
  children,
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
      className="mx-auto min-h-dvh w-full max-w-[80rem] space-y-5 px-4 py-5 sm:px-6 lg:px-8"
      id={mainId}
      tabIndex={-1}
    >
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5">
        <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h1>
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
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
