import * as vscode from "vscode";
import { Adapter, RequestContext, extractRequestContext } from "./base-adapter";
import { ChatMessage, ChatRequest, Json, JsonObject, ModelInfo, AdapterConfig, Tool } from "../types";
import { log } from "../utils/logger";
import { sha256Hex } from "../utils/crypto";

export class OpenAIAdapter implements Adapter {
  readonly apiFormat = "openai";

  buildRequest(
    modelId: string,
    messages: readonly vscode.LanguageModelChatMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    config: AdapterConfig,
    modelInfo: ModelInfo | undefined
  ): { body: ChatRequest; headers: Record<string, string>; endpoint: string } {
    const converted = this.convertMessages(messages, { maxToolResultChars: this.calcMaxToolChars(modelInfo) });
    const toolConfig = this.convertTools(options);

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

    const body: ChatRequest = {
      model: modelId,
      messages: converted,
      stream: true,
      max_tokens: requestedMaxTokens,
      temperature: temperatureVal,
    };

    if (toolConfig.tools) body.tools = toolConfig.tools;
    if (toolConfig.tool_choice) body.tool_choice = toolConfig.tool_choice;
    if (modelInfo?.reasoningEffort) body.reasoning_effort = modelInfo.reasoningEffort;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": config.userAgent,
    };

    return { body, headers, endpoint: `${config.baseUrl}/chat/completions` };
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
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string;
            reasoning_content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return null;

      const result: ReturnType<typeof this.parseStreamChunk> = {};
      if (delta.content) result.text = delta.content;
      if (delta.reasoning_content) result.reasoning = delta.reasoning_content;

      if (delta.tool_calls && delta.tool_calls.length > 0) {
        result.toolCalls = delta.tool_calls
          .map((tc) => {
            if (!tc.function?.name) return null;
            let args: Record<string, Json> = {};
            try {
              if (tc.function.arguments) {
                args = JSON.parse(tc.function.arguments) as Record<string, Json>;
              }
            } catch {
              // incomplete JSON
            }
            return { id: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`, name: tc.function.name, args };
          })
          .filter((t): t is NonNullable<typeof t> => !!t);
      }

      return result;
    } catch {
      return null;
    }
  }

  private convertMessages(
    messages: readonly vscode.LanguageModelChatMessage[],
    options: { maxToolResultChars?: number }
  ): ChatMessage[] {
    const result: ChatMessage[] = [];
    for (const msg of messages) {
      const role =
        msg.role === vscode.LanguageModelChatMessageRole.User
          ? "user"
          : msg.role === vscode.LanguageModelChatMessageRole.Assistant
          ? "assistant"
          : "system";

      const textParts: string[] = [];
      const imageParts: ChatMessage[] = [];

      for (const part of msg.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          textParts.push(part.value);
        } else if (typeof part === "object" && part !== null && "value" in part) {
          const p = part as { value?: string };
          if (typeof p.value === "string") textParts.push(p.value);
        }
      }

      // Simple image detection
      for (const part of msg.content) {
        const p = part as { mimeType?: string; data?: Uint8Array };
        if (typeof p.mimeType === "string" && p.mimeType.startsWith("image/") && p.data) {
          const base64 = Buffer.from(p.data).toString("base64");
          imageParts.push({
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${p.mimeType};base64,${base64}` } },
            ],
          });
        }
      }

      const text = textParts.join("");
      if (imageParts.length > 0) {
        const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
        if (text) content.push({ type: "text", text });
        for (const img of imageParts) {
          const parts = img.content as Array<{ type: "image_url"; image_url: { url: string } }>;
          content.push(...parts);
        }
        result.push({ role, content });
      } else {
        result.push({ role, content: text });
      }
    }
    return result;
  }

  private convertTools(
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): { tools?: Tool[]; tool_choice?: ChatRequest["tool_choice"] } {
    if (!options.tools || options.tools.length === 0) return {};
    const tools: Tool[] = options.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as JsonObject,
      },
    }));

    const requiredMode = (vscode as unknown as { LanguageModelChatToolMode?: { Required?: number } })
      .LanguageModelChatToolMode?.Required;
    if (requiredMode !== undefined && options.toolMode === requiredMode) {
      return { tools, tool_choice: "required" };
    }
    return { tools, tool_choice: "auto" };
  }

  private calcMaxToolChars(modelInfo?: ModelInfo): number {
    const ctx = modelInfo?.contextWindow ?? 262144;
    if (ctx >= 500000) return 50000;
    if (ctx >= 200000) return 30000;
    if (ctx >= 100000) return 20000;
    return 10000;
  }
}
