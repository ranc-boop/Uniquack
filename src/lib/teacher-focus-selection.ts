import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isDatabaseUuid,
  parseCurrentPageFocusSelection,
} from "@/lib/teacher-focus-workspace";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type TeacherFocusReceiptRpc = {
  rpc(
    functionName:
      | "create_teacher_focus_selection_receipt"
      | "read_teacher_focus_selection_receipt",
    args:
      | {
          p_selected_ids: string[];
          p_surface: "questions" | "review";
          p_target_bank_id: string;
        }
      | {
          p_receipt_id: string;
          p_surface: "questions" | "review";
          p_target_bank_id: string;
        },
  ): Promise<{
    data: string | string[] | null;
    error: { message: string } | null;
  }>;
};

export async function createTeacherFocusSelectionReceipt({
  bankId,
  selectedIds,
  supabase,
  surface,
}: {
  bankId: string;
  selectedIds: string[];
  supabase: SupabaseServerClient;
  surface: "questions" | "review";
}) {
  const validatedIds = parseCurrentPageFocusSelection(selectedIds);

  if (!isDatabaseUuid(bankId) || !validatedIds) {
    throw new Error("Invalid current-page focus selection.");
  }

  const { data, error } = await (
    supabase as unknown as TeacherFocusReceiptRpc
  ).rpc("create_teacher_focus_selection_receipt", {
    p_selected_ids: validatedIds,
    p_surface: surface,
    p_target_bank_id: bankId,
  });

  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !isDatabaseUuid(data)) {
    throw new Error("Focus selection receipt was not created.");
  }

  return data;
}

export async function readTeacherFocusSelectionReceipt({
  bankId,
  receiptId,
  supabase,
  surface,
}: {
  bankId: string;
  receiptId: string;
  supabase: SupabaseServerClient;
  surface: "questions" | "review";
}) {
  if (!isDatabaseUuid(bankId) || !isDatabaseUuid(receiptId)) {
    return null;
  }

  const { data, error } = await (
    supabase as unknown as TeacherFocusReceiptRpc
  ).rpc("read_teacher_focus_selection_receipt", {
    p_receipt_id: receiptId,
    p_surface: surface,
    p_target_bank_id: bankId,
  });

  if (error) return null;

  return Array.isArray(data)
    ? parseCurrentPageFocusSelection(data)
    : null;
}
