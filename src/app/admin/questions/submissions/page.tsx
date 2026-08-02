import { AdminPendingLink } from "@/components/admin/admin-pending-link";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { FormSubmitButton } from "@/components/form-submit-button";
import { MathContent } from "@/components/math-content";
import { PageFeedback } from "@/components/page-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Json, PublicQuestionSubmissionStatus } from "@/types/database";

import { reviewPublicQuestionSubmission } from "../governance-actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  error?: string;
  page?: string;
  q?: string;
  saved?: string;
  status?: string;
}>;

type SubmissionEventRow = {
  action_kind: string;
  actor_id: string | null;
  created_at: string;
  evidence: Json;
  reason: string | null;
  submission_id: string;
};

function objectValue(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function snapshotWarnings(snapshot: Record<string, Json | undefined>) {
  const warnings: string[] = [];
  if (!String(snapshot.contentHtml ?? "").trim()) warnings.push("Missing content");
  if (!String(snapshot.solutionHtml ?? "").trim()) warnings.push("Missing solution");
  if (!Array.isArray(snapshot.taxonomy) || !snapshot.taxonomy.length) {
    warnings.push("No approved taxonomy");
  }
  return warnings;
}

function postgrestLikePattern(value: string) {
  return value.replace(/[%_,().]/g, " ").trim();
}

function pageHref({
  page,
  q,
  status,
}: {
  page: number;
  q: string;
  status: string;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/questions/submissions${query ? `?${query}` : ""}`;
}

export default async function AdminPublicSubmissionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [profile, params, supabase] = await Promise.all([
    requireSuperAdmin(),
    searchParams,
    createClient(),
  ]);
  const q = (params.q ?? "").trim();
  const allowedStatuses: PublicQuestionSubmissionStatus[] = [
    "pending",
    "in_review",
    "changes_requested",
    "accepted",
    "rejected",
    "withdrawn",
  ];
  const status = allowedStatuses.includes(
    params.status as PublicQuestionSubmissionStatus,
  )
    ? (params.status as PublicQuestionSubmissionStatus)
    : "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  let query = supabase
    .from("public_question_submissions")
    .select(
      "id, source_bank_id, source_question_id, submitted_by, submitted_snapshot, status, review_reason, reviewed_by, reviewed_at, published_question_id, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status) query = query.eq("status", status);
  const search = postgrestLikePattern(q);
  if (search) {
    query = query.or(
      `submitted_snapshot->>title.ilike.%${search}%,submitted_snapshot->>questionCode.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query;
  const setupNeeded = error && ["42P01", "42703"].includes(error.code ?? "");
  if (error && !setupNeeded) throw new Error(error.message);

  const submissions = data ?? [];
  const bankIds = Array.from(
    new Set(submissions.map((submission) => submission.source_bank_id)),
  );
  const profileIds = Array.from(
    new Set(submissions.map((submission) => submission.submitted_by)),
  );
  const submissionIds = submissions.map((submission) => submission.id);
  const [{ data: banks }, { data: profiles }, { data: events }] = await Promise.all([
    bankIds.length
      ? supabase.from("question_banks").select("id, name").in("id", bankIds)
      : Promise.resolve({ data: [] }),
    profileIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, username, email")
          .in("id", profileIds)
      : Promise.resolve({ data: [] }),
    submissionIds.length
      ? supabase
          .from("public_question_submission_events")
          .select("submission_id, action_kind, actor_id, reason, evidence, created_at")
          .in("submission_id", submissionIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const bankNameById = new Map((banks ?? []).map((bank) => [bank.id, bank.name]));
  const submitterById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.display_name || profile.username || profile.email || profile.id,
    ]),
  );
  const eventsBySubmission = new Map<string, SubmissionEventRow[]>();
  for (const event of events ?? []) {
    const current = eventsBySubmission.get(event.submission_id) ?? [];
    current.push(event);
    eventsBySubmission.set(event.submission_id, current);
  }
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Teacher Submissions"
      />
      <PageFeedback error={params.error} saved={params.saved} />

      {setupNeeded ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          Apply forward migration 0055 to enable immutable public submissions.
          Existing Library content remains private.
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <form className="grid gap-3 border-b p-4 md:grid-cols-[1fr_14rem_auto]">
            <Input
              defaultValue={q}
              name="q"
              placeholder="Snapshot title or code"
            />
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              defaultValue={status}
              name="status"
            >
              <option value="">All statuses</option>
              {allowedStatuses.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <Button type="submit">Filter</Button>
          </form>

          {submissions.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Snapshot</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead className="min-w-96">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((submission) => {
                      const snapshot = objectValue(submission.submitted_snapshot);
                      const assets = Array.isArray(snapshot.assets)
                        ? snapshot.assets.length
                        : 0;
                      const taxonomy = Array.isArray(snapshot.taxonomy)
                        ? snapshot.taxonomy.length
                        : 0;
                      const reviewable = ["pending", "in_review"].includes(
                        submission.status,
                      );
                      const warnings = snapshotWarnings(snapshot);
                      const submissionEvents =
                        eventsBySubmission.get(submission.id) ?? [];

                      return (
                        <TableRow key={submission.id}>
                          <TableCell className="max-w-96 whitespace-normal">
                            <p className="font-semibold">
                              {String(snapshot.title ?? "Untitled snapshot")}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {String(snapshot.questionCode ?? submission.id)}
                            </p>
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer font-medium">
                                Inspect immutable content
                              </summary>
                              <MathContent
                                className="prose prose-sm mt-2 max-w-none rounded border p-3"
                                format="html"
                                value={String(snapshot.contentHtml ?? "")}
                              />
                              {snapshot.solutionHtml ? (
                                <MathContent
                                  className="prose prose-sm mt-2 max-w-none rounded border p-3"
                                  format="html"
                                  value={String(snapshot.solutionHtml)}
                                />
                              ) : null}
                              <div className="mt-2 rounded border p-3">
                                <p className="font-medium">Approved taxonomy</p>
                                <p className="mt-1 text-muted-foreground">
                                  {Array.isArray(snapshot.taxonomy)
                                    ? snapshot.taxonomy
                                        .map((value) => {
                                          const taxonomyItem = objectValue(value);
                                          return String(taxonomyItem.tagId ?? "");
                                        })
                                        .filter(Boolean)
                                        .join(", ") || "None"
                                    : "None"}
                                </p>
                                <p className="mt-2 font-medium">Reviewed assets</p>
                                <p className="mt-1 text-muted-foreground">
                                  {Array.isArray(snapshot.assets)
                                    ? snapshot.assets
                                        .map((value) => {
                                          const asset = objectValue(value);
                                          return String(
                                            asset.label ?? asset.altText ?? "Image",
                                          );
                                        })
                                        .join(", ") || "None"
                                    : "None"}
                                </p>
                              </div>
                            </details>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <p>
                              {bankNameById.get(submission.source_bank_id) ??
                                submission.source_bank_id.slice(0, 8)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {submitterById.get(submission.submitted_by) ??
                                submission.submitted_by.slice(0, 8)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <AdminStatusBadge status={submission.status} />
                          </TableCell>
                          <TableCell>
                            <p>{taxonomy} taxonomy tags</p>
                            <p>{assets} reviewed images</p>
                            <p className="text-xs text-muted-foreground">
                              Source PDFs are never copied.
                            </p>
                            {warnings.length ? (
                              <ul className="mt-2 list-disc pl-4 text-xs text-amber-800">
                                {warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-xs text-emerald-700">
                                Snapshot validation checks pass.
                              </p>
                            )}
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer font-medium">
                                Review history ({submissionEvents.length})
                              </summary>
                              <ol className="mt-2 space-y-2">
                                {submissionEvents.map((event) => (
                                  <li key={`${event.action_kind}-${event.created_at}`}>
                                    <span className="font-medium">
                                      {event.action_kind.replaceAll("_", " ")}
                                    </span>
                                    {" · "}
                                    {new Intl.DateTimeFormat("en", {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(new Date(event.created_at))}
                                    {event.reason ? ` · ${event.reason}` : ""}
                                  </li>
                                ))}
                              </ol>
                            </details>
                          </TableCell>
                          <TableCell>
                            {reviewable ? (
                              <form
                                action={reviewPublicQuestionSubmission}
                                className="space-y-2"
                              >
                                <input
                                  name="submissionId"
                                  type="hidden"
                                  value={submission.id}
                                />
                                <Textarea
                                  name="reason"
                                  placeholder="Reason (required for changes/reject)"
                                  rows={2}
                                />
                                <div className="flex flex-wrap gap-2">
                                  {submission.status === "pending" ? (
                                    <FormSubmitButton
                                      name="decision"
                                      pendingLabel="Starting…"
                                      size="sm"
                                      value="start_review"
                                      variant="outline"
                                    >
                                      Start review
                                    </FormSubmitButton>
                                  ) : null}
                                  <FormSubmitButton
                                    name="decision"
                                    pendingLabel="Publishing…"
                                    size="sm"
                                    value="approve"
                                  >
                                    Approve and publish
                                  </FormSubmitButton>
                                  <FormSubmitButton
                                    name="decision"
                                    pendingLabel="Saving…"
                                    size="sm"
                                    value="request_changes"
                                    variant="outline"
                                  >
                                    Request changes
                                  </FormSubmitButton>
                                  <FormSubmitButton
                                    name="decision"
                                    pendingLabel="Rejecting…"
                                    size="sm"
                                    value="reject"
                                    variant="destructive"
                                  >
                                    Reject
                                  </FormSubmitButton>
                                </div>
                              </form>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                {submission.review_reason ?? "Decision complete."}
                                {submission.published_question_id ? (
                                  <Button
                                    asChild
                                    className="mt-2"
                                    size="sm"
                                    variant="outline"
                                  >
                                    <AdminPendingLink
                                      href={`/questions/${submission.published_question_id}`}
                                      pendingLabel="Public copy"
                                    >
                                      View public copy
                                    </AdminPendingLink>
                                  </Button>
                                ) : null}
                              </div>
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
                  {total} results · Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button asChild={page > 1} disabled={page <= 1} size="sm" variant="outline">
                    {page > 1 ? <AdminPendingLink href={pageHref({ page: page - 1, q, status })} pendingLabel="Previous page">
                      Previous
                    </AdminPendingLink> : <span>Previous</span>}
                  </Button>
                  <Button
                    asChild={page < totalPages}
                    disabled={page >= totalPages}
                    size="sm"
                    variant="outline"
                  >
                    {page < totalPages ? <AdminPendingLink href={pageHref({ page: page + 1, q, status })} pendingLabel="Next page">
                      Next
                    </AdminPendingLink> : <span>Next</span>}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No public submissions match this filter.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
