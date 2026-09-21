import type { MessageKey } from "@/lib/i18n/messages";

const ASSIGNMENT_ERROR_MESSAGE_KEYS = {
  classroom_organization_mismatch: "assignment.errorClassroomOrganizationMismatch",
  classroom_unavailable: "assignment.errorClassroomUnavailable",
  forbidden: "assignment.errorForbidden",
  inactive_library: "assignment.errorInactiveLibrary",
  invalid_details: "assignment.errorInvalidDetails",
  invalid_due_at: "assignment.errorInvalidDueAt",
  invalid_title: "assignment.errorInvalidTitle",
  missing_classroom: "assignment.errorMissingClassroom",
  missing_content: "assignment.errorMissingContent",
  multiple_classrooms: "assignment.errorMultipleClassrooms",
  selection_unavailable: "assignment.errorSelectionUnavailable",
} as const satisfies Record<string, MessageKey>;

export type AssignmentErrorCode = keyof typeof ASSIGNMENT_ERROR_MESSAGE_KEYS;

export function assignmentErrorMessageKey(value: unknown): MessageKey {
  if (typeof value !== "string") return "common.requestFailed";

  return (
    ASSIGNMENT_ERROR_MESSAGE_KEYS[value as AssignmentErrorCode] ??
    "common.requestFailed"
  );
}
