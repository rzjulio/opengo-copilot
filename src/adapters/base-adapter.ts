import * as vscode from "vscode";
import { ChatMessage, ChatRequest, Json, ModelInfo, AdapterConfig } from "../types";

export interface RequestContext {
  filePath?: string;
  startLine?: number;
  endLine?: number;
  cwd?: string;
}

export interface Adapter {
  readonly apiFormat: string;

  buildRequest(
    modelId: string,
    messages: readonly vscode.LanguageModelChatMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    config: AdapterConfig,
    modelInfo: ModelInfo | undefined
  ): { body: ChatRequest | unknown; headers: Record<string, string>; endpoint: string };

  parseStreamChunk(data: string): {
    text?: string;
    reasoning?: string;
    toolCalls?: Array<{ id: string; name: string; args: Record<string, Json> }>;
    done?: boolean;
    error?: string;
  } | null;
}

export function extractRequestContext(
  messages: readonly vscode.LanguageModelChatMessage[]
): RequestContext {
  const filePattern = /The user's current file is\s+([^\n]+?)\.(?:\s|$)/;
  const selectionPattern = /The current selection is from line\s+(\d+)\s+to line\s+(\d+)/;
  const cwdPattern = /(?:^|\n)Cwd:\s+([^\n]+)/;
  const context: RequestContext = {};

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    for (const part of message.content) {
      const text =
        part instanceof vscode.LanguageModelTextPart
          ? part.value
          : typeof part === "object" &&
            part !== null &&
            "value" in part &&
            typeof (part as { value?: unknown }).value === "string"
          ? (part as { value: string }).value
          : undefined;
      if (!text) continue;

      const fileMatch = text.match(filePattern);
      const selectionMatch = text.match(selectionPattern);
      const cwdMatch = text.match(cwdPattern);

      if (fileMatch && !context.filePath) context.filePath = fileMatch[1].trim();
      if (cwdMatch && !context.cwd) context.cwd = cwdMatch[1].trim();
      if (selectionMatch && context.startLine === undefined && context.endLine === undefined) {
        const s = Number(selectionMatch[1]);
        const e = Number(selectionMatch[2]);
        if (Number.isFinite(s) && Number.isFinite(e)) {
          context.startLine = s;
          context.endLine = e;
        }
      }
      if (context.filePath && context.cwd && context.startLine !== undefined && context.endLine !== undefined) break;
    }
  }

  return context;
}
