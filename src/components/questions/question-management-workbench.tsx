import {
  Archive,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  FileQuestion,
  Search,
  ShieldCheck,
} from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import { MathContent } from "@/components/math-content";
import { RoutePendingLink } from "@/components/route-pending-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export type WorkbenchApprovalStatus = "pending" | "approved";

export type QuestionWorkbenchItem = {
  actionHref?: string;
  actionLabel?: string;
  archiveId?: string;
  approvalStatus: WorkbenchApprovalStatus;
  contentHtml: string;
  gradingCapability: "deterministic" | "ai_review" | "needs_configuration";
  id: string;
  questionCode: string;
  questionType: string;
  solutionHtml?: string | null;
  sourceLabel?: string | null;
  taxonomyReady: boolean;
  title: string;
};

type QuestionManagementWorkbenchProps = {
  activeStatus: WorkbenchApprovalStatus;
  baseHref: string;
  canCreate?: boolean;
  createHref?: string;
  items: QuestionWorkbenchItem[];
  libraryName: string;
  mode: "admin" | "teacher";
  approvedHref?: string;
  pendingHref?: string;
  query?: string;
  selectedId?: string;
  showTitle?: boolean;
  totalCount: number;
  archiveAction?: (formData: FormData) => Promise<void>;
  currentPage?: number;
  pageSize?: number;
};

