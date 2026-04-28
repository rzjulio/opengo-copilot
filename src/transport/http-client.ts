import { log } from "../utils/logger";
import { CircuitBreaker } from "./circuit-breaker";

const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function getRetryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return undefined;
}

function calculateDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter !== undefined && retryAfter > 0) {
    const jitter = retryAfter * 0.25 * (Math.random() * 2 - 1);
    return Math.max(Math.round(retryAfter + jitter), 0);
  }
  const exponential = BASE_RETRY_DELAY * Math.pow(2, attempt);
  const capped = Math.min(exponential, MAX_RETRY_DELAY);
  return Math.round(Math.random() * capped);
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeout?: number;
  retries?: number;
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions,
  circuitBreaker?: CircuitBreaker
): Promise<Response> {
  if (circuitBreaker?.isOpen) {
    throw new Error(
      "Service temporarily unavailable. Circuit breaker is open. Please try again later."
    );
  }

  const { timeout = 30000, retries = 3 } = options;
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const mergedSignal = options.signal
        ? abortAny([controller.signal, options.signal])
        : controller.signal;

      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: mergedSignal,
      });
      clearTimeout(timeoutId);

      if (response.ok || !isRetryableStatus(response.status)) {
        circuitBreaker?.recordSuccess();
        return response;
      }

      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
      if (i < retries - 1) {
        const delay = calculateDelay(i, getRetryAfterMs(response.headers));
        log("fetch-retry", `Attempt ${i + 1} failed (${response.status}), retrying after ${delay}ms`);
        await sleep(delay);
      }
    } catch (error) {
      clearTimeout(undefined as unknown as ReturnType<typeof setTimeout>);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === "AbortError") throw lastError;
      if (i < retries - 1) {
        const delay = calculateDelay(i);
        log("fetch-retry", `Attempt ${i + 1} network error, retrying after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  circuitBreaker?.recordFailure();
  throw lastError ?? new Error("Network request failed after retries");
}

function abortAny(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* streamSSE(
  response: Response,
  streamTimeout: number,
  abortSignal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    throw new Error("No response body for SSE stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastDataTime = Date.now();

  try {
    while (true) {
      if (abortSignal?.aborted) {
        throw new Error("Stream aborted");
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => reject(new Error("SSE stream timeout")), streamTimeout);
        abortSignal?.addEventListener("abort", () => {
          clearTimeout(id);
          reject(new Error("Stream aborted"));
        });
      });

      let result: Awaited<ReturnType<typeof reader.read>>;
      try {
        result = await Promise.race([reader.read(), timeoutPromise]);
      } catch (err) {
        throw err;
      }

      if (result.done) break;

      lastDataTime = Date.now();
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          yield trimmed.slice(6);
        }
      }
    }

    const remaining = decoder.decode();
    buffer += remaining;
    const finalLines = buffer.split("\n");
    for (const line of finalLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        yield trimmed.slice(6);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
