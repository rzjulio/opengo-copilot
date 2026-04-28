import { log } from "../utils/logger";

/**
 * Patterns commonly used in prompt injection attacks to extract system prompts
 * or override model behavior.
 */
const INJECTION_PATTERNS = [
  /ignore previous instructions/gi,
  /disregard (all )?system (prompt|instructions)/gi,
  /repeat (the )?(text|words) (above|before)/gi,
  /what (were you told|instructions were you given)/gi,
  /print (your|the) (system|initial|hidden|developer) (prompt|instructions)/gi,
  /show me your (system|hidden) (prompt|message)/gi,
  /you are now .* mode/gi,
  /DAN|do anything now/gi,
  /jailbreak/gi,
  /ignore (the )?above/gi,
  /start (your )?response with/gi,
  /output (initialization|init) above/gi,
];

/**
 * Sanitize input text to reduce prompt injection surface.
 * Uses Unicode NFKC normalization to collapse homoglyphs and
 * detects known injection patterns.
 */
export function sanitizeInput(text: string): {
  sanitized: string;
  threats: string[];
} {
  // NFKC normalization collapses visually equivalent characters
  const normalized = text.normalize("NFKC");

  const threats: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) {
      threats.push(`Matched pattern: ${pattern.source}`);
    }
  }

  if (threats.length > 0) {
    log("input-guard", `Detected ${threats.length} potential injection patterns`);
  }

  return { sanitized: normalized, threats };
}

/**
 * Check if a system prompt contains leakage markers.
 */
export function detectSystemLeakAttempt(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("system prompt") ||
    lower.includes("your instructions") ||
    lower.includes("hidden message") ||
    lower.includes("developer message")
  );
}
