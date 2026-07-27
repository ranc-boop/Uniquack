import { StudentModuleLoadingSkeleton } from "@/components/student/student-loading-skeletons";

export default function StudentPublicLibraryLoading() {
  return (
    <StudentModuleLoadingSkeleton
      description="Browse public study material while private teacher Libraries stay private."
      eyebrow="Discovery"
      title="Public Library"
    />
  );
}
