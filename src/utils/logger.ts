import * as vscode from "vscode";

const OUTPUT_CHANNEL_NAME = "OpenGo Copilot";

interface GlobalWithChannel {
  __opengoOutputChannel?: vscode.OutputChannel;
}

function getGlobalChannel(): vscode.OutputChannel | undefined {
  return (globalThis as unknown as GlobalWithChannel).__opengoOutputChannel;
}

function setGlobalChannel(channel: vscode.OutputChannel): void {
  (globalThis as unknown as GlobalWithChannel).__opengoOutputChannel = channel;
}

export function getOutputChannel(): vscode.OutputChannel {
  let channel = getGlobalChannel();
  if (!channel) {
    channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    setGlobalChannel(channel);
  }
  return channel;
}

export function isDebugEnabled(): boolean {
  return process.env.OPENGO_DEBUG === "1";
}

export function isContentLoggingEnabled(): boolean {
  return process.env.OPENGO_DEBUG_CONTENT === "1";
}

/**
 * Safe logger: NEVER logs message content, images, or tool results.
 * Only metadata, lengths, status codes, and IDs.
 */
export function log(label: string, value: unknown): void {
  if (!isDebugEnabled()) return;

  const channel = getOutputChannel();
  let message: string;

  if (typeof value === "string") {
    message = value;
  } else if (value && typeof value === "object") {
    const safe = sanitizeForLog(value);
    message = JSON.stringify(safe, null, 2);
  } else {
    message = String(value);
  }

  channel.appendLine(`[OpenGo] ${label}: ${message}`);
}

function sanitizeForLog(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("content") ||
      lower.includes("message") ||
      lower.includes("prompt") ||
      lower.includes("text") ||
      lower.includes("image") ||
      lower.includes("data") ||
      lower.includes("base64") ||
      lower.includes("key") ||
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("password")
    ) {
      if (typeof val === "string") {
        result[key] = `<string:${val.length} chars>`;
      } else if (Array.isArray(val)) {
        result[key] = `<array:${val.length} items>`;
      } else {
        result[key] = "<redacted>";
      }
    } else {
      result[key] = sanitizeForLog(val);
    }
  }
  return result;
}
