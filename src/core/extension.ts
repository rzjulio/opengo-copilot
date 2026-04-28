import * as vscode from "vscode";
import { SecureVault } from "./vault";
import { ConfigManager } from "./config";
import { OpenGoChatProvider } from "../providers/chat-provider";
import { registerTools } from "../tools/registry";
import { StatusPanel } from "../ui/status-panel";
import { log, getOutputChannel, setDebugEnabled } from "../utils/logger";
import { fetchWithRetry } from "../transport/http-client";

const EXTENSION_VERSION = "1.0.0";

export function activate(context: vscode.ExtensionContext) {
  const userAgent = `OpenGo-Copilot/${EXTENSION_VERSION}`;
  const channel = getOutputChannel();
  context.subscriptions.push(channel);

  const debugEnabled = context.globalState.get<boolean>("opengo.debug", false);
  setDebugEnabled(debugEnabled);

  log("activate", `Extension activated. Debug: ${debugEnabled}`);

  // Enable the status panel view
  vscode.commands.executeCommand("setContext", "opengo.enabled", true);

  const vault = new SecureVault(context.secrets);
  const config = new ConfigManager(context);
  const statusPanel = new StatusPanel(context, config);
  const provider = new OpenGoChatProvider(vault, config, userAgent, context.globalState, statusPanel);

  // Fetch models on startup
  vault
    .getApiKey()
    .then((key) => {
      if (!key) return;
      return fetchModels(key, userAgent, config.getEndpointForModel("")).then((models) => {
        if (models && models.length > 0) {
          context.globalState.update("opengo.models", models);
          provider.fireModelInfoChanged();
        }
      });
    })
    .catch(() => {
      // Silent: fallback to built-in models
    });

  // React to key changes
  context.subscriptions.push(
    context.secrets.onDidChange((e) => {
      if (e.key === "opengo.apiKey") {
        provider.fireModelInfoChanged();
      }
    })
  );

  // Register LM provider
  const registration = vscode.lm.registerLanguageModelChatProvider("opengo-copilot", provider);
  context.subscriptions.push(registration);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("opengo-copilot.manage", async () => {
      await vault.promptForApiKey();
      provider.fireModelInfoChanged();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opengo-copilot.toggleDebug", async () => {
      const current = context.globalState.get<boolean>("opengo.debug", false);
      const next = !current;
      await context.globalState.update("opengo.debug", next);
      setDebugEnabled(next);
      if (next) {
        const confirm = await vscode.window.showWarningMessage(
          "Debug logging enabled. Message CONTENT is NEVER logged. Only metadata is recorded. Continue?",
          "Yes",
          "No"
        );
        if (confirm !== "Yes") {
          await context.globalState.update("opengo.debug", false);
          setDebugEnabled(false);
          vscode.window.showInformationMessage("Debug logging cancelled.");
          return;
        }
      }
      log("toggle-debug", next ? "enabled" : "disabled");
      vscode.window.showInformationMessage(
        `OpenGo debug logging ${next ? "enabled" : "disabled"}.`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opengo-copilot.openStatusPanel", () => {
      channel.show(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opengo-copilot.compareModels", async () => {
      const models = config.models;
      const picks = models.map((m) => ({ label: m.displayName, description: m.id }));
      const selected = await vscode.window.showQuickPick(picks, {
        canPickMany: true,
        placeHolder: "Select 2+ models to compare",
      });
      if (!selected || selected.length < 2) {
        vscode.window.showWarningMessage("Select at least 2 models to compare.");
        return;
      }
      vscode.window.showInformationMessage(
        `Comparison mode selected: ${selected.map((s) => s.label).join(", ")}. Not yet implemented in MVP.`
      );
    })
  );

  // Register tools
  try {
    context.subscriptions.push(registerTools(vault, config));
  } catch (error) {
    log("tool-register-error", error);
  }
}

export function deactivate() {
  log("deactivate", "Extension deactivated");
}

async function fetchModels(
  apiKey: string,
  userAgent: string,
  endpoint: string
): Promise<Array<{ id: string; name: string }> | null> {
  try {
    const response = await fetchWithRetry(`${endpoint}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": userAgent,
      },
      retries: 2,
      timeout: 10000,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<{ id: string; name: string }> };
    return data.data ?? null;
  } catch {
    return null;
  }
}
