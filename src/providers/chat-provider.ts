import * as vscode from "vscode";
import {
  CancellationToken,
  Event,
  EventEmitter,
  LanguageModelChatInformation,
  LanguageModelChatMessage,
  LanguageModelChatProvider,
  LanguageModelChatRequestMessage,
  LanguageModelResponsePart,
  PrepareLanguageModelChatModelOptions,
  Progress,
  ProvideLanguageModelChatResponseOptions,
} from "vscode";
import { SecureVault } from "../core/vault";
import { ConfigManager } from "../core/config";
import { CircuitBreaker } from "../transport/circuit-breaker";
import { fetchWithRetry, streamSSE } from "../transport/http-client";
import { OpenAIAdapter } from "../adapters/openai-adapter";
import { AnthropicAdapter } from "../adapters/anthropic-adapter";
import { OutputGuard } from "../pipeline/output-guard";
import { applySystemPromptGuidance, applyReasoningContentWorkaround, sanitizeSystemPromptForModel } from "../pipeline/prompt-engine";
import { resolveModelRoute } from "../pipeline/model-router";
import { log } from "../utils/logger";
import { estimateMessageTokens } from "../utils/tokens";
import { generateToolCallId } from "../utils/crypto";
import { showConsentFallback, showTransient, showError } from "../ui/notifications";
import { StatusPanel } from "../ui/status-panel";
import { ModelInfo, AdapterConfig, StreamResponse, ChatMessage } from "../types";

const CONTEXT_WINDOW_SAFETY_MARGIN = 4096;

export class OpenGoChatProvider implements LanguageModelChatProvider {
  private readonly _onDidChange = new EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation: Event<void> = this._onDidChange.event;

  private readonly circuitBreaker = new CircuitBreaker(5, 30000);
  private readonly openAIAdapter = new OpenAIAdapter();
  private readonly anthropicAdapter = new AnthropicAdapter();

  constructor(
    private readonly vault: SecureVault,
    private readonly config: ConfigManager,
    private readonly userAgent: string,
    private readonly globalState?: vscode.Memento,
    private readonly statusPanel?: StatusPanel
  ) {}

  fireModelInfoChanged(): void {
    this._onDidChange.fire();
    this.statusPanel?.setStatus("Ready");
  }

  async provideLanguageModelChatInformation(
    options: PrepareLanguageModelChatModelOptions,
    token: CancellationToken
  ): Promise<LanguageModelChatInformation[]> {
    if (token.isCancellationRequested) return [];

    const cached = this.globalState?.get<Array<{ id: string; name: string }>>("opengo.models");
    const models = cached && cached.length > 0 ? this.expandWithVariants(cached) : this.config.models;
    return this.mapToChatInformation(models);
  }

  private expandWithVariants(
    cached: Array<{ id: string; name: string }>
  ): ModelInfo[] {
    const result: ModelInfo[] = [];
    const added = new Set<string>();

    for (const model of cached) {
      if (!added.has(model.id)) {
        const full = this.config.getModelInfo(model.id);
        if (full) result.push(full);
        added.add(model.id);
      }
      for (const fallback of this.config.models) {
        const colon = fallback.id.indexOf(":");
        if (colon <= 0) continue;
        const baseId = fallback.id.slice(0, colon);
        if (baseId === model.id && !added.has(fallback.id)) {
          result.push(fallback);
          added.add(fallback.id);
        }
      }
    }
    return result;
  }

