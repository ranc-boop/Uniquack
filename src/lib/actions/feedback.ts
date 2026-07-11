import { redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

const INTERNAL_ACTION_ERROR_PATTERN =
  /\b(?:row-level security|permission denied|postgres|postgrest|supabase|pgrst\d+|\d{2}p\d{3}|relation .* does not exist|column .* does not exist|function .* does not exist|duplicate key|violates .* constraint|invalid input syntax|fetch failed|network error|failed to fetch|econn\w+|etimedout|eacces|service[_ -]?role|api[_ -]?key|authorization|jwt|token|password)\b/i;

export function redirectWithError(path: string, message: string): never {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("error", message);
  redirect(`${url.pathname}${url.search}`);
}

export function redirectWithSaved(path: string, message: string): never {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("saved", message);
  redirect(`${url.pathname}${url.search}`);
}

export function formatActionError(error: unknown) {
  unstable_rethrow(error);

  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`)
      .join("; ");
  }

  if (error instanceof Error) {
    const message = error.message.trim();

    if (INTERNAL_ACTION_ERROR_PATTERN.test(message)) {
      return "We couldn't complete that action. Your changes were not saved. Refresh and try again, or check your access.";
    }

    return message || "Something went wrong. Please check the form and try again.";
  }

  return "Something went wrong. Please check the form and try again.";
}
