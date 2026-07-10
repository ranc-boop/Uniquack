import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";

import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
  classroomStatusLabel,
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomSettingsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomSettingsPage({
  params,
}: ClassroomSettingsPageProps) {
  await requireTeacher();
  const { id } = await params;
  const supabase = await createClient();
  const workspace = await getTeacherClassroomWorkspace({
    classroomId: id,
    supabase,
  });

  if (!workspace) {
    notFound();
  }

  const { classroom } = workspace;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Settings</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Review class identity, teacher-visible join code, and safe
              lifecycle boundaries.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/teacher/classrooms/${classroom.id}`}>Back to overview</Link>
          </Button>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <ClassroomSafetyStrip />

      <section className="grid gap-3 md:grid-cols-3">
        <ClassroomMetricCard
          description="Current class lifecycle state."
          icon={Settings}
          label="Status"
          value={classroomStatusLabel(classroom.status)}
        />
        <ClassroomMetricCard
          description="Teacher-visible enrollment code."
          icon={Settings}
          label="Join code"
          value={classroom.joinCodeVisible || classroom.joinCodeHint || "Unavailable"}
        />
        <ClassroomMetricCard
          description="Last classroom or delivery activity."
          icon={Settings}
          label="Recent activity"
          value={formatClassroomDateTime(classroom.latestActivityAt)}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-white/70 p-5">
            <h2 className="text-xl font-bold text-slate-950">Class identity</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This UI shows current class metadata. Editing class identity can be
              added without changing bank ownership or assignment safety.
            </p>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            {[
              ["Name", classroom.name],
              ["Section / subject", classroom.subject || "Not set"],
              ["Description", classroom.description || "No description."],
              ["Created", formatClassroomDateTime(classroom.created_at)],
              ["Updated", formatClassroomDateTime(classroom.updated_at)],
            ].map(([label, value]) => (
              <div className="grid gap-2 p-5 md:grid-cols-[12rem_1fr]" key={label}>
                <dt className="font-semibold text-slate-500">{label}</dt>
                <dd className="break-words font-medium text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Join code visibility
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The display code remains visible to teachers. Validation still
              uses the hashed code path.
            </p>
            {classroom.joinCodeVisible ? (
              <code className="mt-4 block rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-center text-2xl font-bold tracking-[0.16em] text-slate-950">
                {classroom.joinCodeVisible}
              </code>
            ) : null}
          </section>

          <section className="teacher-panel p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">Lifecycle</h2>
              <ClassroomBadge tone="amber">Placeholder</ClassroomBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Archive and delete controls are not enabled in this UI slice.
              Student roster evidence and assignment history should not be
              hard-deleted from a presentation control.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
