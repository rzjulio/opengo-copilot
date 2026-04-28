import * as vscode from "vscode";

function getTextValue(part: vscode.LanguageModelInputPart | unknown): string | undefined {
  if (part instanceof vscode.LanguageModelTextPart) return part.value;
  if (typeof part === "object" && part !== null && "value" in part) {
    const p = part as { value?: unknown };
    if (typeof p.value === "string") return p.value;
  }
  return undefined;
}

export function estimateTokens(text: string, _modelId?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 2);
}

export function estimateMessageTokens(
  messages: readonly { content: (vscode.LanguageModelInputPart | unknown)[] }[],
  modelId?: string,
): number {
  let total = 0;
  for (const m of messages) {
    for (const part of m.content) {
      const tv = getTextValue(part);
      if (tv !== undefined) {
        total += estimateTokens(tv, modelId);
      }
    }
  }
  return total;
}
