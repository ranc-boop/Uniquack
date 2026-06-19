import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function encryptionKey() {
  const secret = process.env.AI_PROVIDER_ENCRYPTION_KEY;

  if (!secret || secret.length < 24) {
    throw new Error(
      "AI_PROVIDER_ENCRYPTION_KEY must be set to save or use AI provider API keys.",
    );
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(input: {
  ciphertext: string | null;
  iv: string | null;
  tag: string | null;
}) {
  if (!input.ciphertext || !input.iv || !input.tag) {
    throw new Error("AI provider API key is not configured.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(input.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(input.tag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Saved API key cannot be decrypted. Re-enter and save the API key for this provider.",
    );
  }
}

export function apiKeyLast4(value: string) {
  return value.slice(-4);
}
