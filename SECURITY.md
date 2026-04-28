# Security Architecture

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| API key exfiltration | `SecretStorage`; no env vars, no `settings.json` |
| Prompt injection | NFKC + pattern + structural guards; refusals with safeFallback |
| Tool call abuse | OutputGuard: dedup, schema validation, unregistered-tool block |
| Overuse / DoS | Circuit breaker, rate limiting, timeouts |
| Sensitive data in logs | Metadata-only by default; SHA-256 hashing; opt-in required |
| PII leakage | Content never logged unless user explicitly enables `opengo.security.logContent` |

## Secure Defaults

- `promptInjectionDefense`: **enabled**
- `logContent`: **disabled** (metadata-only)
- `requestTimeout`: **30s**
- `maxRetries`: **3**
- Circuit breaker: **3 failures / 30s reset**

## Audit

- Run `npm audit` regularly.
- Pin exact dependency versions.
- Use `allowedHosts` check before every request.
