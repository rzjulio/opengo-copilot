import * as vscode from "vscode";
import { fetchWithRetry } from "../transport/http-client";
import { SecureVault } from "../core/vault";
import { ConfigManager } from "../core/config";
import { log } from "../utils/logger";

const DEFAULT_VISION_MODEL = "mimo-v2-omni";

export class OpenGoAnalyzeImageTool implements vscode.LanguageModelTool<{
  image_data: string;
  prompt: string;
}> {
  static readonly id = "opengo_analyze_image";

  readonly name = OpenGoAnalyzeImageTool.id;
  readonly description =
    "Analyze an image using a vision model. Use this tool when you need to " +
    "understand or describe the content of an image, extract text (OCR), " +
    "or answer questions about visual content.";
  readonly tags = ["vision", "image", "ocr", "analysis"];

  readonly inputSchema = {
    type: "object" as const,
    properties: {
      image_data: {
        type: "string",
        description:
          "Base64-encoded image data URL (e.g., 'data:image/png;base64,...').",
      },
      prompt: {
        type: "string",
        description:
          "The question or instruction about what to analyze in the image.",
      },
    },
    required: ["image_data", "prompt"],
  };

  constructor(
    private readonly vault: SecureVault,
    private readonly config: ConfigManager
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{
      image_data: string;
      prompt: string;
    }>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { image_data, prompt } = options.input;
    try {
      const result = await this.analyzeImage(image_data, prompt);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      log("image-tool-error", msg);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Failed to analyze image: ${msg}`),
      ]);
    }
  }

  prepareInvocation?(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<{
      image_data: string;
      prompt: string;
    }>,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: "Analyzing image with OpenGo Vision..." };
  }

  private async analyzeImage(imageData: string, prompt: string): Promise<string> {
    const apiKey = await this.vault.getApiKey();
    if (!apiKey) {
      throw new Error("OpenGo API key not found");
    }

    const endpoint = this.config.getEndpointForModel(DEFAULT_VISION_MODEL);
    const response = await fetchWithRetry(
      `${endpoint}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_VISION_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageData } },
              ],
            },
          ],
          max_tokens: 2000,
        }),
        timeout: this.config.requestTimeout,
        retries: 2,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      const sanitized = text.length > 200 ? text.slice(0, 200) + "..." : text;
      throw new Error(`Vision API error: ${response.status}. ${sanitized}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "Failed to analyze image";
  }
}
