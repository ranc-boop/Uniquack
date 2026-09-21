import Link from "next/link";
import {
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireTeacher } from "@/lib/auth/guards";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import { formatNumber, type Locale } from "@/lib/i18n/locale";
import {
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
  type TeacherQuestionBankSummary,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import { BankBadge, BankWorkbenchPage } from "./bank-ui";

export const dynamic = "force-dynamic";

const filterValues = [
  "all",
  "private",
  "shared",
  "organization",
  "public",
  "needs-review",
  "assignment-ready",
  "recent",
] as const;

function libraryFilterOptions(locale: Locale) {
  return [
    { label: translate(locale, "teacher.allLibraries"), value: "all" },
    { label: translate(locale, "teacher.private"), value: "private" },
    { label: translate(locale, "teacher.shared"), value: "shared" },
    { label: translate(locale, "teacher.organization"), value: "organization" },
    { label: translate(locale, "teacher.public"), value: "public" },
    { label: translate(locale, "teacher.needsReview"), value: "needs-review" },
    { label: translate(locale, "teacher.assignmentReady"), value: "assignment-ready" },
    { label: translate(locale, "teacher.recentlyUpdated"), value: "recent" },
  ] as const;
}

const validFilters = new Set<string>(
  filterValues,
);

function applyFilters(
  banks: TeacherQuestionBankSummary[],
  filter: string,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchedBanks = normalizedQuery
    ? banks.filter((bank) => bank.name.toLocaleLowerCase().includes(normalizedQuery))
    : banks;

  switch (filter) {
    case "private":
    case "shared":
    case "organization":
    case "public":
      return searchedBanks.filter((bank) => bank.visibility === filter);
    case "needs-review":
      return searchedBanks.filter((bank) => bank.reviewDraftCount > 0);
    case "assignment-ready":
      return searchedBanks.filter((bank) => bank.assignmentReadyCount > 0);
    case "recent":
      return [...searchedBanks].sort(
        (first, second) =>
          new Date(second.updated_at).getTime() -
          new Date(first.updated_at).getTime(),
      );
    default:
      return searchedBanks;
  }
}

function localizedBankVisibility(
  locale: Locale,
  visibility: TeacherQuestionBankSummary["visibility"],
) {
  const keyByVisibility = {
    organization: "teacher.organization",
    private: "teacher.private",
    public: "teacher.legacyPublicReview",
    shared: "teacher.shared",
  } as const;

  return translate(locale, keyByVisibility[visibility]);
}

function localizedBankStatus(
  locale: Locale,
  status: TeacherQuestionBankSummary["status"],
) {
  const keyByStatus = {
    active: "teacher.active",
    archived: "teacher.archived",
    disabled: "teacher.disabled",
  } as const;

  return translate(locale, keyByStatus[status]);
}

function SetupNeededState({ locale }: { locale: Locale }) {
  return (
    <section
      className="rounded-xl border border-rose-200 bg-white px-6 py-8"
      role="alert"
    >
      <h2 className="text-lg font-semibold text-slate-950">
        {translate(locale, "teacher.librariesUnavailable")}
      </h2>
    </section>
  );
}

function LibraryRow({ bank, locale }: { bank: TeacherQuestionBankSummary; locale: Locale }) {
  const counts = [
    [translate(locale, "teacher.questions"), bank.questionCount],
    [translate(locale, "teacher.review"), bank.reviewDraftCount],
    [translate(locale, "teacher.ready"), bank.assignmentReadyCount],
  ] satisfies Array<[string, number]>;

  return (
    <article className="px-5 py-6 md:px-7" key={bank.id}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BankBadge tone="sky">
              {localizedBankVisibility(locale, bank.visibility)}
            </BankBadge>
            <BankBadge tone={bank.reviewDraftCount ? "amber" : "slate"}>
              {bank.reviewDraftCount
                ? translate(locale, "teacher.toReview", { count: formatNumber(locale, bank.reviewDraftCount) })
                : localizedBankStatus(locale, bank.status)}
            </BankBadge>
          </div>

          <h2 className="mt-3 break-words text-xl font-bold text-slate-950 md:text-2xl">
            <Link
              className="rounded-sm hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              href={`/teacher/banks/${bank.id}`}
            >
              {bank.name}
            </Link>
          </h2>

          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {counts.map(([label, value]) => (
              <div className="flex items-baseline gap-2" key={label}>
                <dt className="text-sm font-medium text-slate-500">{label}</dt>
                <dd className="text-base font-bold tabular-nums text-slate-950">
                  {formatNumber(locale, value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild className="min-h-11">
            <Link href={`/teacher/banks/${bank.id}`}>{translate(locale, "common.open")}</Link>
          </Button>
          <details className="group relative">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              {translate(locale, "teacher.more")}
            </summary>
            <div className="absolute bottom-full right-0 z-20 mb-2 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl xl:bottom-auto xl:top-full xl:mb-0 xl:mt-2">
              <Link
                className="block px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
                href={`/teacher/banks/${bank.id}/review`}
              >
                {translate(locale, "teacher.reviewDrafts")}
              </Link>
              <Link
                className="block px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
                href={`/teacher/banks/${bank.id}/imports`}
              >
                {translate(locale, "teacher.importMaterial")}
              </Link>
              {bank.assignmentReadyCount ? (
                <Link
                  className="block px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
                  href={`/teacher/publish?sourceBankId=${bank.id}`}
                >
                  {translate(locale, "teacher.createAssignment")}
                </Link>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

export default async function TeacherBanksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const [profile, locale] = await Promise.all([requireTeacher(), getRequestLocale()]);
  const queryParams = await searchParams;
  const filterOptions = libraryFilterOptions(locale);
  const supabase = await createClient();
  let banks: TeacherQuestionBankSummary[];
  let setupNeeded = false;

  try {
    banks = await listTeacherQuestionBanks({
      profileId: profile.id,
      supabase,
    });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      setupNeeded = true;
      banks = [];
    } else {
      throw error;
    }
  }

  const activeFilter =
    queryParams.filter && validFilters.has(queryParams.filter)
      ? queryParams.filter
      : "all";
  const query = queryParams.q?.trim() ?? "";
  const filteredBanks = applyFilters(banks, activeFilter, query);

  return (
    <BankWorkbenchPage className="space-y-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#1D1D1F]">
          {translate(locale, "teacher.libraries")}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link className="inline-flex items-center gap-2" href="/teacher/banks/new">
              <Plus aria-hidden="true" className="h-4 w-4" />
              {translate(locale, "teacher.createLibrary")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              className="inline-flex items-center gap-2"
              href="/teacher/banks/join"
            >
              <Share2 aria-hidden="true" className="h-4 w-4" />
              {translate(locale, "teacher.joinByCode")}
            </Link>
          </Button>
        </div>
      </header>

      {setupNeeded ? (
        <SetupNeededState locale={locale} />
      ) : (
        <section className="overflow-visible rounded-xl border border-slate-200 bg-white">
          <form
            action="/teacher/banks"
            className="border-b border-slate-200 px-5 py-5 md:px-7"
            method="get"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{translate(locale, "teacher.searchLibraries")}</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"
                />
                <Input
                  className="min-h-11 pl-10"
                  defaultValue={query}
                  name="q"
                  placeholder={translate(locale, "teacher.searchLibraries")}
                  type="search"
                />
              </label>
              <Button className="min-h-11" type="submit" variant="outline">
                {translate(locale, "common.search")}
              </Button>
              <details
                className="group relative"
                open={activeFilter !== "all"}
              >
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                  {translate(locale, "teacher.filter")}
                </summary>
                <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:absolute lg:right-0 lg:z-20 lg:w-72 lg:bg-white lg:shadow-xl">
                  <label
                    className="text-sm font-semibold text-slate-700"
                    htmlFor="library-filter"
                  >
                    {translate(locale, "teacher.show")}
                  </label>
                  <select
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    defaultValue={activeFilter}
                    id="library-filter"
                    name="filter"
                  >
                    {filterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/teacher/banks">{translate(locale, "library.reset")}</Link>
                    </Button>
                    <Button size="sm" type="submit">
                      {translate(locale, "teacher.apply")}
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          </form>

          {filteredBanks.length ? (
            <div className="divide-y divide-slate-200">
              {filteredBanks.map((bank) => (
                <LibraryRow bank={bank} key={bank.id} locale={locale} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <h2 className="text-lg font-semibold text-slate-950">
                {banks.length
                  ? translate(locale, "teacher.noMatchingLibraries")
                  : translate(locale, "teacher.noLibrariesYet")}
              </h2>
              {!banks.length ? (
                <Button asChild className="mt-5">
                  <Link href="/teacher/banks/new">{translate(locale, "teacher.createLibrary")}</Link>
                </Button>
              ) : null}
            </div>
          )}
        </section>
      )}
    </BankWorkbenchPage>
  );
}
