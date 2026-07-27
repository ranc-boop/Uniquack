import { StudentModuleLoadingSkeleton } from "@/components/student/student-loading-skeletons";

export default function StudentLibraryLoading() {
  return (
    <StudentModuleLoadingSkeleton
      description="Your saved questions, study sets, and mistake collections will live here."
      eyebrow="Self-study"
      title="Study Library"
    />
  );
}