  private mapToChatInformation(models: ModelInfo[]): LanguageModelChatInformation[] {
    return models.map((m) => ({
      id: m.id,
      name: m.displayName,
      detail: "OpenGo Copilot",
      tooltip: `OpenGo Copilot ${m.name}`,
      family: "opengo-copilot",
      version: "1.0.0",
      maxInputTokens: Math.max(1, m.contextWindow - Math.min(m.maxOutputTokens, 65536)),
      maxOutputTokens: m.maxOutputTokens,
      capabilities: { toolCalling: m.supportsTools ? 128 : false, imageInput: true },
    }));
  }

  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken
  ): Promise<void> {
    const abortController = new AbortController();
    token.onCancellationRequested(() => abortController.abort());

    try {
      const apiKey = await this.vault.getApiKey();
      if (!apiKey) {
        progress.report(
          new vscode.LanguageModelTextPart(
            'OpenGo Copilot API key is not configured. Run "OpenGo Copilot: Manage API Key" from the Command Palette.'
          )
        );
        return;
      }

      const inputTokens = estimateMessageTokens(messages as never, model.id);
      const effectiveMaxInput = Math.max(1, model.maxInputTokens - CONTEXT_WINDOW_SAFETY_MARGIN);
      if (inputTokens > effectiveMaxInput) {
        throw new Error(
          `Message exceeds token limit (${inputTokens} > ${effectiveMaxInput}). Try reducing conversation history or switching to a model with a larger context window.`
        );
      }

      const route = resolveModelRoute(model.id, this.config);
      const modelInfo = this.config.getModelInfo(model.id);

      // Vision fallback with consent
      let effectiveMessages = messages;
      let effectiveModelId = route.effectiveModelId;
      const hasImages = this.hasImageInput(messages);

      if (hasImages && !route.supportsVision) {
        const visionModel = this.config.models.find((m) => m.supportsVision);
        if (visionModel) {
          const consent = await showConsentFallback(model.id, visionModel.displayName);
          if (consent) {
            effectiveModelId = visionModel.id;
            showTransient(`Using ${visionModel.displayName} for image analysis.`);
          }
        }
      }

      // Build adapter config
      const adapterConfig: AdapterConfig = {
        baseUrl: route.endpoint,
        apiKey,
        userAgent: this.userAgent,
        requestTimeout: this.config.requestTimeout,
        streamTimeout: this.config.streamTimeout,
        maxRetries: this.config.maxRetries,
      };

      const adapter = route.apiFormat === "anthropic" ? this.anthropicAdapter : this.openAIAdapter;

      // Build request
      const { body, headers, endpoint } = adapter.buildRequest(
        effectiveModelId,
        effectiveMessages,
        options,
        adapterConfig,
        modelInfo
      );

      // Apply prompt guidance and workarounds for OpenAI format
      let requestBody = body as { messages?: ChatMessage[]; model?: string };
      if (route.apiFormat === "openai" && Array.isArray(requestBody.messages)) {
        requestBody.messages = applyReasoningContentWorkaround(
          requestBody.messages,
          effectiveModelId
        );
        requestBody.messages = applySystemPromptGuidance(
          requestBody.messages,
          effectiveModelId,
          options,
          this.config.models
        );
      }

      log("request", { model: effectiveModelId, endpoint, format: route.apiFormat });
      this.statusPanel?.setStatus("Streaming");

      // Execute request
      const response = await fetchWithRetry(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: abortController.signal,
          timeout: adapterConfig.requestTimeout,
          retries: adapterConfig.maxRetries,
        },
        this.circuitBreaker
      );

      if (!response.ok) {
        const text = await response.text();
        let message = `OpenGo API error: ${response.status} ${response.statusText}`;
        if (response.status === 401 || response.status === 403) {
          message = `Authentication failed. Your API key may be invalid or expired.\n${message}`;
        } else if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          message = `Rate limited. ${retryAfter ? `Retry after ${retryAfter}s. ` : ""}\n${message}`;
        } else if (response.status >= 500 && response.status < 600) {
          message = `Server error. The OpenGo service may be experiencing issues.\n${message}`;
        }
        throw new Error(`${message}\n${text}`);
      }

      // Stream processing
      const outputGuard = new OutputGuard(options);
      const toolCallBuffers = new Map<string, { name: string; argsJson: string }>();

      for await (const data of streamSSE(
        response,
        adapterConfig.streamTimeout,
        abortController.signal
      )) {
        if (token.isCancellationRequested) throw new vscode.CancellationError();

        const chunk = adapter.parseStreamChunk(data);
        if (!chunk) continue;
        if (chunk.done) break;
        if (chunk.error) throw new Error(chunk.error);

        if (chunk.text) {
          progress.report(new vscode.LanguageModelTextPart(chunk.text));
        }

        if (chunk.reasoning && this.config.showReasoningTokens) {
          // VS Code doesn't have a dedicated reasoning part yet, prefix for visibility
          progress.report(new vscode.LanguageModelTextPart(`\uD83E\uDDE0 ${chunk.reasoning}`));
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          for (const tc of chunk.toolCalls) {
            if (tc.id === "pending" && tc.name === "pending") {
              // Accumulate partial JSON (Anthropic adapter placeholder)
              continue;
            }

            if (!tc.args || Object.keys(tc.args).length === 0) {
              // Buffer incomplete tool calls
              const buf = toolCallBuffers.get(tc.id) ?? { name: tc.name, argsJson: "" };
              toolCallBuffers.set(tc.id, buf);
              continue;
            }

            const valid = await outputGuard.processToolCall(tc);
            if (valid) {
              progress.report(
                new vscode.LanguageModelToolCallPart(tc.id, tc.name, tc.args)
              );
            }
          }
        }
      }
    } catch (err) {
      this.statusPanel?.recordError(err instanceof Error ? err.message : String(err));
      if (token.isCancellationRequested || (err instanceof Error && err.name === "AbortError")) {
        throw new vscode.CancellationError();
      }
      log("chat-response-error", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  provideTokenCount(
    _model: LanguageModelChatInformation,
    text: string | LanguageModelChatRequestMessage,
    _token: CancellationToken
  ): Promise<number> {
    if (typeof text === "string") {
      return Promise.resolve(estimateMessageTokens([{ content: [{ value: text } as vscode.LanguageModelInputPart] }]));
    }
    return Promise.resolve(estimateMessageTokens([text as never]));
  }

  private hasImageInput(messages: readonly LanguageModelChatMessage[]): boolean {
    for (const msg of messages) {
      for (const part of msg.content) {
        const p = part as unknown as Record<string, unknown>;
        if (typeof p.mimeType === "string" && p.mimeType.startsWith("image/")) return true;
      }
    }
    return false;
  }
}
