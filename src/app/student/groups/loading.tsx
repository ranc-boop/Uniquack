import { StudentModuleLoadingSkeleton } from "@/components/student/student-loading-skeletons";

export default function StudentGroupsLoading() {
  return (
    <StudentModuleLoadingSkeleton
      description="A future peer self-study space, separate from teacher classrooms."
      eyebrow="Peer study"
      title="Study Groups"
    />
  );
}
