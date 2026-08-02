import { redirect } from "next/navigation";

export default async function TeacherBankSettingsRedirect({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  const { bankId } = await params;
  redirect(`/teacher/banks/${bankId}`);
}
