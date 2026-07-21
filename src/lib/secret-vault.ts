import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  const secret = process.env.PROVIDER_CREDENTIALS_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret || secret === "change-me-in-production") {
    throw new Error("Provider credential encryption secret is not configured.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return "";
  const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":");
  if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) return "";
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
