import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * 將 Bot Token 加密為 hex 字串。
 * 格式：iv (12 bytes) + authTag (16 bytes) + ciphertext
 * 全部以 hex 編碼串接。
 */
export function encryptToken(token: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // iv + authTag + ciphertext → hex
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

/**
 * 將加密後的 hex 字串還原為 Bot Token。
 */
export function decryptToken(encryptedHex: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const data = Buffer.from(encryptedHex, "hex");

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * 遮罩 Bot Token，只顯示前 4 碼和最後 3 碼。
 * 例：1234***:***xyz
 */
export function maskToken(token: string): string {
  if (token.length <= 7) return "***";
  const prefix = token.slice(0, 4);
  const suffix = token.slice(-3);
  return `${prefix}***:***${suffix}`;
}
