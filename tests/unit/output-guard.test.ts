import { describe, it, expect } from "vitest";
import { OutputGuard, validateToolCall, buildToolSchemaMap } from "../../src/pipeline/output-guard";

describe("Output Guard", () => {
  const mockOptions = {
    tools: [
      {
        name: "get_weather",
        description: "Get weather",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string" },
            unit: { type: "string", enum: ["celsius", "fahrenheit"] },
          },
          required: ["city"],
        },
      },
      {
        name: "read_file",
        description: "Read file",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string" },
          },
          required: ["filePath"],
        },
      },
    ],
    modelOptions: {},
  } as unknown as import("vscode").ProvideLanguageModelChatResponseOptions;

  describe("buildToolSchemaMap", () => {
    it("builds schema map from options", () => {
      const map = buildToolSchemaMap(mockOptions);
      expect(map.has("get_weather")).toBe(true);
      expect(map.has("read_file")).toBe(true);
      expect(map.get("get_weather")?.required).toEqual(["city"]);
    });
  });

  describe("validateToolCall", () => {
    it("accepts valid tool call", () => {
      const map = buildToolSchemaMap(mockOptions);
      const result = validateToolCall("get_weather", { city: "Tokyo" }, map);
      expect(result.valid).toBe(true);
    });

    it("rejects unregistered tool", () => {
      const map = buildToolSchemaMap(mockOptions);
      const result = validateToolCall("hacking_tool", {}, map);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("not registered");
    });

    it("rejects missing required argument", () => {
      const map = buildToolSchemaMap(mockOptions);
      const result = validateToolCall("get_weather", {}, map);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Missing required argument 'city'");
    });

    it("rejects invalid enum value", () => {
      const map = buildToolSchemaMap(mockOptions);
      const result = validateToolCall("get_weather", { city: "Tokyo", unit: "kelvin" }, map);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Invalid value for 'unit'");
    });
  });

  describe("OutputGuard", () => {
    it("allows valid tool call", async () => {
      const guard = new OutputGuard(mockOptions);
      const result = await guard.processToolCall({ id: "call_1", name: "get_weather", args: { city: "Tokyo" } });
      expect(result).not.toBeNull();
    });

    it("deduplicates identical tool calls", async () => {
      const guard = new OutputGuard(mockOptions);
      await guard.processToolCall({ id: "call_1", name: "get_weather", args: { city: "Tokyo" } });
      const result = await guard.processToolCall({ id: "call_2", name: "get_weather", args: { city: "Tokyo" } });
      expect(result).toBeNull();
    });

    it("rejects unregistered tools", async () => {
      const guard = new OutputGuard(mockOptions);
      const result = await guard.processToolCall({ id: "call_1", name: "malicious_tool", args: {} });
      expect(result).toBeNull();
    });
  });
});
