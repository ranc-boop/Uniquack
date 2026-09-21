import type { MessageKey } from "@/lib/i18n/messages";

const LOGIN_ERROR_MESSAGE_KEYS = {
  credentials_required: "auth.usernamePasswordRequired",
  environment_not_configured: "auth.environmentUnavailable",
  invalid_credentials: "auth.invalidCredentials",
} as const satisfies Record<string, MessageKey>;

export function loginErrorMessageKey(value: unknown): MessageKey | null {
  if (typeof value !== "string") return null;
  return LOGIN_ERROR_MESSAGE_KEYS[value as keyof typeof LOGIN_ERROR_MESSAGE_KEYS] ?? null;
}
