import "server-only";

export function requireAIProviderGatewayToken() {
  const token = process.env.AI_PROVIDER_GATEWAY_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "Missing AI_PROVIDER_GATEWAY_TOKEN. Server-side AI provider access requires a dedicated gateway token.",
    );
  }

  return token;
}
