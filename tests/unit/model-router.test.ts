import { describe, it, expect, vi } from "vitest";
import { resolveModelRoute } from "../../src/pipeline/model-router";
import { ConfigManager } from "../../src/core/config";

const mockMemento = {
  get: vi.fn(),
  update: vi.fn(),
  keys: vi.fn().mockReturnValue([]),
};

const mockContext = {
  globalState: mockMemento,
  workspaceState: mockMemento,
} as unknown as import("vscode").ExtensionContext;

describe("resolveModelRoute", () => {
  it("selects OpenAI-compatible format for kimi", () => {
    const config = new ConfigManager(mockContext);
    const route = resolveModelRoute("kimi-k2.6", config);
    expect(route.apiFormat).toBe("openai");
  });

  it("selects Anthropic format for minimax", () => {
    const config = new ConfigManager(mockContext);
    const route = resolveModelRoute("minimax-m2.5", config);
    expect(route.apiFormat).toBe("anthropic");
  });

  it("returns default endpoint for models without custom endpoint", () => {
    const config = new ConfigManager(mockContext);
    const route = resolveModelRoute("deepseek-v4-pro", config);
    expect(route.endpoint).toBe("https://opencode.ai/zen/go/v1");
  });

  it("defaults to openai for unknown models", () => {
    const config = new ConfigManager(mockContext);
    const route = resolveModelRoute("unknown-model", config);
    expect(route.apiFormat).toBe("openai");
  });

  it("indicates vision support for vision models", () => {
    const config = new ConfigManager(mockContext);
    const route = resolveModelRoute("kimi-k2.6", config);
    expect(route.supportsVision).toBe(true);
  });
});