function withParams(
  baseHref: string,
  values: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

function StatusControl({
  activeStatus,
  approvedHref,
  baseHref,
  locale,
  pendingHref,
  query,
}: Pick<QuestionManagementWorkbenchProps, "activeStatus" | "approvedHref" | "baseHref" | "pendingHref" | "query"> & { locale: Locale }) {
  return (
    <nav
      aria-label={translate(locale, "questions.approvalStatus")}
      className="inline-flex rounded-[10px] bg-[#E8E8ED] p-1"
    >
      {([
        ["pending", translate(locale, "questions.pending")],
        ["approved", translate(locale, "questions.approved")],
      ] as const).map(([status, label]) => (
        <RoutePendingLink
          aria-current={activeStatus === status ? "page" : undefined}
          className={cn(
            "flex min-h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors duration-200",
            activeStatus === status
              ? "bg-white text-[#1D1D1F] shadow-sm"
              : "text-[#6E6E73] hover:text-[#1D1D1F]",
          )}
          href={
            status === "pending" && pendingHref
              ? pendingHref
              : status === "approved" && approvedHref
                ? approvedHref
                : withParams(baseHref, { q: query, status })
          }
          key={status}
          pendingLabel={label}
        >
          {label}
        </RoutePendingLink>
      ))}
    </nav>
  );
}

function Inspector({ item, locale }: { item: QuestionWorkbenchItem; locale: Locale }) {
  const checks = [
    {
      label: translate(locale, "questions.answerGrading"),
      ok: item.gradingCapability !== "needs_configuration",
      value:
        item.gradingCapability === "deterministic"
          ? translate(locale, "questions.deterministic")
          : item.gradingCapability === "ai_review"
            ? translate(locale, "questions.aiReview")
            : translate(locale, "questions.configurationRequired"),
    },
    {
      label: translate(locale, "questions.taxonomy"),
      ok: item.taxonomyReady,
      value: item.taxonomyReady
        ? translate(locale, "questions.approved")
        : translate(locale, "questions.approvalRequired"),
    },
    {
      label: translate(locale, "questions.source"),
      ok: Boolean(item.sourceLabel),
      value: item.sourceLabel || translate(locale, "questions.notRecorded"),
    },
  ];

  return (
    <aside className="question-workbench-inspector" aria-label={translate(locale, "questions.approvalInspector")}>
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="size-4 text-[#0071E3]" />
        <h2 className="text-sm font-semibold text-[#1D1D1F]">{translate(locale, "questions.approvalChecks")}</h2>
      </div>
      <div className="mt-4 divide-y divide-[#E5E5EA]">
        {checks.map((check) => (
          <div className="flex items-start justify-between gap-3 py-3" key={check.label}>
            <div>
              <p className="text-sm font-medium text-[#1D1D1F]">{check.label}</p>
              <p className="mt-0.5 text-xs text-[#6E6E73]">{check.value}</p>
            </div>
            <span
              className={cn(
                "mt-0.5 size-2 rounded-full",
                check.ok ? "bg-emerald-500" : "bg-amber-500",
              )}
              title={check.ok ? translate(locale, "questions.ready") : translate(locale, "questions.actionRequired")}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}

export async function QuestionManagementWorkbench({
  activeStatus,
  approvedHref,
  baseHref,
  canCreate,
  createHref,
  items,
  libraryName,
  mode,
  pendingHref,
  query,
  selectedId,
  showTitle = true,
  totalCount,
  archiveAction,
  currentPage = 1,
  pageSize = 25,
}: QuestionManagementWorkbenchProps) {
  const locale = await getRequestLocale();
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <section className="question-workbench" aria-label={`${libraryName} ${translate(locale, "questions.workbench")}`}>
      <header className="question-workbench-toolbar">
        {showTitle ? (
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
              {libraryName}
            </h1>
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {mode === "teacher" ? (
            <StatusControl
              activeStatus={activeStatus}
              approvedHref={approvedHref}
              baseHref={baseHref}
              locale={locale}
              pendingHref={pendingHref}
              query={query}
            />
          ) : null}
          {canCreate && createHref ? (
            <Button asChild className="min-h-11 bg-[#0071E3] hover:bg-[#0077ED]">
              <RoutePendingLink href={createHref} pendingLabel={translate(locale, "questions.createQuestion")}>
                {translate(locale, "common.create")}
              </RoutePendingLink>
            </Button>
          ) : null}
        </div>
      </header>

      <form className="question-workbench-search" role="search">
        <Search aria-hidden className="size-4 text-[#6E6E73]" />
        <Input
          aria-label={translate(locale, "questions.search")}
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          defaultValue={query}
          name="q"
          placeholder={translate(locale, "questions.searchPlaceholder")}
        />
        <input name="status" type="hidden" value={activeStatus} />
      </form>

      <div className="question-workbench-grid">
        <div className="question-workbench-list" aria-label={translate(locale, "questions.list")}>
          <div className="flex items-center justify-between border-b border-[#E5E5EA] px-4 py-3">
            <span className="text-sm font-medium text-[#1D1D1F]">
              {activeStatus === "approved"
                ? translate(locale, "questions.approved")
                : translate(locale, "questions.pending")}
            </span>
            <span className="text-xs text-[#6E6E73]">{formatNumber(locale, totalCount)}</span>
          </div>
          {items.length ? (
            <>
              <div className="divide-y divide-[#E5E5EA]">
                {items.map((item) => {
                const active = item.id === selected?.id;
                return (
                  <RoutePendingLink
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "group flex min-h-[76px] items-center gap-3 px-4 py-3 transition-colors duration-200",
                      active ? "bg-[#EAF4FF]" : "hover:bg-[#F5F5F7]",
                    )}
                    href={withParams(baseHref, {
                      q: query,
                      selected: item.id,
                      status: activeStatus,
                    })}
                    key={item.id}
                    pendingLabel={item.title}
                  >
                    <FileQuestion aria-hidden className="size-4 shrink-0 text-[#6E6E73]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#1D1D1F]">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-xs text-[#6E6E73]">
                        {item.questionCode} · {item.questionType}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-[#AEAEB2]" />
                  </RoutePendingLink>
                );
                })}
              </div>
              {totalPages > 1 ? (
                <nav
                  aria-label={translate(locale, "questions.pages")}
                  className="flex items-center justify-between border-t border-[#E5E5EA] px-4 py-3 text-xs text-[#6E6E73]"
                >
                  {currentPage > 1 ? (
                    <RoutePendingLink href={withParams(baseHref, { q: query, status: activeStatus, page: String(currentPage - 1) })} pendingLabel={translate(locale, "questions.previousPage")}>
                      {translate(locale, "questions.previous")}
                    </RoutePendingLink>
                  ) : <span />}
                  <span>{formatNumber(locale, currentPage)} / {formatNumber(locale, totalPages)}</span>
                  {currentPage < totalPages ? (
                    <RoutePendingLink href={withParams(baseHref, { q: query, status: activeStatus, page: String(currentPage + 1) })} pendingLabel={translate(locale, "questions.nextPage")}>
                      {translate(locale, "questions.next")}
                    </RoutePendingLink>
                  ) : <span />}
                </nav>
              ) : null}
            </>
          ) : (
            <div className="p-8 text-center">
              <ClipboardCheck aria-hidden className="mx-auto size-7 text-[#AEAEB2]" />
              <p className="mt-3 text-sm font-medium text-[#1D1D1F]">{translate(locale, "questions.noneYet")}</p>
            </div>
          )}
        </div>

        <main className="question-workbench-preview">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E5EA] pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "border-0",
                        selected.approvalStatus === "approved"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700",
                      )}
                    >
                      {selected.approvalStatus === "approved"
                        ? translate(locale, "questions.approved")
                        : translate(locale, "questions.pending")}
                    </Badge>
                    <span className="text-xs text-[#6E6E73]">{selected.questionCode}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-[#1D1D1F]">
                    {selected.title}
                  </h2>
                </div>
                <div className="flex gap-2">
                  {selected.actionHref ? (
                    <Button
                      asChild
                      size="sm"
                      variant={selected.approvalStatus === "approved" ? "outline" : "default"}
                      className={selected.approvalStatus === "pending" ? "bg-[#0071E3] hover:bg-[#0077ED]" : undefined}
                    >
                      <RoutePendingLink href={selected.actionHref} pendingLabel={selected.actionLabel ?? translate(locale, "questions.action")}>
                        {selected.approvalStatus === "approved" ? (
                          <FilePlus2 aria-hidden className="mr-2 size-4" />
                        ) : (
                          <CheckCircle2 aria-hidden className="mr-2 size-4" />
                        )}
                        {selected.actionLabel ?? (selected.approvalStatus === "approved" ? translate(locale, "questions.createRevision") : translate(locale, "questions.approve"))}
                      </RoutePendingLink>
                    </Button>
                  ) : null}
                  {archiveAction && selected.archiveId ? (
                    <form action={archiveAction}>
                      <input name="bank_question_id" type="hidden" value={selected.archiveId} />
                      <FormSubmitButton
                        pendingLabel={translate(locale, "questions.archiving")}
                        size="sm"
                        variant="outline"
                      >
                        <Archive aria-hidden className="mr-2 size-4" />
                        {translate(locale, "questions.archive")}
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <MathContent className="border-0 p-0 text-base leading-7" value={String(selected.contentHtml)} />
                {selected.solutionHtml ? (
                  <section className="rounded-[14px] bg-[#F5F5F7] p-4">
                    <h3 className="mb-2 text-sm font-semibold text-[#1D1D1F]">{translate(locale, "questions.answerExplanation")}</h3>
                    <MathContent className="border-0 bg-transparent p-0" value={String(selected.solutionHtml)} />
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex min-h-72 items-center justify-center text-sm text-[#6E6E73]">
              {translate(locale, "questions.selectToInspect")}
            </div>
          )}
        </main>

        {selected ? <Inspector item={selected} locale={locale} /> : <aside className="question-workbench-inspector" />}
      </div>
    </section>
  );
}
