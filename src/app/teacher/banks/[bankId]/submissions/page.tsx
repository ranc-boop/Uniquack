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
import { formatDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import type {
  Json,
  PublicQuestionSubmissionStatus,
} from "@/types/database";

import { withdrawPublicQuestionSubmission } from "../../actions";
import {
  BankBadge,
  BankRouteTabs,
  BankHeroPanel,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function objectValue(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

export default async function TeacherPublicSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const profile = await requireTeacher();
  const locale = await getRequestLocale();
  const t = (
    key: Parameters<typeof translate>[1],
    values?: Parameters<typeof translate>[2],
  ) => translate(locale, key, values);
  const statusLabel = (value: PublicQuestionSubmissionStatus) => {
    const labels: Record<PublicQuestionSubmissionStatus, string> = {
      accepted: t("teacherLibrary.publicSubmissionStatusAccepted"),
      changes_requested: t("teacherLibrary.publicSubmissionStatusChangesRequested"),
      in_review: t("teacherLibrary.publicSubmissionStatusInReview"),
      pending: t("teacherLibrary.publicSubmissionStatusPending"),
      rejected: t("teacherLibrary.publicSubmissionStatusRejected"),
      withdrawn: t("teacherLibrary.publicSubmissionStatusWithdrawn"),
    };

    return labels[value];
  };
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
      <BankHeroPanel subtitle={detail.bank.name} title={t("teacherLibrary.publicSubmissions")} />
      <BankRouteTabs
        bankId={bankId}
        currentUserRole={detail.currentUserRole}
      />

      {!canManage ? (
        <section className="rounded-lg border bg-white p-6 text-sm text-muted-foreground">
          {t("teacherLibrary.publicSubmissionsReadOnly")}
        </section>
      ) : setupNeeded ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          {t("teacherLibrary.publicSubmissionsMigrationNotice")}
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <BankSectionHeader title={t("teacherLibrary.submissionHistory")} />
          <form className="grid gap-3 border-y p-4 md:grid-cols-[minmax(14rem,1fr)_13rem_auto]">
            <div className="space-y-2">
              <Label htmlFor="submission-search">{t("teacherLibrary.searchSnapshots")}</Label>
              <Input
                defaultValue={query.q ?? ""}
                id="submission-search"
                name="q"
                placeholder={t("teacherLibrary.questionTitleOrCode")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-status">{t("teacherLibrary.status")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={status ?? ""}
                id="submission-status"
                name="status"
              >
                <option value="">{t("teacherLibrary.allStatuses")}</option>
                {allowedStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">{t("teacherLibrary.filter")}</Button>
              <Button asChild type="button" variant="outline">
                <Link href={`/teacher/banks/${bankId}/submissions`}>
                  {t("teacherLibrary.reset")}
                </Link>
              </Button>
            </div>
          </form>
          {submissions?.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("teacherLibrary.questionSnapshot")}</TableHead>
                    <TableHead>{t("teacherLibrary.status")}</TableHead>
                    <TableHead>{t("teacherLibrary.submitted")}</TableHead>
                    <TableHead>{t("teacherLibrary.reviewNote")}</TableHead>
                    <TableHead>{t("teacherLibrary.action")}</TableHead>
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
                            {String(snapshot.title ?? t("teacherLibrary.untitledSnapshot"))}
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
                        <TableCell>{formatDateTime(locale, submission.created_at)}</TableCell>
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
                                pendingLabel={t("teacherLibrary.withdrawingSubmission")}
                                size="sm"
                                variant="outline"
                              >
                                {t("teacherLibrary.withdraw")}
                              </FormSubmitButton>
                            </form>
                          ) : submission.published_question_id ? (
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/questions/${submission.published_question_id}`}
                              >
                                {t("teacherLibrary.viewPublicCopy")}
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
                  {t("teacherLibrary.resultsPage", {
                    total: formatNumber(locale, total),
                    page: formatNumber(locale, page),
                    totalPages: formatNumber(locale, totalPages),
                  })}
                </span>
                <div className="flex gap-2">
                  <Button asChild disabled={page <= 1} size="sm" variant="outline">
                    <Link href={pageHref(Math.max(1, page - 1))}>{t("teacherLibrary.previous")}</Link>
                  </Button>
                  <Button
                    asChild
                    disabled={page >= totalPages}
                    size="sm"
                    variant="outline"
                  >
                    <Link href={pageHref(Math.min(totalPages, page + 1))}>{t("teacherLibrary.next")}</Link>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t("teacherLibrary.noPublicSubmissionsDescription")}
            </div>
          )}
        </section>
      )}
    </BankWorkbenchPage>
  );
}
