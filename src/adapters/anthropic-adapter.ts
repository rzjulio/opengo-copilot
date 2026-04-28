import * as vscode from "vscode";
import { Adapter } from "./base-adapter";
import { ChatMessage, Json, JsonObject, ModelInfo, AdapterConfig } from "../types";
import { log } from "../utils/logger";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: JsonObject }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[] };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: JsonObject;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  stream: boolean;
  temperature?: number;
  tools?: AnthropicTool[];
  tool_choice?: "auto" | "any" | { type: "tool"; name: string };
}

export class AnthropicAdapter implements Adapter {
  readonly apiFormat = "anthropic";

  buildRequest(
    modelId: string,
    messages: readonly vscode.LanguageModelChatMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    config: AdapterConfig,
    modelInfo: ModelInfo | undefined
  ): { body: AnthropicRequest; headers: Record<string, string>; endpoint: string } {
    const { system, convertedMessages } = this.convertMessages(messages);

    const maxTokensVal = (options.modelOptions as Record<string, unknown>)?.max_tokens;
    const requestedMaxTokens = Math.min(
      typeof maxTokensVal === "number" ? maxTokensVal : 65536,
      modelInfo?.maxOutputTokens ?? 65536
    );

    const temperatureVal =
      typeof modelInfo?.fixedTemperature === "number"
        ? modelInfo.fixedTemperature
        : typeof (options.modelOptions as Record<string, unknown>)?.temperature === "number"
        ? ((options.modelOptions as Record<string, unknown>).temperature as number)
        : 0.7;

    const body: AnthropicRequest = {
      model: modelId,
      messages: convertedMessages,
      max_tokens: Math.max(1, requestedMaxTokens),
      stream: true,
    };

    if (system) body.system = system;
    if (typeof temperatureVal === "number" && temperatureVal > 0) body.temperature = temperatureVal;

    const toolConfig = this.convertTools(options);
    if (toolConfig.tools && toolConfig.tools.length > 0) {
      body.tools = toolConfig.tools;
      if (toolConfig.tool_choice && toolConfig.tool_choice !== "auto") {
        body.tool_choice = toolConfig.tool_choice as "auto" | "any" | { type: "tool"; name: string };
      }
    }

    const headers: Record<string, string> = {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "User-Agent": config.userAgent,
    };

    return { body, headers, endpoint: `${config.baseUrl}/messages` };
  }

  parseStreamChunk(data: string): {
    text?: string;
    reasoning?: string;
    toolCalls?: Array<{ id: string; name: string; args: Record<string, Json> }>;
    done?: boolean;
    error?: string;
  } | null {
    if (data === "[DONE]") return { done: true };
    try {
      const event = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
        content_block?: { type?: string; id?: string; name?: string };
        index?: number;
      };

      if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          return { text: event.delta.text };
        }
        if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
          return { reasoning: event.delta.thinking };
        }
        if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
          // Tool call delta: needs to be assembled by caller
          return { toolCalls: [{ id: "pending", name: "pending", args: { _partial: event.delta.partial_json } }] };
        }
      }

      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        return {
          toolCalls: [
            {
              id: event.content_block.id ?? "unknown",
              name: event.content_block.name ?? "unknown",
              args: {},
            },
          ],
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private convertMessages(
    messages: readonly vscode.LanguageModelChatMessage[]
  ): { system?: string; convertedMessages: AnthropicMessage[] } {
    let system: string | undefined;
    const convertedMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      const role =
        msg.role === vscode.LanguageModelChatMessageRole.Assistant ? "assistant" : "user";
      const contentBlocks: AnthropicContentBlock[] = [];

      for (const part of msg.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          contentBlocks.push({ type: "text", text: part.value });
        } else if (typeof part === "object" && part !== null && "value" in part) {
          const p = part as { value?: string };
          if (typeof p.value === "string") contentBlocks.push({ type: "text", text: p.value });
        }
      }

      // Images
      for (const part of msg.content) {
        const p = part as { mimeType?: string; data?: Uint8Array };
        if (typeof p.mimeType === "string" && p.mimeType.startsWith("image/") && p.data) {
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: p.mimeType,
              data: Buffer.from(p.data).toString("base64"),
            },
          });
        }
      }

      if ((msg as any).role === "system") {
        system = contentBlocks.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      } else {
        convertedMessages.push({ role, content: contentBlocks });
      }
    }

    return { system, convertedMessages };
  }

  private convertTools(
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): { tools?: AnthropicTool[]; tool_choice?: string } {
    if (!options.tools || options.tools.length === 0) return {};
    const tools: AnthropicTool[] = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as JsonObject,
    }));

    const requiredMode = (vscode as unknown as { LanguageModelChatToolMode?: { Required?: number } })
      .LanguageModelChatToolMode?.Required;
    if (requiredMode !== undefined && options.toolMode === requiredMode) {
      return { tools, tool_choice: "any" };
    }
    return { tools, tool_choice: "auto" };
  }
}
