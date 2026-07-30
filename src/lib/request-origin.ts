type TrustedPostOriginInput = {
  configuredSiteUrl?: string | null;
  environment?: string;
  host?: string | null;
  origin?: string | null;
  requestUrl: string;
  secFetchSite?: string | null;
  trustProxyHeaders?: boolean;
  xForwardedHost?: string | null;
  xForwardedProto?: string | null;
};

function parseOrigin(value: string | null | undefined) {
  if (!value || value === "null" || value !== value.trim() || value.includes(",")) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseSingleHeader(value: string | null | undefined) {
  if (!value || value !== value.trim() || value.includes(",") || /\s/.test(value)) {
    return null;
  }
  return value;
}

function originFromProtocolAndHost(protocol: string | null, host: string | null) {
  if (!protocol || !host || !["http", "https"].includes(protocol)) return null;
  return parseOrigin(`${protocol}://${host}`);
}

export function resolveTrustedPostOrigin({
  configuredSiteUrl,
  environment,
  host,
  origin,
  requestUrl,
  secFetchSite,
  trustProxyHeaders = false,
  xForwardedHost,
  xForwardedProto,
}: TrustedPostOriginInput) {
  const browserOrigin = parseOrigin(origin);
  if (!browserOrigin || (secFetchSite && secFetchSite !== "same-origin")) {
    return null;
  }

  const configuredOrigin = configuredSiteUrl
    ? parseOrigin(configuredSiteUrl)
    : null;
  if (configuredSiteUrl && !configuredOrigin) return null;
  if (environment === "production" && !configuredOrigin) return null;

  let externalOrigin: string | null;
  if (trustProxyHeaders) {
    if (!configuredOrigin) return null;
    externalOrigin = originFromProtocolAndHost(
      parseSingleHeader(xForwardedProto),
      parseSingleHeader(xForwardedHost),
    );
  } else {
    let requestProtocol: string | null = null;
    try {
      requestProtocol = new URL(requestUrl).protocol.replace(/:$/, "");
    } catch {
      return null;
    }
    externalOrigin = originFromProtocolAndHost(
      requestProtocol,
      parseSingleHeader(host),
    );
  }

  if (
    !externalOrigin ||
    (configuredOrigin && externalOrigin !== configuredOrigin) ||
    browserOrigin !== (configuredOrigin ?? externalOrigin)
  ) {
    return null;
  }

  return configuredOrigin ?? externalOrigin;
}
