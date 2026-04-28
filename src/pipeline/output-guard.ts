import * as vscode from "vscode";
import { sha256Hex } from "../utils/crypto";
import { log } from "../utils/logger";
import { Json } from "../types";

export interface ToolSchema {
  required?: string[];
  enumValues?: Record<string, string[]>;
}

/**
 * Build a map of tool schemas from the options provided by Copilot.
 */
export function buildToolSchemaMap(
  options: vscode.ProvideLanguageModelChatResponseOptions
): Map<string, ToolSchema> {
  const map = new Map<string, ToolSchema>();
  for (const tool of options.tools ?? []) {
    const inputSchema = tool.inputSchema as { required?: unknown; properties?: unknown } | undefined;
    const required = Array.isArray(inputSchema?.required)
      ? inputSchema.required.filter((v): v is string => typeof v === "string" && v.length > 0)
      : undefined;

    const enumValues: Record<string, string[]> = {};
    const properties =
      typeof inputSchema?.properties === "object" && inputSchema.properties !== null
        ? (inputSchema.properties as Record<string, unknown>)
        : {};

    for (const [name, value] of Object.entries(properties)) {
      const prop =
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as { enum?: unknown })
          : undefined;
      if (Array.isArray(prop?.enum)) {
        const allowed = prop.enum.filter((item): item is string => typeof item === "string");
        if (allowed.length > 0) enumValues[name] = allowed;
      }
    }

    map.set(tool.name, { required, enumValues });
  }
  return map;
}

/**
 * Validate that a tool call matches a registered tool and its required arguments.
 */
export function validateToolCall(
  name: string,
  args: Record<string, Json>,
  schemaMap: Map<string, ToolSchema>
): { valid: boolean; reason?: string } {
  const schema = schemaMap.get(name);
  if (!schema) {
    return { valid: false, reason: `Tool '${name}' is not registered in this conversation` };
  }

  const required = schema.required ?? [];
  for (const key of required) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      return { valid: false, reason: `Missing required argument '${key}' for tool '${name}'` };
    }
  }

  for (const [key, allowed] of Object.entries(schema.enumValues ?? {})) {
    const value = args[key];
    if (value !== undefined && typeof value === "string" && !allowed.includes(value)) {
      return { valid: false, reason: `Invalid value for '${key}' in tool '${name}'` };
    }
  }

  return { valid: true };
}

/**
 * Canonical hash for deduplication of tool calls.
 */
export async function buildToolCallHash(name: string, args: Record<string, Json>): Promise<string> {
  return sha256Hex(`${name}:${JSON.stringify(args)}`);
}

export class OutputGuard {
  private readonly emittedHashes = new Set<string>();
  private readonly schemaMap: Map<string, ToolSchema>;

  constructor(options: vscode.ProvideLanguageModelChatResponseOptions) {
    this.schemaMap = buildToolSchemaMap(options);
  }

  /**
   * Validate and deduplicate a tool call.
   * Returns the tool call if valid and not duplicate, otherwise null.
   */
  async processToolCall(toolCall: {
    id: string;
    name: string;
    args: Record<string, Json>;
  }): Promise<{ id: string; name: string; args: Record<string, Json> } | null> {
    const validation = validateToolCall(toolCall.name, toolCall.args, this.schemaMap);
    if (!validation.valid) {
      log("output-guard", `Rejected tool call: ${validation.reason}`);
      return null;
    }

    const hash = await buildToolCallHash(toolCall.name, toolCall.args);
    if (this.emittedHashes.has(hash)) {
      log("output-guard", `Deduplicated repeated tool call: ${toolCall.name}`);
      return null;
    }

    this.emittedHashes.add(hash);
    return toolCall;
  }

  get knownToolNames(): string[] {
    return Array.from(this.schemaMap.keys());
  }
}
