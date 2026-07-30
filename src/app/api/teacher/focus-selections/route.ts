import { NextResponse } from "next/server";

import { requireTeacher } from "@/lib/auth/guards";
import { createTeacherFocusSelectionReceipt } from "@/lib/teacher-focus-selection";
import {
  isDatabaseUuid,
  isValidFocusLaunchId,
  parseCurrentPageFocusSelection,
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const privateResponseHeaders = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function privateError(message: string, status: number) {
  return new NextResponse(message, {
    headers: privateResponseHeaders,
    status,
  });
}

export async function POST(request: Request) {
  await requireTeacher();
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (origin && origin !== requestUrl.origin) {
    return privateError("Invalid request origin.", 403);
  }

  const formData = await request.formData();
  const bankId = String(formData.get("bankId") ?? "");
  const destination = String(formData.get("destination") ?? "");
  const selectedIds = parseCurrentPageFocusSelection(
    formData.getAll("selectedId").map(String),
  );
  const isQuestionDestination =
    destination === "assignment" || destination === "question_preview";
  const surface = isQuestionDestination
    ? "questions"
    : destination === "review_preview"
      ? "review"
      : null;

  if (!isDatabaseUuid(bankId) || !selectedIds || !surface) {
    return privateError("Invalid focus selection.", 400);
  }

  const returnTo = sanitizeTeacherBankReturnTo({
    bankId,
    rawReturnTo: String(formData.get("returnTo") ?? ""),
    surface,
  });
  const launchId = String(formData.get("launchId") ?? "");

  if (
    destination !== "assignment" &&
    !isValidFocusLaunchId(launchId)
  ) {
    return privateError("Invalid focus launch.", 400);
  }

  try {
    const supabase = await createClient();
    const receiptId = await createTeacherFocusSelectionReceipt({
      bankId,
      selectedIds,
      supabase,
      surface,
    });
    const destinationUrl = new URL(
      destination === "assignment"
        ? `/teacher/banks/${bankId}/assignments/new`
        : destination === "question_preview"
          ? `/teacher/banks/${bankId}/questions/preview`
          : `/teacher/banks/${bankId}/review/bulk`,
      requestUrl.origin,
    );

    destinationUrl.searchParams.set("selection", receiptId);

    if (destination !== "assignment") {
      destinationUrl.searchParams.set("launchId", launchId);
      destinationUrl.searchParams.set("presentation", "focus");
      destinationUrl.searchParams.set("returnTo", returnTo);
    }

    const response = NextResponse.redirect(destinationUrl, 303);
    for (const [name, value] of Object.entries(privateResponseHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  } catch {
    return privateError(
      "The selected items could not be opened. Return to the Library list and try again.",
      400,
    );
  }
}
