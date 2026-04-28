import * as vscode from "vscode";
import { ModelInfo, DEFAULT_MODELS } from "../types";
import { log } from "../utils/logger";

const CONFIG_SECTION = "opengo";

const ALLOWED_HOSTS = ["opencode.ai"];

function validateEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") {
      log("config", `Rejected non-HTTPS endpoint: ${url.hostname}`);
      return "https://opencode.ai/zen/go/v1";
    }
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      log("config", `Rejected unknown host: ${host}`);
      return "https://opencode.ai/zen/go/v1";
    }
    return endpoint;
  } catch {
    log("config", `Rejected invalid endpoint: ${endpoint}`);
    return "https://opencode.ai/zen/go/v1";
  }
}

export class ConfigManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  get models(): ModelInfo[] {
    const custom = this.getCustomModels();
    const builtin = this.getBuiltinModels();
    return [...builtin, ...custom];
  }

  getBuiltinModels(): ModelInfo[] {
    return DEFAULT_MODELS;
  }

  getCustomModels(): ModelInfo[] {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const raw = cfg.get<ModelInfo[]>("models.custom", []);
    return raw.filter((m) => m?.id && m?.displayName);
  }

  get promptInjectionDefense(): boolean {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return cfg.get<boolean>("security.promptInjectionDefense", true);
  }

  get logContent(): boolean {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return cfg.get<boolean>("security.logContent", false);
  }

  get showReasoningTokens(): boolean {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return cfg.get<boolean>("ui.showReasoningTokens", true);
  }

  get requestTimeout(): number {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return cfg.get<number>("transport.requestTimeout", 30000);
  }

  get streamTimeout(): number {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return cfg.get<number>("transport.streamTimeout", 60000);
  }

  get maxRetries(): number {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return cfg.get<number>("transport.maxRetries", 3);
  }

  getModelInfo(id: string): ModelInfo | undefined {
    return this.models.find((m) => m.id === id);
  }

  resolveEffectiveModelId(id: string): string {
    const colon = id.indexOf(":");
    return colon > 0 ? id.slice(0, colon) : id;
  }

getEndpointForModel(modelId: string): string {
    const info = this.getModelInfo(modelId);
    const raw = info?.endpoint ?? "https://opencode.ai/zen/go/v1";
    return validateEndpoint(raw);
  }
}
