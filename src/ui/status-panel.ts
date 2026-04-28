import * as vscode from "vscode";
import { ConfigManager } from "../core/config";
import { log } from "../utils/logger";

const TREE_VIEW_ID = "opengoStatusPanel";

interface StatusItem {
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: vscode.ThemeIcon;
  children?: StatusItem[];
}

class StatusTreeDataProvider implements vscode.TreeDataProvider<StatusItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: StatusItem[] = [];

  refresh(items: StatusItem[]): void {
    this.items = items;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StatusItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    treeItem.description = element.description;
    treeItem.tooltip = element.tooltip;
    if (element.iconPath) {
      treeItem.iconPath = element.iconPath;
    }
    return treeItem;
  }

  getChildren(element?: StatusItem): StatusItem[] {
    if (!element) return this.items;
    return element.children ?? [];
  }
}

export class StatusPanel {
  private readonly provider = new StatusTreeDataProvider();
  private readonly treeView: vscode.TreeView<StatusItem>;
  private sessionTokens = 0;
  private sessionRequests = 0;
  private lastError?: string;
  private lastStatus = "Ready";

  constructor(
    context: vscode.ExtensionContext,
    private readonly config: ConfigManager
  ) {
    this.treeView = vscode.window.createTreeView(TREE_VIEW_ID, {
      treeDataProvider: this.provider,
      showCollapseAll: true,
    });
    context.subscriptions.push(this.treeView);
    this.refresh();
  }

  recordRequest(tokensUsed: number): void {
    this.sessionRequests += 1;
    this.sessionTokens += tokensUsed;
    this.lastStatus = "Active";
    this.refresh();
  }

  recordError(error: string): void {
    this.lastError = error;
    this.lastStatus = "Error";
    this.refresh();
  }

  setStatus(status: string): void {
    this.lastStatus = status;
    this.refresh();
  }

  private refresh(): void {
    const models = this.config.models;
    const items: StatusItem[] = [
      {
        label: "Connection",
        iconPath: new vscode.ThemeIcon(
          this.lastStatus === "Error" ? "error" : this.lastStatus === "Active" ? "debug-start" : "pass"
        ),
        children: [
          { label: "Status", description: this.lastStatus },
          { label: "Endpoint", description: this.config.getEndpointForModel("") },
        ],
      },
      {
        label: "Session",
        iconPath: new vscode.ThemeIcon("graph"),
        children: [
          { label: "Requests", description: String(this.sessionRequests) },
          { label: "Tokens Used", description: String(this.sessionTokens) },
        ],
      },
      {
        label: "Models",
        iconPath: new vscode.ThemeIcon("list-flat"),
        children: models.map((m) => ({
          label: m.displayName,
          description: m.apiFormat,
          tooltip: `Context: ${m.contextWindow} | Output: ${m.maxOutputTokens} | Vision: ${m.supportsVision} | Tools: ${m.supportsTools}`,
        })),
      },
    ];

    if (this.lastError) {
      items.push({
        label: "Last Error",
        iconPath: new vscode.ThemeIcon("warning"),
        children: [{ label: this.lastError }],
      });
    }

    this.provider.refresh(items);
  }
}
