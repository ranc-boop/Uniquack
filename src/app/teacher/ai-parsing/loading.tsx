import { AIPdfImportLoadingSkeleton } from "@/components/ai-pdf-import-loading-skeleton";

export default function TeacherAiParsingLoading() {
  return (
    <AIPdfImportLoadingSkeleton
      backHref="/teacher"
      backLabel="Back to teacher"
      description="Loading bank targets, private import controls, and recent bank-scoped AI Parsing activity."
      detailsLabel="Loading bank-scoped AI Parsing access..."
      importTitle="Import into a Question Bank"
      showSettingsAction={false}
      title="AI Parsing"
    />
  );
}
