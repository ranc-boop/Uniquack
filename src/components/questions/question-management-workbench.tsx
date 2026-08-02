import Link from "next/link";
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileQuestion,
  Search,
  ShieldCheck,
} from "lucide-react";

import { MathContent } from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type WorkbenchApprovalStatus = "pending" | "approved";

export type QuestionWorkbenchItem = {
  actionHref?: string;
  actionLabel?: string;
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
        ["pending", "待审批"],
        ["approved", "已审批"],
      ] as const).map(([status, label]) => (
        <Link
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
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Inspector({ item }: { item: QuestionWorkbenchItem }) {
  const checks = [
    {
      label: "答案与批改",
      ok: item.gradingCapability !== "needs_configuration",
      value:
        item.gradingCapability === "deterministic"
          ? "确定性批改"
          : item.gradingCapability === "ai_review"
            ? "AI 复核"
            : "需要配置",
    },
    {
      label: "Taxonomy",
      ok: item.taxonomyReady,
      value: item.taxonomyReady ? "已审批" : "需要审批",
    },
    {
      label: "来源",
      ok: Boolean(item.sourceLabel),
      value: item.sourceLabel || "未记录",
    },
  ];

  return (
    <aside className="question-workbench-inspector" aria-label="审批检查器">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="size-4 text-[#0071E3]" />
        <h2 className="text-sm font-semibold text-[#1D1D1F]">审批检查器</h2>
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
      <div className="mt-5 rounded-xl bg-[#F5F5F7] p-3 text-xs leading-5 text-[#6E6E73]">
        审批状态只回答“能否使用”。归档和删除属于 Library 生命周期，不再作为审批状态。
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
  currentPage = 1,
  pageSize = 25,
}: QuestionManagementWorkbenchProps) {
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <section className="question-workbench" aria-label={`${libraryName} question workbench`}>
      <header className="question-workbench-toolbar">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6E6E73]">
            {mode === "admin" ? "Content Governance" : "Library"}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
            {libraryName}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusControl
            activeStatus={activeStatus}
            approvedHref={approvedHref}
            baseHref={baseHref}
            pendingHref={pendingHref}
            query={query}
          />
          {canCreate && createHref ? (
            <Button asChild className="min-h-11 bg-[#0071E3] hover:bg-[#0077ED]">
              <Link href={createHref}>创建题目</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <form className="question-workbench-search" role="search">
        <Search aria-hidden className="size-4 text-[#6E6E73]" />
        <Input
          aria-label="搜索题目"
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          defaultValue={query}
          name="q"
          placeholder="搜索题目编号或标题"
        />
        <input name="status" type="hidden" value={activeStatus} />
      </form>

      <div className="question-workbench-grid">
        <div className="question-workbench-list" aria-label="题目列表">
          <div className="flex items-center justify-between border-b border-[#E5E5EA] px-4 py-3">
            <span className="text-sm font-medium text-[#1D1D1F]">
              {activeStatus === "approved" ? "已审批" : "待审批"}
            </span>
            <span className="text-xs text-[#6E6E73]">{totalCount} 道</span>
          </div>
          {items.length ? (
            <>
              <div className="divide-y divide-[#E5E5EA]">
                {items.map((item) => {
                const active = item.id === selected?.id;
                return (
                  <Link
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
                    prefetch={false}
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
                  </Link>
                );
                })}
              </div>
              {totalPages > 1 ? (
                <nav
                  aria-label="题目分页"
                  className="flex items-center justify-between border-t border-[#E5E5EA] px-4 py-3 text-xs text-[#6E6E73]"
                >
                  {currentPage > 1 ? (
                    <Link href={withParams(baseHref, { q: query, status: activeStatus, page: String(currentPage - 1) })}>
                      上一页
                    </Link>
                  ) : <span />}
                  <span>{currentPage} / {totalPages}</span>
                  {currentPage < totalPages ? (
                    <Link href={withParams(baseHref, { q: query, status: activeStatus, page: String(currentPage + 1) })}>
                      下一页
                    </Link>
                  ) : <span />}
                </nav>
              ) : null}
            </>
          ) : (
            <div className="p-8 text-center">
              <ClipboardCheck aria-hidden className="mx-auto size-7 text-[#AEAEB2]" />
              <p className="mt-3 text-sm font-medium text-[#1D1D1F]">这里暂时没有题目</p>
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
                      {selected.approvalStatus === "approved" ? "已审批" : "待审批"}
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
                      <Link href={selected.actionHref}>
                        {selected.approvalStatus === "approved" ? (
                          <Archive aria-hidden className="mr-2 size-4" />
                        ) : (
                          <CheckCircle2 aria-hidden className="mr-2 size-4" />
                        )}
                        {selected.actionLabel ?? (selected.approvalStatus === "approved" ? "管理" : "审批")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <MathContent className="border-0 p-0 text-base leading-7" value={String(selected.contentHtml)} />
                {selected.solutionHtml ? (
                  <section className="rounded-[14px] bg-[#F5F5F7] p-4">
                    <h3 className="mb-2 text-sm font-semibold text-[#1D1D1F]">答案与解析</h3>
                    <MathContent className="border-0 bg-transparent p-0" value={String(selected.solutionHtml)} />
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex min-h-72 items-center justify-center text-sm text-[#6E6E73]">
              选择一道题查看完整内容。
            </div>
          )}
        </main>

        {selected ? <Inspector item={selected} /> : <aside className="question-workbench-inspector" />}
      </div>
    </section>
  );
}
