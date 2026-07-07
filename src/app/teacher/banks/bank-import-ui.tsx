import Link from "next/link";

import { AlertTriangle, Boxes, ClipboardCheck, FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  BankImportBatchSummary,
  TeacherQuestionBankSummary,
} from "@/lib/question-banks";
import type {
  BankMemberRole,
  QuestionBankStatus,
  QuestionBankVisibility,
} from "@/types/database";

import {
  BankBadge,
  BankMetricCard,
  BankQuickAction,
  BankSectionHeader,
} from "./bank-ui";

type BankImportTarget = {
  assignmentReadyCount?: number;
  description?: string | null;
  id: string;
  importBatchCount?: number;
  membershipRole?: BankMemberRole | null;
  name: string;
  questionCount?: number;
  reviewDraftCount?: number;
  status: QuestionBankStatus;
  visibility: QuestionBankVisibility;
};

const roleLabels: Record<BankMemberRole, string> = {
  editor: "Editor",
  owner: "Owner",
  viewer: "Viewer",
};

const visibilityLabels: Record<QuestionBankVisibility, string> = {
  organization: "Organization",
  private: "Private",
  public: "Public review",
  shared: "Shared",
};

function canImportToBank(bank: Pick<BankImportTarget, "membershipRole" | "status">) {
  return (
    bank.status === "active" &&
    (bank.membershipRole === "owner" || bank.membershipRole === "editor")
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function TargetBankCardContent({
  bank,
  selected,
}: {
  bank: TeacherQuestionBankSummary;
  selected: boolean;
}) {
  const importable = canImportToBank(bank);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <BankBadge tone={importable ? "blue" : "slate"}>
          {roleLabels[bank.membershipRole]}
        </BankBadge>
        <BankBadge tone="sky">{visibilityLabels[bank.visibility]}</BankBadge>
        {selected ? <BankBadge tone="cyan">Selected</BankBadge> : null}
        {!importable ? <BankBadge tone="amber">Read-only for import</BankBadge> : null}
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-bold text-slate-950">{bank.name}</h3>
        <p className="line-clamp-2 text-sm leading-6 text-slate-600">
          {bank.description ||
            "Teacher-owned bank for private imports, review drafts, and assignment-ready questions."}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {[
          ["Drafts", bank.reviewDraftCount],
          ["Imports", bank.importBatchCount],
          ["Ready", bank.assignmentReadyCount],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-slate-200 bg-white/80 p-2" key={label}>
            <dt className="font-semibold text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
      {!importable ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-900">
          Viewer banks are visible for context, but only owners and editors can
          import new Review Drafts.
        </p>
      ) : null}
    </>
  );
}

export function BankTargetSelector({
  banks,
  selectedBankId,
}: {
  banks: TeacherQuestionBankSummary[];
  selectedBankId?: string;
}) {
  const importableCount = banks.filter(canImportToBank).length;

  return (
    <section className="teacher-panel overflow-hidden">
      <BankSectionHeader
        description="Choose the bank that will own the import batch and its Review Drafts. View-only banks cannot receive new imported drafts."
        title="Choose target Question Bank"
      />
      <div className="space-y-4 p-5">
        {banks.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {banks.map((bank) => {
              const selected = bank.id === selectedBankId;
              const importable = canImportToBank(bank);
              const className = [
                "flex h-full flex-col gap-4 rounded-lg border p-4 text-left shadow-sm transition",
                selected
                  ? "border-sky-300 bg-sky-50/80 ring-2 ring-sky-100"
                  : "border-slate-200 bg-white/90",
                importable
                  ? "hover:border-sky-300 hover:bg-sky-50/70"
                  : "opacity-75",
              ].join(" ");

              return importable ? (
                <Link
                  aria-current={selected ? "true" : undefined}
                  className={className}
                  href={`/teacher/ai-parsing?bankId=${bank.id}`}
                  key={bank.id}
                >
                  <TargetBankCardContent bank={bank} selected={selected} />
                </Link>
              ) : (
                <div aria-disabled="true" className={className} key={bank.id}>
                  <TargetBankCardContent bank={bank} selected={selected} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="teacher-eyebrow">No banks yet</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">
              Create or join a Question Bank before importing.
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              AI Parsing always targets a bank first so drafts remain private
              and review-gated.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/teacher/banks/new">Create Question Bank</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/teacher/banks/join">Join Bank by Code</Link>
              </Button>
            </div>
          </div>
        )}

        {banks.length && !importableCount ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium leading-6 text-amber-900">
            You only have viewer access right now. Ask a bank owner to grant
            editor access before importing source material.
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TeacherImportSafetyCallout() {
  return (
    <section className="grid gap-2 md:grid-cols-3">
      {[
        "Choose a bank before importing.",
        "Drafts stay private until reviewed.",
        "No import auto-publishes or assigns content.",
      ].map((note) => (
        <div
          className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm font-semibold leading-6 text-sky-950"
          key={note}
        >
          {note}
        </div>
      ))}
    </section>
  );
}

export function BankImportEntryPanel({
  bank,
  canImport,
  showImportAction = true,
  showChangeTarget = false,
}: {
  bank: BankImportTarget;
  canImport: boolean;
  showImportAction?: boolean;
  showChangeTarget?: boolean;
}) {
  return (
    <article className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
      <BankSectionHeader
        description="This is the teacher-facing import handoff. Outputs stay scoped to the selected bank and move through Review Drafts before they become assignment-ready."
        title="Import into selected bank"
      />
      <div className="space-y-5 p-5">
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <BankBadge tone="blue">
                  {bank.membershipRole ? roleLabels[bank.membershipRole] : "Bank member"}
                </BankBadge>
                <BankBadge tone="sky">{visibilityLabels[bank.visibility]}</BankBadge>
                <BankBadge tone={canImport ? "cyan" : "amber"}>
                  {canImport ? "Import enabled" : "Read-only"}
                </BankBadge>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950">{bank.name}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                  {bank.description ||
                    "Owned source material will create bank-scoped Review Drafts for this Question Bank."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {showChangeTarget ? (
                <Button asChild variant="outline">
                  <Link href="/teacher/ai-parsing">Change target</Link>
                </Button>
              ) : null}
              {showImportAction && canImport ? (
                <Button asChild>
                  <Link href={`/teacher/banks/${bank.id}/imports`}>
                    <Upload aria-hidden="true" className="h-4 w-4" />
                    Import into selected bank
                  </Link>
                </Button>
              ) : null}
              {showImportAction && !canImport ? (
                <Button disabled type="button">
                  Import requires owner/editor
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <BankMetricCard
            description="Source batches already targeting this bank."
            icon={Upload}
            label="Recent imports"
            value={bank.importBatchCount ?? 0}
          />
          <BankMetricCard
            description="Private draft questions awaiting bank review."
            icon={ClipboardCheck}
            label="Review Drafts"
            value={bank.reviewDraftCount ?? 0}
          />
          <BankMetricCard
            description="Approved bank items ready for assignment selection."
            icon={Boxes}
            label="Assignment ready"
            value={bank.assignmentReadyCount ?? bank.questionCount ?? 0}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <BankQuickAction
            href={`/teacher/banks/${bank.id}/review`}
            icon={ClipboardCheck}
          >
            Open Review Drafts
          </BankQuickAction>
          <BankQuickAction
            href={`/teacher/banks/${bank.id}`}
            icon={FileText}
          >
            Open bank
          </BankQuickAction>
        </div>

        {!canImport ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <AlertTriangle aria-hidden="true" className="mr-2 inline h-4 w-4" />
            This bank is visible to you, but import is disabled because your
            current role is read-only.
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function RecentBankImportsPanel({
  importBatches,
}: {
  importBatches: BankImportBatchSummary[];
}) {
  return (
    <aside className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
      <BankSectionHeader title="Recent bank-scoped imports" />
      <div className="space-y-3 p-5">
        {importBatches.length ? (
          importBatches.map((batch) => (
            <div
              className="rounded-xl border border-slate-200 bg-white p-4"
              key={batch.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">
                    {batch.source_type}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(batch.created_at)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {batch.status}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No bank-scoped imports yet. Start with AI Parsing, then review
            drafts before adding anything to the bank.
          </p>
        )}
      </div>
    </aside>
  );
}
