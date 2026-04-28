# OpenGo Copilot

Secure multi-provider LLM bridge for VS Code Copilot Chat — a hardened rewrite of `opencode-go-provider` with enterprise-grade defenses, zero-code adapters, and full transparency.

## Features

- **Zero-code model adapters** — Add any OpenAI or Anthropic-compatible model via `settings.json`.
- **Circuit breaker** — Automatic failover and protection against cascading API failures.
- **Prompt injection defense** — NFKC normalization + pattern detection + structural sanitization.
- **Output guard** — Tool call deduplication, schema validation, and sandbox restrictions.
- **Metadata-only logging** — Message content never hits logs by default; content logging requires explicit opt-in.
- **Secure vault** — API keys stored in `vscode.SecretStorage`, never on disk.
- **Explicit consent** — Vision fallback requires user approval per-request.
- **Status panel** — Real-time diagnostics in the VS Code explorer sidebar.
- **Model comparison** — Side-by-side latency, cost, and capability comparison.

## Security Architecture

See [SECURITY.md](SECURITY.md).

## Installation

```bash
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

## Configuration

Open VS Code Settings → OpenGo Copilot.

Add custom models:

```json
{
  "opengo.models.custom": [
    {
      "id": "my-llama",
      "displayName": "My Llama",
      "contextWindow": 32768,
      "apiFormat": "openai",
      "endpoint": "https://my-llama.local/v1",
      "supportsVision": false
    }
  ]
}
```

## Commands

- `OpenGo Copilot: Manage API Key`
- `OpenGo Copilot: Toggle Debug Logging`
- `OpenGo Copilot: Open Status Panel`
- `OpenGo Copilot: Compare Models`

## Testing

```bash
npm test        # Unit + security tests
npm run lint    # ESLint
npm run format  # Prettier
```

## License

MIT
