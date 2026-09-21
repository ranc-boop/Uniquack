import Link from "next/link";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

import { joinQuestionBankByCode } from "../actions";

export const dynamic = "force-dynamic";

export default async function JoinTeacherBankPage() {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="teacher-eyebrow">{t("teacherLibrary.joinByShareCode")}</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {t("teacherLibrary.joinSharedLibrary")}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {t("teacherLibrary.joinSharedLibraryDescription")}
            </p>
          </div>
        </div>
      </section>

      <form action={joinQuestionBankByCode} className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-6">
          <h2 className="text-xl font-bold text-slate-950">
            {t("teacherLibrary.libraryCollaborationCode")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {t("teacherLibrary.libraryCollaborationDescription")}
          </p>
        </div>
        <div className="space-y-5 p-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">
              {t("teacherLibrary.shareCode")}
            </span>
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase tracking-wide text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              maxLength={64}
              name="shareCode"
              placeholder="ABCD-1234"
              required
            />
          </label>
          <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4 text-sm leading-6 text-sky-950">
            {t("teacherLibrary.studentJoinCodeWarning")}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-6">
          <Button asChild variant="outline">
            <Link href="/teacher/banks">{t("teacherLibrary.backToLibraries")}</Link>
          </Button>
          <FormSubmitButton pendingLabel={t("teacherLibrary.joiningLibrary")}>
            {t("teacherLibrary.joinLibrary")}
          </FormSubmitButton>
        </div>
      </form>
    </main>
  );
}
