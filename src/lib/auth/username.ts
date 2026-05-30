const LOCAL_AUTH_DOMAIN = "local.app";

export function usernameToLocalEmail(username: string) {
  const normalized = username.trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized.includes("@")
    ? normalized
    : `${normalized}@${LOCAL_AUTH_DOMAIN}`;
}
