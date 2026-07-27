import Link from "next/link";
import { notFound } from "next/navigation";

import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  getTeacherQuestionBankDetail,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import {
  bankBlueprintRelationLabel,
  BlueprintLibrarySchemaMissingError,
  blueprintKindLabel,
  blueprintStatusLabel,
  blueprintVisibilityLabel,
  listBankLinkedBlueprints,
  summarizeBlueprintTaxonomy,
} from "@/lib/teacher-blueprints";
import { readinessWarnings, sourceExampleCount } from "@/lib/teacher-blueprint-builder";

import {
  BankBadge,
  BankHeroPanel,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function SetupNeededState({ message }: { message: string }) {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Blueprint links are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {message}
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankBlueprintsPage({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const supabase = await createClient();
  let detail;

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return (
        <SetupNeededState message="Apply clean migration 0025 before using Library Blueprint links." />
      );
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  let links: Awaited<ReturnType<typeof listBankLinkedBlueprints>> = [];

  try {
    links = await listBankLinkedBlueprints({ bankId, supabase });
  } catch (error) {
    if (error instanceof BlueprintLibrarySchemaMissingError) {
      return (
        <SetupNeededState message="Apply clean migration 0031 before using Library-linked Blueprints." />
      );
    }

    throw error;
  }

  const { bank, currentUserRole } = detail;

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to Library</Link>
            </Button>
            <Button asChild>
              <Link href={`/teacher/blueprints/new?bankId=${bank.id}`}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                Build from Library questions
              </Link>
            </Button>
          </>
        }
        badges={
          <>
            <BankBadge tone="sky">
              {questionBankVisibilityLabel(bank.visibility)}
            </BankBadge>
            <BankBadge tone="blue">
              {bankMemberRoleLabel(currentUserRole ?? "viewer")}
            </BankBadge>
          </>
        }
        eyebrow="Library Blueprints"
        title={`Blueprint links for ${bank.name}`}
      >
        <p>
          Blueprints linked to this Library are planning assets. They can organize
          reusable question patterns, but they do not create student-visible
          work without Review Draft and Library approval gates.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          action={
            <Button asChild variant="outline">
              <Link href="/teacher/blueprints">Open Blueprint Library</Link>
            </Button>
          }
          description="Library-linked Blueprints stay visible to Library members only unless the Blueprint has broader visibility."
          title="Blueprints linked to this Library"
        />
        <div className="p-5">
          {links.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {links.map((link) =>
                link.blueprint ? (
                  <article
                    className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                    key={link.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <BankBadge tone="blue">
                        {bankBlueprintRelationLabel(link.relation_kind)}
                      </BankBadge>
                      <BankBadge tone="sky">
                        {blueprintVisibilityLabel(link.blueprint.visibility)}
                      </BankBadge>
                      <BankBadge>
                        {blueprintStatusLabel(link.blueprint.status)}
                      </BankBadge>
                    </div>
                    <h2 className="mt-4 text-xl font-bold text-slate-950">
                      {link.blueprint.title}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                      {link.blueprint.description ||
                        "Library-linked reusable planning asset."}
                    </p>
                    <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Kind
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {blueprintKindLabel(link.blueprint.blueprint_kind)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Taxonomy
                        </dt>
                        <dd className="mt-1 break-words font-semibold text-slate-900">
                          {summarizeBlueprintTaxonomy(link.blueprint.taxonomy_targets)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Source examples
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {sourceExampleCount(link.blueprint)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Readiness
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {readinessWarnings(link.blueprint).length
                            ? "Needs planning"
                            : "Preview ready"}
                        </dd>
                      </div>
                    </dl>
                    <Button asChild className="mt-4" variant="outline">
                      <Link href={`/teacher/blueprints/${link.blueprint.id}`}>
                        Open Blueprint
                      </Link>
                    </Button>
                  </article>
                ) : null,
              )}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Sparkles aria-hidden="true" className="mx-auto h-10 w-10 text-sky-600" />
              <h2 className="mt-4 text-2xl font-bold text-slate-950">
                No Blueprints linked to this Library yet.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Blueprints generated from this Library or imported into this Library
                will appear here.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`/teacher/blueprints/new?bankId=${bank.id}`}>
                    Create Blueprint from this Library
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/teacher/blueprints">Open Blueprint Library</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
