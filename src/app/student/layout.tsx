import type { ReactNode } from "react";

import { StudentWorkspaceNav } from "@/components/student/student-workspace-nav";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="student-shell space-y-6">
      <StudentWorkspaceNav />
      {children}
    </div>
  );
}
