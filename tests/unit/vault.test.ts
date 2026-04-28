import { describe, it, expect, vi } from "vitest";
import { SecureVault } from "../../src/core/vault";

describe("SecureVault", () => {
  it("returns undefined for missing key", async () => {
    const mockSecrets = {
      get: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const vault = new SecureVault(mockSecrets as any);
    const key = await vault.getApiKey();
    expect(key).toBeUndefined();
  });

  it("returns stored key", async () => {
    const mockSecrets = {
      get: vi.fn().mockResolvedValue("sk-test123"),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const vault = new SecureVault(mockSecrets as any);
    const key = await vault.getApiKey();
    expect(key).toBe("sk-test123");
    expect(mockSecrets.get).toHaveBeenCalledWith("opengo.apiKey");
  });

  it("stores key with prefixed name", async () => {
    const mockSecrets = {
      get: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const vault = new SecureVault(mockSecrets as any);
    await vault.setApiKey("sk-abc");
    expect(mockSecrets.store).toHaveBeenCalledWith("opengo.apiKey", "sk-abc");
  });
});
