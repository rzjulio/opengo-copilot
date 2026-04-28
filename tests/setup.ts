import { vi } from "vitest";

vi.mock("vscode", () => ({
  ExtensionContext: class {},
  Memento: class {
    get = vi.fn();
    update = vi.fn();
    keys = vi.fn().mockReturnValue([]);
  },
  SecretStorage: class {
    get = vi.fn();
    store = vi.fn();
    delete = vi.fn();
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  LanguageModelToolCallPart: class {
    constructor(public id: string, public name: string, public args: unknown) {}
  },
  CancellationError: class extends Error {},
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn().mockReturnValue({ appendLine: vi.fn() }),
    showInputBox: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue([]),
      update: vi.fn(),
    }),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class {
    constructor(public id: string) {}
  },
}));
