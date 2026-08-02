import { redirect } from "next/navigation";

import { isDatabaseUuid } from "@/lib/teacher-focus-workspace";

export default async function NewBankAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ selection?: string }>;
}) {
  const [{ bankId }, query] = await Promise.all([params, searchParams]);
  const destination = new URLSearchParams({ sourceBankId: bankId });

  if (query.selection && isDatabaseUuid(query.selection)) {
    destination.set("selection", query.selection);
  }

  redirect(`/teacher/publish?${destination.toString()}`);
}
