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
  emptyDescription: string;
  items: QuestionWorkbenchItem[];
  libraryName: string;
  mode: "admin" | "teacher";
  approvedHref?: string;
  pendingHref?: string;
  query?: string;
  selectedId?: string;
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
  pendingHref,
  query,
}: Pick<QuestionManagementWorkbenchProps, "activeStatus" | "approvedHref" | "baseHref" | "pendingHref" | "query">) {
  return (
    <nav
      aria-label="Approval status"
      className="inline-flex rounded-[10px] bg-[#E8E8ED] p-1"
    >
      {([
        ["pending", "Pending"],
        ["approved", "Approved"],
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

function Inspector({ item }: { item: QuestionWorkbenchItem }) {
  const checks = [
    {
      label: "Answer & grading",
      ok: item.gradingCapability !== "needs_configuration",
      value:
        item.gradingCapability === "deterministic"
          ? "Deterministic"
          : item.gradingCapability === "ai_review"
            ? "AI review"
            : "Configuration required",
    },
    {
      label: "Taxonomy",
      ok: item.taxonomyReady,
      value: item.taxonomyReady ? "Approved" : "Approval required",
    },
    {
      label: "Source",
      ok: Boolean(item.sourceLabel),
      value: item.sourceLabel || "Not recorded",
    },
  ];

  return (
    <aside className="question-workbench-inspector" aria-label="Approval inspector">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="size-4 text-[#0071E3]" />
        <h2 className="text-sm font-semibold text-[#1D1D1F]">Approval checks</h2>
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
              title={check.ok ? "Ready" : "Action required"}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}

export function QuestionManagementWorkbench({
  activeStatus,
  approvedHref,
  baseHref,
  canCreate,
  createHref,
  emptyDescription,
  items,
  libraryName,
  mode,
  pendingHref,
  query,
  selectedId,
  totalCount,
  archiveAction,
  currentPage = 1,
  pageSize = 25,
}: QuestionManagementWorkbenchProps) {
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <section className="question-workbench" aria-label={`${libraryName} question workbench`}>
      <header className="question-workbench-toolbar">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
            {libraryName}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "teacher" ? (
            <StatusControl
              activeStatus={activeStatus}
              approvedHref={approvedHref}
              baseHref={baseHref}
              pendingHref={pendingHref}
              query={query}
            />
          ) : null}
          {canCreate && createHref ? (
            <Button asChild className="min-h-11 bg-[#0071E3] hover:bg-[#0077ED]">
              <RoutePendingLink href={createHref} pendingLabel="Create question">
                Create
              </RoutePendingLink>
            </Button>
          ) : null}
        </div>
      </header>

      <form className="question-workbench-search" role="search">
        <Search aria-hidden className="size-4 text-[#6E6E73]" />
        <Input
          aria-label="Search questions"
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          defaultValue={query}
          name="q"
          placeholder="Search by code or title"
        />
        <input name="status" type="hidden" value={activeStatus} />
      </form>

      <div className="question-workbench-grid">
        <div className="question-workbench-list" aria-label="Question list">
          <div className="flex items-center justify-between border-b border-[#E5E5EA] px-4 py-3">
            <span className="text-sm font-medium text-[#1D1D1F]">
              {activeStatus === "approved" ? "Approved" : "Pending"}
            </span>
            <span className="text-xs text-[#6E6E73]">{totalCount}</span>
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
                  aria-label="Question pages"
                  className="flex items-center justify-between border-t border-[#E5E5EA] px-4 py-3 text-xs text-[#6E6E73]"
                >
                  {currentPage > 1 ? (
                    <RoutePendingLink href={withParams(baseHref, { q: query, status: activeStatus, page: String(currentPage - 1) })} pendingLabel="Previous page">
                      Previous
                    </RoutePendingLink>
                  ) : <span />}
                  <span>{currentPage} / {totalPages}</span>
                  {currentPage < totalPages ? (
                    <RoutePendingLink href={withParams(baseHref, { q: query, status: activeStatus, page: String(currentPage + 1) })} pendingLabel="Next page">
                      Next
                    </RoutePendingLink>
                  ) : <span />}
                </nav>
              ) : null}
            </>
          ) : (
            <div className="p-8 text-center">
              <ClipboardCheck aria-hidden className="mx-auto size-7 text-[#AEAEB2]" />
              <p className="mt-3 text-sm font-medium text-[#1D1D1F]">No questions here yet</p>
              <p className="mt-1 text-xs leading-5 text-[#6E6E73]">{emptyDescription}</p>
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
                      {selected.approvalStatus === "approved" ? "Approved" : "Pending"}
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
                      <RoutePendingLink href={selected.actionHref} pendingLabel={selected.actionLabel ?? "Question action"}>
                        {selected.approvalStatus === "approved" ? (
                          <FilePlus2 aria-hidden className="mr-2 size-4" />
                        ) : (
                          <CheckCircle2 aria-hidden className="mr-2 size-4" />
                        )}
                        {selected.actionLabel ?? (selected.approvalStatus === "approved" ? "Create revision" : "Approve")}
                      </RoutePendingLink>
                    </Button>
                  ) : null}
                  {archiveAction && selected.archiveId ? (
                    <form action={archiveAction}>
                      <input name="bank_question_id" type="hidden" value={selected.archiveId} />
                      <FormSubmitButton
                        pendingLabel="Archiving..."
                        size="sm"
                        variant="outline"
                      >
                        <Archive aria-hidden className="mr-2 size-4" />
                        Archive
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <MathContent className="border-0 p-0 text-base leading-7" value={String(selected.contentHtml)} />
                {selected.solutionHtml ? (
                  <section className="rounded-[14px] bg-[#F5F5F7] p-4">
                    <h3 className="mb-2 text-sm font-semibold text-[#1D1D1F]">Answer & explanation</h3>
                    <MathContent className="border-0 bg-transparent p-0" value={String(selected.solutionHtml)} />
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex min-h-72 items-center justify-center text-sm text-[#6E6E73]">
              Select a question to inspect its full content.
            </div>
          )}
        </main>

        {selected ? <Inspector item={selected} /> : <aside className="question-workbench-inspector" />}
      </div>
    </section>
  );
}
