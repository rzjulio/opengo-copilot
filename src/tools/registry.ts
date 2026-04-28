import * as vscode from "vscode";
import { SecureVault } from "../core/vault";
import { ConfigManager } from "../core/config";
import { OpenGoAnalyzeImageTool } from "./image-analyzer";
import { log } from "../utils/logger";

export function registerTools(
  vault: SecureVault,
  config: ConfigManager
): vscode.Disposable {
  try {
    const analyzeImageTool = new OpenGoAnalyzeImageTool(vault, config);
    const registration = vscode.lm.registerTool(
      OpenGoAnalyzeImageTool.id,
      analyzeImageTool
    );
    log("tools", "Registered OpenGo tools");
    return registration;
  } catch (error) {
    log("tools-error", error instanceof Error ? error.message : String(error));
    vscode.window.showWarningMessage(
      "OpenGo image analysis tool could not be registered. Chat remains available."
    );
    return { dispose: () => {} };
  }
}
