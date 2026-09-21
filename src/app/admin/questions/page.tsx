import { archiveOfficialQuestion } from "@/app/admin/questions/actions";
import {
  QuestionManagementWorkbench,
  type QuestionWorkbenchItem,
} from "@/components/questions/question-management-workbench";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type OfficialQuestionSearchRow = {
  approval_status: "approved";
  content_html: string;
  difficulty_rating: number;
  question_code: string;
  question_id: string;
  question_type: string;
  title: string;
  total_count: number;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminOfficialPublicLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, params, supabase, locale] = await Promise.all([
    requireAdmin(),
    searchParams,
    createClient(),
    getRequestLocale(),
  ]);
  const query = (first(params.q) ?? "").trim().slice(0, 80);
  const selectedId = first(params.selected);
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  const { data, error } = await supabase.rpc(
    "search_official_public_questions_v2",
    {
      difficulty_max: null,
      difficulty_min: null,
      page_limit: PAGE_SIZE,
      page_offset: (page - 1) * PAGE_SIZE,
      query_text: query || null,
    },
  );
  const rows = (data ?? []) as OfficialQuestionSearchRow[];
  const { data: officialBank } = await supabase
    .from("question_banks")
    .select("id")
    .eq("system_key", "official_public")
    .eq("status", "active")
    .maybeSingle();
  const [detailResult, membershipResult] = rows.length
    ? await Promise.all([
        supabase
          .from("questions")
          .select("id, solution_html")
          .in("id", rows.map((row) => row.question_id)),
        officialBank
          ? supabase
              .from("bank_questions")
              .select("id, question_id")
              .eq("bank_id", officialBank.id)
              .eq("status", "active")
              .in("question_id", rows.map((row) => row.question_id))
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];
  const details = detailResult.data ?? [];
  const memberships = membershipResult.data ?? [];
  const detailById = new Map((details ?? []).map((row) => [row.id, row]));
  const membershipByQuestionId = new Map(
    memberships.map((row) => [row.question_id, row.id]),
  );
  const items: QuestionWorkbenchItem[] = rows.map((row) => ({
    archiveId: membershipByQuestionId.get(row.question_id),
    actionHref: `/admin/questions/new?source=${row.question_id}`,
    actionLabel: translate(locale, "questions.createRevision"),
    approvalStatus: "approved",
    contentHtml: row.content_html,
    gradingCapability:
      row.question_type === "mcq" ||
      row.question_type === "fill_blank"
        ? "deterministic"
        : "ai_review",
    id: row.question_id,
    questionCode: row.question_code,
    questionType: row.question_type,
    solutionHtml: detailById.get(row.question_id)?.solution_html ?? null,
    sourceLabel: translate(locale, "admin.publicLibrary"),
    taxonomyReady: true,
    title: row.title,
  }));

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Public Library" />
      {error ? (
        <div
          className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {translate(locale, "common.requestFailed")}
        </div>
      ) : null}
      <QuestionManagementWorkbench
        activeStatus="approved"
        archiveAction={archiveOfficialQuestion}
        baseHref="/admin/questions"
        canCreate
        createHref="/admin/questions/new"
        currentPage={page}
        items={items}
        libraryName="Public Library"
        mode="admin"
        pageSize={PAGE_SIZE}
        pendingHref="/admin/review"
        query={query}
        selectedId={selectedId}
        showTitle={false}
        totalCount={Number(rows[0]?.total_count ?? 0)}
      />
    </div>
  );
}
