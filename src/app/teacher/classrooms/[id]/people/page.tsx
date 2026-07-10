import { redirect } from "next/navigation";

type ClassroomPeopleCompatibilityPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomPeopleCompatibilityPage({
  params,
}: ClassroomPeopleCompatibilityPageProps) {
  const { id } = await params;
  redirect(`/teacher/classrooms/${id}/students`);
}
