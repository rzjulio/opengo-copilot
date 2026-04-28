import * as vscode from "vscode";

const API_KEY_SECRET = "opengo.apiKey";

export class SecureVault {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(): Promise<string | undefined> {
    return this.secrets.get(API_KEY_SECRET);
  }

  async setApiKey(key: string): Promise<void> {
    await this.secrets.store(API_KEY_SECRET, key.trim());
  }

  async deleteApiKey(): Promise<void> {
    await this.secrets.delete(API_KEY_SECRET);
  }

  async promptForApiKey(): Promise<string | undefined> {
    const existing = await this.getApiKey();
    const masked = existing ? `${existing.slice(-4)}` : undefined;
    const entered = await vscode.window.showInputBox({
      title: "OpenGo Copilot API Key",
      prompt: existing
        ? `Update your API key (current ends in ...${masked})`
        : "Enter your OpenCode Go API key",
      ignoreFocusOut: true,
      password: true,
      value: existing ?? "",
      placeHolder: "sk-...",
    });

    if (entered === undefined) return undefined;
    const trimmed = entered.trim();
    if (!trimmed) {
      await this.deleteApiKey();
      vscode.window.showInformationMessage("OpenGo Copilot API key cleared.");
      return undefined;
    }
    await this.setApiKey(trimmed);
    vscode.window.showInformationMessage("OpenGo Copilot API key saved securely.");
    return trimmed;
  }
}
