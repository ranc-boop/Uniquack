import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, KeyRound, RotateCcw, Settings } from "lucide-react";

import {
  archiveClassroom,
  createClassroomJoinCode,
  disableClassroomJoining,
  reopenClassroom,
  rotateClassroomJoinCode,
  updateClassroomSettings,
} from "@/app/teacher/classrooms/actions";
import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomRouteTabs,
  classroomStatusLabel,
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { CopyJoinCodeButton } from "@/app/teacher/classrooms/copy-join-code-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomSettingsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; newCode?: string; saved?: string }>;
};

export default async function ClassroomSettingsPage({
  params,
  searchParams,
}: ClassroomSettingsPageProps) {
  await requireTeacher();
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const workspace = await getTeacherClassroomWorkspace({
    classroomId: id,
    supabase,
  });

  if (!workspace) {
    notFound();
  }

  const { classroom } = workspace;
  const visibleJoinCode = query.newCode || classroom.joinCodeVisible;
  const joiningEnabled = classroom.status === "active" && Boolean(visibleJoinCode);

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
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      {query.saved ? (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {query.saved}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {query.error}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <ClassroomMetricCard
          description="Current class lifecycle state."
          icon={Settings}
          label="Status"
          value={classroomStatusLabel(classroom.status)}
        />
        <ClassroomMetricCard
          description="Teacher-visible enrollment code."
          icon={KeyRound}
          label="Join code"
          value={
            joiningEnabled
              ? visibleJoinCode
              : classroom.status === "archived"
                ? "Archived"
                : classroom.joinCodeStatus ?? "Disabled"
          }
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
              Editing classroom metadata changes only this delivery space. It
              does not change bank ownership or assignment history.
            </p>
          </div>
          <form action={updateClassroomSettings} className="space-y-5 p-5">
            <input name="classroomId" type="hidden" value={classroom.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="classroom-name">Class name</Label>
                <Input
                  defaultValue={classroom.name}
                  id="classroom-name"
                  maxLength={120}
                  name="name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="classroom-subject">Subject / section</Label>
                <Input
                  defaultValue={classroom.subject ?? ""}
                  id="classroom-subject"
                  maxLength={120}
                  name="subject"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="classroom-description">Description</Label>
              <Textarea
                defaultValue={classroom.description ?? ""}
                id="classroom-description"
                maxLength={2000}
                name="description"
                rows={5}
              />
            </div>
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
              <div>
                <p className="font-semibold text-slate-950">Created</p>
                <p className="text-slate-600">
                  {formatClassroomDateTime(classroom.created_at)}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-950">Updated</p>
                <p className="text-slate-600">
                  {formatClassroomDateTime(classroom.updated_at)}
                </p>
              </div>
            </div>
            <FormSubmitButton pendingLabel="Saving...">
              Save classroom settings
            </FormSubmitButton>
          </form>
        </section>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Join-code lifecycle
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Joining can be enabled, disabled, or rotated here. Validation
              still uses the hashed code path, and students only join the roster.
            </p>
            {joiningEnabled && visibleJoinCode ? (
              <div className="mt-4 space-y-3">
                <code className="block rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-center text-2xl font-bold tracking-[0.16em] text-slate-950">
                  {visibleJoinCode}
                </code>
                <CopyJoinCodeButton code={visibleJoinCode} />
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                {classroom.status === "archived"
                  ? "Joining is blocked while archived."
                  : "Joining is currently disabled."}
              </p>
            )}
            <div className="mt-4 grid gap-2">
              {classroom.status === "active" ? (
                <>
                  <form action={rotateClassroomJoinCode}>
                    <input name="classroomId" type="hidden" value={classroom.id} />
                    <FormSubmitButton
                      className="w-full"
                      pendingLabel="Rotating..."
                      variant="outline"
                    >
                      <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
                      Rotate join code
                    </FormSubmitButton>
                  </form>
                  {joiningEnabled ? (
                    <form action={disableClassroomJoining}>
                      <input name="classroomId" type="hidden" value={classroom.id} />
                      <FormSubmitButton
                        className="w-full"
                        pendingLabel="Disabling..."
                        variant="outline"
                      >
                        Disable joining
                      </FormSubmitButton>
                    </form>
                  ) : (
                    <form action={createClassroomJoinCode}>
                      <input name="classroomId" type="hidden" value={classroom.id} />
                      <input name="redirectTo" type="hidden" value="settings" />
                      <FormSubmitButton
                        className="w-full"
                        pendingLabel="Enabling..."
                        variant="outline"
                      >
                        Enable joining
                      </FormSubmitButton>
                    </form>
                  )}
                </>
              ) : null}
              <p className="text-xs leading-5 text-slate-500">
                Last join-code change: {formatClassroomDateTime(classroom.joinCodeUpdatedAt)}
              </p>
            </div>
          </section>

          <section className="teacher-panel p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">Lifecycle</h2>
              <ClassroomBadge tone={classroom.status === "active" ? "sky" : "amber"}>
                {classroomStatusLabel(classroom.status)}
              </ClassroomBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Archive blocks new joins and removes this class from new Publish
              targets. It does not delete assignments, attempts, evidence,
              feedback, or memberships.
            </p>
            {classroom.status === "active" ? (
              <form action={archiveClassroom} className="mt-4 space-y-3">
                <input name="classroomId" type="hidden" value={classroom.id} />
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <input
                    className="mt-1"
                    name="confirmArchive"
                    required
                    type="checkbox"
                    value="yes"
                  />
                  <span>
                    Archive this classroom and preserve historical assignment
                    evidence.
                  </span>
                </label>
                <FormSubmitButton
                  className="w-full border-amber-300 text-amber-900 hover:bg-amber-50"
                  pendingLabel="Archiving..."
                  variant="outline"
                >
                  <Archive aria-hidden="true" className="mr-2 h-4 w-4" />
                  Archive classroom
                </FormSubmitButton>
              </form>
            ) : (
              <form action={reopenClassroom} className="mt-4">
                <input name="classroomId" type="hidden" value={classroom.id} />
                <FormSubmitButton className="w-full" pendingLabel="Reopening...">
                  Reopen classroom
                </FormSubmitButton>
              </form>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
