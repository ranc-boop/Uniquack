import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  isMockAIProviderAllowed,
  isMockAIProviderUrl,
} from "@/lib/ai-providers/mock";

function explicitPrivateNetworkOptIn() {
  return process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_PRIVATE_AI_PROVIDER_NETWORK === "true";
}

function explicitInsecureHttpOptIn() {
  return process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_INSECURE_AI_PROVIDER_HTTP === "true";
}

function forbiddenIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function forbiddenIpAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return forbiddenIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(?:fc|fd)/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
  return mapped ? forbiddenIpv4(mapped) : false;
}

function forbiddenHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal");
}

function normalizedHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "");
}

export function isSafeAIProviderBaseUrlSyntax(value: string) {
  if (isMockAIProviderUrl(value)) return isMockAIProviderAllowed();
  try {
    const url = new URL(value);
    const hostname = normalizedHostname(url.hostname);
    if (url.username || url.password) return false;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && explicitInsecureHttpOptIn())) {
      return false;
    }
    if (forbiddenHostname(hostname)) return explicitPrivateNetworkOptIn();
    return isIP(hostname) === 0 || !forbiddenIpAddress(hostname) || explicitPrivateNetworkOptIn();
  } catch {
    return false;
  }
}

export async function assertSafeAIProviderBaseUrl(value: string) {
  if (!isSafeAIProviderBaseUrlSyntax(value)) {
    throw new Error("AI provider base URL is blocked by the outbound network safety policy.");
  }
  if (isMockAIProviderUrl(value) || explicitPrivateNetworkOptIn()) return;

  const hostname = normalizedHostname(new URL(value).hostname);
  if (isIP(hostname)) return;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => forbiddenIpAddress(address))) {
    throw new Error("AI provider hostname resolved to a blocked network address.");
  }
}
