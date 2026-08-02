import { AdminPendingLink } from "@/components/admin/admin-pending-link";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FormSubmitButton } from "@/components/form-submit-button";
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
import { requireSuperAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

import { governLegacyPublicBank } from "../governance-actions";

export const dynamic = "force-dynamic";

export default async function AdminBankGovernancePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    page?: string;
    q?: string;
    saved?: string;
  }>;
}) {
  const [, params, supabase] = await Promise.all([
    requireSuperAdmin(),
    searchParams,
    createClient(),
  ]);
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  let query = supabase
    .from("question_banks")
    .select(
      "id, organization_id, owner_id, owner_scope, system_key, name, description, visibility, status, updated_at",
      { count: "exact" },
    )
    .eq("visibility", "public")
    .is("system_key", null)
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (q) query = query.ilike("name", `%${q.replace(/[%_,().]/g, " ")}%`);
  const { data: banks, error, count } = await query;
  if (error) throw new Error(error.message);

  const bankIds = (banks ?? []).map((bank) => bank.id);
  const ownerIds = Array.from(
    new Set(
      (banks ?? [])
        .map((bank) => bank.owner_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const organizationIds = Array.from(
    new Set(
      (banks ?? [])
        .map((bank) => bank.organization_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const [
    { data: members },
    { data: bankQuestions },
    { data: owners },
    { data: organizations },
  ] =
    await Promise.all([
      bankIds.length
        ? supabase
            .from("bank_members")
            .select("bank_id")
            .in("bank_id", bankIds)
            .eq("status", "active")
        : Promise.resolve({ data: [] }),
      bankIds.length
        ? supabase
            .from("bank_questions")
            .select("bank_id")
            .in("bank_id", bankIds)
            .eq("status", "active")
        : Promise.resolve({ data: [] }),
      ownerIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, username, email")
            .in("id", ownerIds)
        : Promise.resolve({ data: [] }),
      organizationIds.length
        ? supabase
            .from("organizations")
            .select("id, name")
            .in("id", organizationIds)
        : Promise.resolve({ data: [] }),
    ]);
  const memberCount = new Map<string, number>();
  const questionCount = new Map<string, number>();
  for (const member of members ?? []) {
    memberCount.set(member.bank_id, (memberCount.get(member.bank_id) ?? 0) + 1);
  }
  for (const question of bankQuestions ?? []) {
    questionCount.set(
      question.bank_id,
      (questionCount.get(question.bank_id) ?? 0) + 1,
    );
  }
  const ownerById = new Map(
    (owners ?? []).map((owner) => [
      owner.id,
      owner.display_name || owner.username || owner.email || owner.id,
    ]),
  );
  const organizationById = new Map(
    (organizations ?? []).map((organization) => [
      organization.id,
      organization.name,
    ]),
  );
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const href = (nextPage: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (nextPage > 1) next.set("page", String(nextPage));
    const value = next.toString();
    return `/admin/questions/banks${value ? `?${value}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Library Support"
      />
      <PageFeedback error={params.error} saved={params.saved} />

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <form className="flex gap-2 border-b p-4">
          <Input
            defaultValue={q}
            name="q"
            placeholder="Search Library name"
          />
          <Button type="submit">Search</Button>
        </form>
        {banks?.length ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Library</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Inventory</TableHead>
                    <TableHead>Review state</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="min-w-96">Governance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banks.map((bank) => (
                    <TableRow key={bank.id}>
                      <TableCell>
                        <p className="font-semibold">{bank.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bank.organization_id
                            ? organizationById.get(bank.organization_id) ??
                              bank.organization_id.slice(0, 8)
                            : "No organization"}
                          {" · "}
                          {bank.status}
                        </p>
                      </TableCell>
                      <TableCell>
                        {bank.owner_id
                          ? ownerById.get(bank.owner_id) ?? bank.owner_id.slice(0, 8)
                          : "System"}
                      </TableCell>
                      <TableCell>
                        <p>{questionCount.get(bank.id) ?? 0} active questions</p>
                        <p>{memberCount.get(bank.id) ?? 0} active members</p>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                          Legacy public-review scope
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                        }).format(new Date(bank.updated_at))}
                      </TableCell>
                      <TableCell>
                        <form
                          action={governLegacyPublicBank}
                          className="flex flex-wrap gap-2"
                        >
                          <input name="bankId" type="hidden" value={bank.id} />
                          <FormSubmitButton
                            name="operation"
                            pendingLabel="Saving…"
                            size="sm"
                            value="set_private"
                            variant="outline"
                          >
                            Make private
                          </FormSubmitButton>
                          <FormSubmitButton
                            name="operation"
                            pendingLabel="Saving…"
                            size="sm"
                            value="set_organization"
                            variant="outline"
                          >
                            Organization only
                          </FormSubmitButton>
                          <FormSubmitButton
                            name="operation"
                            pendingLabel="Archiving…"
                            size="sm"
                            value="archive"
                            variant="outline"
                          >
                            Archive
                          </FormSubmitButton>
                          <FormSubmitButton
                            name="operation"
                            pendingLabel="Disabling…"
                            size="sm"
                            value="disable"
                            variant="destructive"
                          >
                            Disable
                          </FormSubmitButton>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t p-4 text-sm">
              <span>
                {total} results · Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button asChild={page > 1} disabled={page <= 1} size="sm" variant="outline">
                  {page > 1 ? <AdminPendingLink href={href(page - 1)} pendingLabel="Previous page">Previous</AdminPendingLink> : <span>Previous</span>}
                </Button>
                <Button
                  asChild={page < totalPages}
                  disabled={page >= totalPages}
                  size="sm"
                  variant="outline"
                >
                  {page < totalPages ? <AdminPendingLink href={href(page + 1)} pendingLabel="Next page">Next</AdminPendingLink> : <span>Next</span>}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No legacy public-flagged Libraries match this filter.
          </p>
        )}
      </section>
    </div>
  );
}
