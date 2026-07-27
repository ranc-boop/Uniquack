import { AIPdfImportLoadingSkeleton } from "@/components/ai-pdf-import-loading-skeleton";

export default function TeacherBankImportsLoading() {
  return (
    <AIPdfImportLoadingSkeleton
      backHref="/teacher/banks"
      backLabel="Back to Libraries"
      description="Loading this Library's PDF import controls, Review Draft handoff, and recent Library-scoped imports."
      detailsLabel="Loading private Library import access..."
      importTitle="Create Library Review Drafts"
      showSettingsAction={false}
      title="Library AI Parsing"
    />
  );
}
