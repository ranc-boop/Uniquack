import { AdminQuestionLibraryNav } from "@/components/admin/admin-question-library-nav";
import {
  QuestionManagementWorkbench,
  type QuestionWorkbenchItem,
} from "@/components/questions/question-management-workbench";
import { requireAdmin } from "@/lib/auth/guards";
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
  const [profile, params, supabase] = await Promise.all([
    requireAdmin(),
    searchParams,
    createClient(),
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
  const { data: details } = rows.length
    ? await supabase
        .from("questions")
        .select("id, solution_html")
        .in("id", rows.map((row) => row.question_id))
    : { data: [] };
  const detailById = new Map((details ?? []).map((row) => [row.id, row]));
  const items: QuestionWorkbenchItem[] = rows.map((row) => ({
    actionHref: `/admin/questions/new?source=${row.question_id}`,
    actionLabel: "创建修订",
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
    sourceLabel: "Official Public Library",
    taxonomyReady: true,
    title: row.title,
  }));

  return (
    <div className="space-y-4">
      <AdminQuestionLibraryNav role={profile.role} />
      {error ? (
        <div
          className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          Official Public Library could not be loaded: {error.message}
        </div>
      ) : null}
      <QuestionManagementWorkbench
        activeStatus="approved"
        baseHref="/admin/questions"
        canCreate
        createHref="/admin/questions/new"
        currentPage={page}
        emptyDescription="批准投稿或完成官方题目审批后，它们会出现在这里。"
        items={items}
        libraryName="Public Library"
        mode="admin"
        pageSize={PAGE_SIZE}
        pendingHref="/admin/review"
        query={query}
        selectedId={selectedId}
        totalCount={Number(rows[0]?.total_count ?? 0)}
      />
    </div>
  );
}
