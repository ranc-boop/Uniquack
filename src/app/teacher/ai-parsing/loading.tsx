import { AIPdfImportLoadingSkeleton } from "@/components/ai-pdf-import-loading-skeleton";

export default function TeacherAiParsingLoading() {
  return (
    <AIPdfImportLoadingSkeleton
      backHref="/teacher"
      backLabel="Back to teacher"
      description="Loading Library targets, private import controls, and recent Library-scoped AI Parsing activity."
      detailsLabel="Loading Library-scoped AI Parsing access..."
      importTitle="Import into a Library"
      showSettingsAction={false}
      title="AI Parsing"
    />
  );
}
