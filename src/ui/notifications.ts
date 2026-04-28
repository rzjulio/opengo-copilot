import * as vscode from "vscode";

export async function showConsentFallback(
  originalModel: string,
  fallbackModel: string,
  globalState?: vscode.Memento
): Promise<boolean> {
  const stateKey = `opengo.visionConsent.${originalModel}`;
  if (globalState?.get<boolean>(stateKey)) return true;

  const result = await vscode.window.showInformationMessage(
    `The model "${originalModel}" does not support images. Use "${fallbackModel}" to analyze this image?`,
    { modal: false },
    "Yes",
    "No",
    "Always"
  );
  if (result === "Always") {
    await globalState?.update(stateKey, true);
    return true;
  }
  return result === "Yes";
}

export function showTransient(message: string): void {
  vscode.window.showInformationMessage(message);
}

export function showWarning(message: string): void {
  vscode.window.showWarningMessage(`[OpenGo] ${message}`);
}

export function showError(message: string): void {
  vscode.window.showErrorMessage(`[OpenGo] ${message}`);
}