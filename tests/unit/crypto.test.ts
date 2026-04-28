import { describe, it, expect } from "vitest";
import { sha256Hex, generateToolCallId, randomNonce } from "../../src/utils/crypto";

describe("Crypto helpers", () => {
  describe("sha256Hex", () => {
    it("returns consistent hash for same input", async () => {
      const hash1 = await sha256Hex("test");
      const hash2 = await sha256Hex("test");
      expect(hash1).toBe(hash2);
    });

    it("returns different hash for different input", async () => {
      const hash1 = await sha256Hex("test1");
      const hash2 = await sha256Hex("test2");
      expect(hash1).not.toBe(hash2);
    });

    it("returns 64 character hex string", async () => {
      const hash = await sha256Hex("test");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("generateToolCallId", () => {
    it("generates unique IDs", () => {
      const id1 = generateToolCallId();
      const id2 = generateToolCallId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^call_/);
    });
  });

  describe("randomNonce", () => {
    it("generates 16 character hex string", () => {
      const nonce = randomNonce();
      expect(nonce).toMatch(/^[a-f0-9]{16}$/);
    });
  });
});
