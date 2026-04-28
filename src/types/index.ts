import * as vscode from "vscode";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  index?: number;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Tool {
  type: "function";
  function: { name: string; description?: string; parameters?: JsonObject };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  stop?: string | string[];
  tools?: Tool[];
  tool_choice?: "auto" | "none" | "required" | { type: string; function: { name: string } };
  reasoning_effort?: string;
}

export interface StreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    reasoning_content?: string;
    tool_calls?: ToolCall[];
  };
  finish_reason: string | null;
}

export interface StreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: StreamChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export type ApiFormat = "openai" | "anthropic";

export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  apiFormat: ApiFormat;
  fixedTemperature?: number | null;
  reasoningEffort?: string | null;
  endpoint?: string | null;
}

export interface AdapterConfig {
  baseUrl: string;
  apiKey: string;
  userAgent: string;
  requestTimeout: number;
  streamTimeout: number;
  maxRetries: number;
}

export interface StreamHandlers {
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
  onToolCall: (toolCall: { id: string; name: string; args: Record<string, Json> }) => void;
  onError: (error: Error) => void;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export const REASONING_CONTENT_WORKAROUND_MODELS = new Set([
  "kimi-k2.5",
  "kimi-k2.6",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
]);

export const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "glm-5",
    name: "GLM-5",
    displayName: "GLM-5",
    contextWindow: 202752,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
  },
  {
    id: "glm-5.1",
    name: "GLM-5.1",
    displayName: "GLM-5.1",
    contextWindow: 202752,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
  },
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    displayName: "Kimi K2.5",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: true,
    apiFormat: "openai",
    fixedTemperature: 1,
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    displayName: "Kimi K2.6",
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsTools: true,
    supportsVision: true,
    apiFormat: "openai",
    fixedTemperature: 1,
  },
  {
    id: "mimo-v2-pro",
    name: "MiMo-V2-Pro",
    displayName: "MiMo-V2-Pro",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
  },
  {
    id: "mimo-v2-omni",
    name: "MiMo-V2-Omni",
    displayName: "MiMo-V2-Omni",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: true,
    apiFormat: "openai",
  },
  {
    id: "mimo-v2.5-pro",
    name: "MiMo-V2.5-Pro",
    displayName: "MiMo-V2.5-Pro",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsVision: true,
    apiFormat: "openai",
  },
  {
    id: "mimo-v2.5",
    name: "MiMo-V2.5",
    displayName: "MiMo-V2.5",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: true,
    apiFormat: "openai",
  },
  {
    id: "minimax-m2.5",
    name: "MiniMax M2.5",
    displayName: "MiniMax M2.5",
    contextWindow: 196608,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "anthropic",
  },
  {
    id: "minimax-m2.7",
    name: "MiniMax M2.7",
    displayName: "MiniMax M2.7",
    contextWindow: 196608,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "anthropic",
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    displayName: "Qwen3.5 Plus",
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: true,
    apiFormat: "openai",
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    displayName: "Qwen3.6 Plus",
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: true,
    apiFormat: "openai",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    displayName: "DeepSeek V4 Pro",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
  },
  {
    id: "deepseek-v4-pro:max",
    name: "DeepSeek V4 Pro",
    displayName: "DeepSeek V4 Pro (Max)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "xhigh",
  },
  {
    id: "deepseek-v4-pro:high",
    name: "DeepSeek V4 Pro",
    displayName: "DeepSeek V4 Pro (High)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "high",
  },
  {
    id: "deepseek-v4-pro:medium",
    name: "DeepSeek V4 Pro",
    displayName: "DeepSeek V4 Pro (Medium)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "medium",
  },
  {
    id: "deepseek-v4-pro:low",
    name: "DeepSeek V4 Pro",
    displayName: "DeepSeek V4 Pro (Low)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "low",
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    displayName: "DeepSeek V4 Flash",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
  },
  {
    id: "deepseek-v4-flash:max",
    name: "DeepSeek V4 Flash",
    displayName: "DeepSeek V4 Flash (Max)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "xhigh",
  },
  {
    id: "deepseek-v4-flash:high",
    name: "DeepSeek V4 Flash",
    displayName: "DeepSeek V4 Flash (High)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "high",
  },
  {
    id: "deepseek-v4-flash:medium",
    name: "DeepSeek V4 Flash",
    displayName: "DeepSeek V4 Flash (Medium)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "medium",
  },
  {
    id: "deepseek-v4-flash:low",
    name: "DeepSeek V4 Flash",
    displayName: "DeepSeek V4 Flash (Low)",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsVision: false,
    apiFormat: "openai",
    reasoningEffort: "low",
  },
];

export const BASE_URL = "https://opencode.ai/zen/go/v1";
