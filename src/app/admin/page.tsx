import Link from "next/link";

import { createDemoContent } from "@/app/admin/actions";
import { AdminActionGroup } from "@/components/admin/admin-action-group";
import { AdminCard } from "@/components/admin/admin-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

type AdminPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const [params, locale] = await Promise.all([searchParams, getRequestLocale()]);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const experienceLinks = [
    { href: "/teacher", label: t("admin.teacherStudio") },
    { href: "/practice", label: t("admin.studentPractice") },
    { href: "/questions", label: t("admin.questionBank") },
    { href: "/videos", label: t("admin.studentVideos") },
  ];
  const cards = [
    { href: "/admin/review", title: t("admin.reviewDrafts"), body: t("admin.reviewDraftsDescription") },
    { href: "/admin/questions", title: t("admin.questions"), body: t("admin.questionsDescription") },
    { href: "/admin/tags", title: t("admin.tags"), body: t("admin.tagsDescription") },
    { href: "/admin/videos", title: t("admin.videos"), body: t("admin.videosDescription") },
    { href: "/admin/imports", title: t("admin.batchImport"), body: t("admin.batchImportDescription") },
    { href: "/admin/users", title: t("admin.users"), body: t("admin.usersDescription") },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow={t("roles.admin")}
        help={t("admin.dashboardHelp")}
        helpLabel={t("admin.dashboardHelpLabel")}
        title={t("admin.dashboard")}
      />
      <PageFeedback error={params.error} saved={params.saved} />
      <AdminCard
        description={t("admin.demoSeedDescription")}
        help={t("admin.demoSeedHelp")}
        helpLabel={t("admin.demoSeedHelpLabel")}
        title={t("admin.demoSeed")}
      >
        <form action={createDemoContent}>
          <FormSubmitButton pendingLabel={t("admin.creatingDemoData")}>
            {t("admin.createDemoRecords")}
          </FormSubmitButton>
        </form>
      </AdminCard>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("admin.platformOperations")}</h2>
          <span className="text-sm text-muted-foreground">{t("admin.manage")}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <AdminCard
              actions={
                <AdminActionGroup
                  primary={
                    <Button asChild size="sm">
                      <Link href={card.href}>{t("common.open")}</Link>
                    </Button>
                  }
                />
              }
              description={card.body}
              key={card.href}
              title={card.title}
            />
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("admin.productExperience")}</h2>
          <span className="text-sm text-muted-foreground">{t("admin.inspect")}</span>
        </div>
        <AdminCard
          description={t("admin.teacherStudentEntryDescription")}
          help={t("admin.teacherStudentEntryHelp")}
          helpLabel={t("admin.experienceShortcuts")}
          title={t("admin.teacherStudentEntryPoints")}
        >
          <div className="flex flex-wrap gap-2">
            {experienceLinks.map((link) => (
              <Button asChild key={link.href} size="sm" variant="outline">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}
