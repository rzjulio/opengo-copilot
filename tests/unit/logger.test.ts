import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, isDebugEnabled } from "../../src/utils/logger";

describe("Logger", () => {
  let appendLineSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.OPENGO_DEBUG = "1";
    appendLineSpy = vi.fn();
    const mockChannel = { appendLine: appendLineSpy };
    // @ts-expect-error internal access
    (globalThis as Record<string, unknown>).__opengoOutputChannel = mockChannel;
  });

  afterEach(() => {
    process.env.OPENGO_DEBUG = "0";
    // @ts-expect-error internal access
    (globalThis as Record<string, unknown>).__opengoOutputChannel = undefined;
  });

  it("does not log when debug is disabled", () => {
    process.env.OPENGO_DEBUG = "0";
    log("test", "hello");
    expect(appendLineSpy).not.toHaveBeenCalled();
  });

  it("logs when debug is enabled", () => {
    log("test", "hello");
    expect(appendLineSpy).toHaveBeenCalled();
  });

  it("redacts content fields", () => {
    log("request", {
      messages: [{ role: "user", content: "secret text" }],
      apiKey: "sk-123456",
    });
    const call = appendLineSpy.mock.calls[0][0] as string;
    expect(call).toContain("<array:1 items>");
    expect(call).not.toContain("secret text");
    expect(call).not.toContain("sk-123456");
  });

  it("shows length for string fields", () => {
    log("request", { prompt: "hello world" });
    const call = appendLineSpy.mock.calls[0][0] as string;
    expect(call).toContain("<string:11 chars>");
  });
});
