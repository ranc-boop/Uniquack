import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import type {
  Json,
  PublicQuestionSubmissionStatus,
} from "@/types/database";

import { withdrawPublicQuestionSubmission } from "../../actions";
import {
  BankBadge,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function objectValue(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function statusLabel(status: PublicQuestionSubmissionStatus) {
  const labels: Record<PublicQuestionSubmissionStatus, string> = {
    accepted: "Accepted",
    changes_requested: "Changes requested",
    in_review: "In review",
    pending: "Pending",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  };
  return labels[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function TeacherPublicSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const detail = await getTeacherQuestionBankDetail({
    bankId,
    profileId: profile.id,
    supabase,
  });

  if (!detail) notFound();

  const canManage = canManageBankContent(detail.currentUserRole);
  const allowedStatuses: PublicQuestionSubmissionStatus[] = [
    "accepted",
    "changes_requested",
    "in_review",
    "pending",
    "rejected",
    "withdrawn",
  ];
  const status = allowedStatuses.includes(
    query.status as PublicQuestionSubmissionStatus,
  )
    ? (query.status as PublicQuestionSubmissionStatus)
    : null;
  const pageSize = 25;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = (query.q ?? "").trim().replace(/[(),]/g, " ");
  let total = 0;
  let submissions:
    | Array<{
        created_at: string;
        id: string;
        published_question_id: string | null;
        review_reason: string | null;
        status: PublicQuestionSubmissionStatus;
        submitted_snapshot: Json;
      }>
    | null = [];
  let setupNeeded = false;

  if (canManage) {
    let submissionQuery = supabase
      .from("public_question_submissions")
      .select(
        "id, status, review_reason, published_question_id, submitted_snapshot, created_at",
        { count: "exact" },
      )
      .eq("source_bank_id", bankId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) {
      submissionQuery = submissionQuery.eq("status", status);
    }

    if (search) {
      submissionQuery = submissionQuery.or(
        `submitted_snapshot->>title.ilike.*${search}*,submitted_snapshot->>questionCode.ilike.*${search}*`,
      );
    }

    const { count, data, error } = await submissionQuery;

    if (error && ["42P01", "42703"].includes(error.code ?? "")) {
      setupNeeded = true;
    } else if (error) {
      throw new Error(error.message);
    } else {
      submissions = data;
      total = count ?? 0;
    }
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (nextPage: number) => {
    const nextQuery = new URLSearchParams();
    if (search) nextQuery.set("q", search);
    if (status) nextQuery.set("status", status);
    if (nextPage > 1) nextQuery.set("page", String(nextPage));
    const suffix = nextQuery.toString();
    return `/teacher/banks/${bankId}/submissions${suffix ? `?${suffix}` : ""}`;
  };
  if (page > totalPages) {
    redirect(pageHref(totalPages));
  }

  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border bg-white shadow-sm">
        <BankSectionHeader
          action={
          <Button asChild variant="outline">
            <Link href={`/teacher/banks/${bankId}/questions`}>
              Back to questions
            </Link>
          </Button>
          }
          description={`Role: ${detail.currentUserRole ?? "viewer"}. Each submission is an immutable snapshot; review and the Central Public Library copy never modify this Library.`}
          eyebrow="Library / Public submissions"
          title={`Public submissions from ${detail.bank.name}`}
        />
      </section>
      <BankRouteTabs bankId={bankId} />

      {!canManage ? (
        <section className="rounded-lg border bg-white p-6 text-sm text-muted-foreground">
          Public submissions are available to Library owners and editors only.
          Your viewer access remains read-only.
        </section>
      ) : setupNeeded ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          Public submission governance needs clean migration 0055. No teacher
          content has been published.
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <BankSectionHeader
            description="Submit assignment-ready questions from the Questions table."
            title="Submission history"
          />
          <form className="grid gap-3 border-y p-4 md:grid-cols-[minmax(14rem,1fr)_13rem_auto]">
            <div className="space-y-2">
              <Label htmlFor="submission-search">Search snapshots</Label>
              <Input
                defaultValue={query.q ?? ""}
                id="submission-search"
                name="q"
                placeholder="Question title or code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-status">Status</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={status ?? ""}
                id="submission-status"
                name="status"
              >
                <option value="">All statuses</option>
                {allowedStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Filter</Button>
              <Button asChild type="button" variant="outline">
                <Link href={`/teacher/banks/${bankId}/submissions`}>Reset</Link>
              </Button>
            </div>
          </form>
          {submissions?.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question snapshot</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Review note</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => {
                    const snapshot = objectValue(submission.submitted_snapshot);
                    const canWithdraw = [
                      "pending",
                      "in_review",
                      "changes_requested",
                    ].includes(submission.status);

                    return (
                      <TableRow key={submission.id}>
                        <TableCell>
                          <p className="font-semibold">
                            {String(snapshot.title ?? "Untitled snapshot")}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {String(snapshot.questionCode ?? submission.id)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <BankBadge
                            tone={
                              submission.status === "accepted"
                                ? "sky"
                                : submission.status === "rejected"
                                  ? "rose"
                                  : "amber"
                            }
                          >
                            {statusLabel(submission.status)}
                          </BankBadge>
                        </TableCell>
                        <TableCell>{formatDate(submission.created_at)}</TableCell>
                        <TableCell className="max-w-72 whitespace-normal">
                          {submission.review_reason ?? "—"}
                        </TableCell>
                        <TableCell>
                          {canWithdraw ? (
                            <form action={withdrawPublicQuestionSubmission}>
                              <input name="bankId" type="hidden" value={bankId} />
                              <input
                                name="submissionId"
                                type="hidden"
                                value={submission.id}
                              />
                              <FormSubmitButton
                                pendingLabel="Withdrawing…"
                                size="sm"
                                variant="outline"
                              >
                                Withdraw
                              </FormSubmitButton>
                            </form>
                          ) : submission.published_question_id ? (
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/questions/${submission.published_question_id}`}
                              >
                                View public copy
                              </Link>
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t p-4 text-sm">
                <span>
                  {total} result{total === 1 ? "" : "s"} · Page {page} of{" "}
                  {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button asChild disabled={page <= 1} size="sm" variant="outline">
                    <Link href={pageHref(Math.max(1, page - 1))}>Previous</Link>
                  </Button>
                  <Button
                    asChild
                    disabled={page >= totalPages}
                    size="sm"
                    variant="outline"
                  >
                    <Link href={pageHref(Math.min(totalPages, page + 1))}>Next</Link>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No public submissions yet. The source question stays private until
              you explicitly submit an assignment-ready snapshot.
            </div>
          )}
        </section>
      )}
    </BankWorkbenchPage>
  );
}
