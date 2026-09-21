import Link from "next/link";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

import { createQuestionBank } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTeacherBankPage() {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="teacher-eyebrow">{t("teacherLibrary.createLibrary")}</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {t("teacherLibrary.teacherOwnedLibraryHeading")}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {t("teacherLibrary.teacherOwnedLibraryDescription")}
            </p>
          </div>
        </div>
      </section>

      <form action={createQuestionBank} className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-6">
          <h2 className="text-xl font-bold text-slate-950">
            {t("teacherLibrary.libraryDetails")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {t("teacherLibrary.privateLibrariesDefault")}
          </p>
        </div>

        <div className="space-y-5 p-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">
              {t("teacherLibrary.libraryName")}
            </span>
            <input
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              maxLength={120}
              name="name"
              placeholder={t("teacherLibrary.libraryNamePlaceholder")}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-900">
              {t("teacherLibrary.description")}
            </span>
            <textarea
              className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              maxLength={2000}
              name="description"
              placeholder={t("teacherLibrary.libraryDescriptionPlaceholder")}
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">
              {t("teacherLibrary.visibility")}
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  description: t("teacherLibrary.privateVisibilityDescription"),
                  label: t("teacherLibrary.visibilityPrivate"),
                  value: "private",
                },
                {
                  description: t("teacherLibrary.sharedVisibilityDescription"),
                  label: t("teacherLibrary.visibilityShared"),
                  value: "shared",
                },
                {
                  description: t("teacherLibrary.organizationVisibilityDescription"),
                  label: t("teacherLibrary.visibilityOrganization"),
                  value: "organization",
                },
              ].map((option) => (
                <label
                  className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100"
                  key={option.value}
                >
                  <input
                    className="mt-1 h-4 w-4 accent-sky-600"
                    defaultChecked={option.value === "private"}
                    name="visibility"
                    type="radio"
                    value={option.value}
                  />
                  <span>
                    <span className="block font-semibold text-slate-950">
                      {option.label}
                    </span>
                    <span className="mt-1 block leading-6 text-slate-600">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-6">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            {t("teacherLibrary.libraryCreationNotice")}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/banks">{t("common.cancel")}</Link>
            </Button>
            <FormSubmitButton pendingLabel={t("teacherLibrary.creatingLibrary")}>
              {t("teacherLibrary.createLibrary")}
            </FormSubmitButton>
          </div>
        </div>
      </form>
    </main>
  );
}
