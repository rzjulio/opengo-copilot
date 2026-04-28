import { describe, it, expect, vi } from "vitest";
import { ConfigManager } from "../../src/core/config";
import { DEFAULT_MODELS } from "../../src/types";

const mockMemento = {
  get: vi.fn(),
  update: vi.fn(),
  keys: vi.fn().mockReturnValue([]),
};

const mockContext = {
  globalState: mockMemento,
  workspaceState: mockMemento,
} as unknown as import("vscode").ExtensionContext;

describe("ConfigManager", () => {
  it("returns built-in models", () => {
    const config = new ConfigManager(mockContext);
    const builtin = config.getBuiltinModels();
    expect(builtin.length).toBeGreaterThan(0);
    expect(builtin).toEqual(DEFAULT_MODELS);
  });

  it("resolves effective model ID without colon", () => {
    const config = new ConfigManager(mockContext);
    expect(config.resolveEffectiveModelId("kimi-k2.6")).toBe("kimi-k2.6");
  });

  it("resolves effective model ID with colon variant", () => {
    const config = new ConfigManager(mockContext);
    expect(config.resolveEffectiveModelId("deepseek-v4-pro:max")).toBe("deepseek-v4-pro");
  });

  it("gets model info by ID", () => {
    const config = new ConfigManager(mockContext);
    const info = config.getModelInfo("kimi-k2.6");
    expect(info).toBeDefined();
    expect(info?.displayName).toBe("Kimi K2.6");
  });

  it("returns undefined for unknown model", () => {
    const config = new ConfigManager(mockContext);
    expect(config.getModelInfo("nonexistent-model")).toBeUndefined();
  });

  it("returns default endpoint", () => {
    const config = new ConfigManager(mockContext);
    expect(config.getEndpointForModel("")).toBe("https://opencode.ai/zen/go/v1");
  });
});
