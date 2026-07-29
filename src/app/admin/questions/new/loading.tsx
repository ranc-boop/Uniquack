import { AdminLoadingState } from "@/components/admin/admin-loading-state";

export default function AdminQuestionCreateLoading() {
  return (
    <AdminLoadingState
      description="Loading the manual Review Draft editor and taxonomy catalog."
      label="Loading question editor..."
      rows={7}
    />
  );
}
