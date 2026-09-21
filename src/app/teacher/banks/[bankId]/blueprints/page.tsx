import Link from "next/link";
import { notFound } from "next/navigation";

import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuestionBankDetail,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import {
  BlueprintLibrarySchemaMissingError,
  listBankLinkedBlueprints,
} from "@/lib/teacher-blueprints";
import { readinessWarnings, sourceExampleCount } from "@/lib/teacher-blueprint-builder";
import { formatNumber } from "@/lib/i18n/locale";

import {
  BankBadge,
  BankHeroPanel,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

type Translate = (key: Parameters<typeof translate>[1]) => string;

function relationLabel(t: Translate, value: string) {
  const labels: Record<string, string> = {
    generated_from_bank: t("teacherLibrary.blueprintRelationGeneratedFromLibrary"),
    imported_to_bank: t("teacherLibrary.blueprintRelationImportedToLibrary"),
    linked: t("teacherLibrary.blueprintRelationLinked"),
  };

  return labels[value] ?? value;
}

function visibilityLabel(t: Translate, value: string) {
  const labels: Record<string, string> = {
    organization: t("teacherLibrary.blueprintVisibilityOrganization"),
    private: t("teacherLibrary.blueprintVisibilityPrivate"),
    public: t("teacherLibrary.blueprintVisibilityPublicReview"),
    shared: t("teacherLibrary.blueprintVisibilityShared"),
  };

  return labels[value] ?? value;
}

function kindLabel(t: Translate, value: string) {
  const labels: Record<string, string> = {
    bank_generated: t("teacherLibrary.blueprintKindLibraryGenerated"),
    course_builder: t("teacherLibrary.blueprintKindCourseBuilder"),
    imported: t("teacherLibrary.blueprintKindImported"),
    manual: t("teacherLibrary.blueprintKindManual"),
  };

  return labels[value] ?? value;
}

function statusLabel(t: Translate, value: string) {
  const labels: Record<string, string> = {
    approved: t("teacherLibrary.blueprintStatusApproved"),
    archived: t("teacherLibrary.blueprintStatusArchived"),
    deprecated: t("teacherLibrary.blueprintStatusDeprecated"),
    needs_more_evidence: t("teacherLibrary.blueprintStatusNeedsEvidence"),
    pending_review: t("teacherLibrary.blueprintStatusDraft"),
    rejected: t("teacherLibrary.blueprintStatusRejected"),
    trashed: t("teacherLibrary.blueprintStatusTrash"),
  };

  return labels[value] ?? value;
}

function taxonomyLabel(t: Translate, value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    return t("teacherLibrary.noTaxonomyTargets");
  }

  const labels = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const candidate = item as {
          label?: unknown;
          tagId?: unknown;
          tag_id?: unknown;
        };

        return typeof candidate.label === "string"
          ? candidate.label
          : typeof candidate.tagId === "string"
            ? candidate.tagId
            : typeof candidate.tag_id === "string"
              ? candidate.tag_id
              : null;
      }

      return null;
    })
    .filter((label): label is string => Boolean(label))
    .slice(0, 4);

  return labels.length ? labels.join(", ") : t("teacherLibrary.noTaxonomyTargets");
}

function SetupNeededState({ locale, message }: { locale: Parameters<typeof translate>[0]; message: string }) {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">{translate(locale, "teacherLibrary.setupNeeded")}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          {translate(locale, "teacherLibrary.blueprintLinksUnavailable")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {message}
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">{translate(locale, "teacherLibrary.backToLibraries")}</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankBlueprintsPage({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  const profile = await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { bankId } = await params;
  const supabase = await createClient();
  let detail;

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return (
        <SetupNeededState locale={locale} message={t("teacherLibrary.blueprintLinksMigration")} />
      );
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  let links: Awaited<ReturnType<typeof listBankLinkedBlueprints>> = [];

  try {
    links = await listBankLinkedBlueprints({ bankId, supabase });
  } catch (error) {
    if (error instanceof BlueprintLibrarySchemaMissingError) {
      return (
        <SetupNeededState locale={locale} message={t("teacherLibrary.blueprintLinksMigration31")} />
      );
    }

    throw error;
  }

  const { bank, currentUserRole } = detail;

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <Button asChild>
            <Link href={`/teacher/blueprints/new?bankId=${bank.id}`}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("teacherLibrary.createBlueprint")}
            </Link>
          </Button>
        }
        subtitle={bank.name}
        title={t("teacherLibrary.blueprints")}
      />

      <BankRouteTabs bankId={bank.id} currentUserRole={currentUserRole} />

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          action={
            <Button asChild variant="outline">
              <Link href="/teacher/blueprints">{t("teacherLibrary.openBlueprintLibrary")}</Link>
            </Button>
          }
          description={t("teacherLibrary.linkedBlueprintsDescription")}
          title={t("teacherLibrary.blueprintsLinkedToLibrary")}
        />
        <div className="p-5">
          {links.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {links.map((link) =>
                link.blueprint ? (
                  <article
                    className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                    key={link.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <BankBadge tone="blue">
                        {relationLabel(t, link.relation_kind)}
                      </BankBadge>
                      <BankBadge tone="sky">
                        {visibilityLabel(t, link.blueprint.visibility)}
                      </BankBadge>
                      <BankBadge>
                        {statusLabel(t, link.blueprint.status)}
                      </BankBadge>
                    </div>
                    <h2 className="mt-4 text-xl font-bold text-slate-950">
                      {link.blueprint.title}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                      {link.blueprint.description ||
                        t("teacherLibrary.libraryLinkedPlanningAsset")}
                    </p>
                    <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {t("teacherLibrary.kind")}
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {kindLabel(t, link.blueprint.blueprint_kind)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {t("teacherLibrary.taxonomy")}
                        </dt>
                        <dd className="mt-1 break-words font-semibold text-slate-900">
                          {taxonomyLabel(t, link.blueprint.taxonomy_targets)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {t("teacherLibrary.sourceExamples")}
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {formatNumber(locale, sourceExampleCount(link.blueprint))}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {t("teacherLibrary.readiness")}
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {readinessWarnings(link.blueprint).length
                            ? t("teacherLibrary.needsPlanning")
                            : t("teacherLibrary.previewReady")}
                        </dd>
                      </div>
                    </dl>
                    <Button asChild className="mt-4" variant="outline">
                      <Link href={`/teacher/blueprints/${link.blueprint.id}`}>
                        {t("teacherLibrary.openBlueprint")}
                      </Link>
                    </Button>
                  </article>
                ) : null,
              )}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Sparkles aria-hidden="true" className="mx-auto h-10 w-10 text-sky-600" />
              <h2 className="mt-4 text-2xl font-bold text-slate-950">
                {t("teacherLibrary.noLinkedBlueprints")}
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {t("teacherLibrary.noLinkedBlueprintsDescription")}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`/teacher/blueprints/new?bankId=${bank.id}`}>
                    {t("teacherLibrary.createBlueprintFromLibrary")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/teacher/blueprints">{t("teacherLibrary.openBlueprintLibrary")}</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
