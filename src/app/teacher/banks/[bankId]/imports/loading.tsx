import { AIPdfImportLoadingSkeleton } from "@/components/ai-pdf-import-loading-skeleton";

export default function TeacherBankImportsLoading() {
  return (
    <AIPdfImportLoadingSkeleton
      backHref="/teacher/banks"
      backLabel="Back to banks"
      description="Loading this bank's PDF import controls, Review Draft handoff, and recent bank-scoped imports."
      detailsLabel="Loading private bank import access..."
      importTitle="Create bank Review Drafts"
      showSettingsAction={false}
      title="Bank AI Parsing"
    />
  );
}
