import { encryptToken, decryptToken, maskToken } from "../crypto";

// 測試用 32-byte hex key (64 chars)
const TEST_KEY = "a".repeat(64);

describe("telegram/crypto", () => {
  describe("encryptToken / decryptToken", () => {
    it("should encrypt and decrypt a token round-trip", () => {
      const token = "1234567890:ABCdefGHIjklmNOpqrsTUVwxyz";
      const encrypted = encryptToken(token, TEST_KEY);
      const decrypted = decryptToken(encrypted, TEST_KEY);
      expect(decrypted).toBe(token);
    });

    it("should produce different ciphertext each time (random IV)", () => {
      const token = "1234567890:ABCdefGHIjklmNOpqrsTUVwxyz";
      const a = encryptToken(token, TEST_KEY);
      const b = encryptToken(token, TEST_KEY);
      expect(a).not.toBe(b);
    });

    it("should throw on tampered ciphertext", () => {
      const token = "1234567890:ABCdefGHIjklmNOpqrsTUVwxyz";
      const encrypted = encryptToken(token, TEST_KEY);
      // Tamper with the middle of the string
      const tampered =
        encrypted.slice(0, 10) + "XX" + encrypted.slice(12);
      expect(() => decryptToken(tampered, TEST_KEY)).toThrow();
    });

    it("should throw with wrong key", () => {
      const token = "1234567890:ABCdefGHIjklmNOpqrsTUVwxyz";
      const encrypted = encryptToken(token, TEST_KEY);
      const wrongKey = "b".repeat(64);
      expect(() => decryptToken(encrypted, wrongKey)).toThrow();
    });
  });

  describe("maskToken", () => {
    it("should mask a standard bot token", () => {
      const token = "1234567890:ABCdefGHIjklmNOpqrsTUVwxyz";
      const masked = maskToken(token);
      // Should show first few digits and last few chars
      expect(masked).toContain("***");
      expect(masked).not.toBe(token);
      // Should not contain the full token
      expect(masked.length).toBeLessThan(token.length);
    });

    it("should handle short tokens gracefully", () => {
      const token = "abc";
      const masked = maskToken(token);
      expect(masked).toContain("***");
    });

    it("should handle empty string", () => {
      const masked = maskToken("");
      expect(masked).toBe("***");
    });
  });
});
