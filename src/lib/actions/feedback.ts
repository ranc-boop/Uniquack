import { redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

export function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export function redirectWithSaved(path: string, message: string): never {
  redirect(`${path}?saved=${encodeURIComponent(message)}`);
}

export function formatActionError(error: unknown) {
  unstable_rethrow(error);

  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`)
      .join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please check the form and try again.";
}
