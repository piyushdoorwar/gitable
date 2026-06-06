import * as vscode from "vscode";
import { Commands, VIEW_ID } from "./constants";
import { GitCliService } from "./git/GitCliService";
import { VsCodeGitService } from "./git/VsCodeGitService";
import { SecretService } from "./config/SecretService";
import { SettingsService } from "./config/SettingsService";
import { GitableViewProvider } from "./views/GitableViewProvider";
import { Logger } from "./utils/Logger";

let logger: Logger | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger();
  logger.info("Gitable is activating.");

  const secrets = new SecretService(context.secrets);
  const settings = new SettingsService(context.globalState);

  const cli = new GitCliService(logger);
  const git = new VsCodeGitService(cli, logger);
  await git.initialize();

  const provider = new GitableViewProvider(context.extensionUri, git, secrets, settings, logger);

  context.subscriptions.push(
    logger,
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Push fresh state to the webview whenever Git state changes on disk.
  context.subscriptions.push(
    git.registerChangeListener(() => {
      void provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.refresh, () => provider.refresh()),
    vscode.commands.registerCommand(Commands.generateCommitMessage, () =>
      provider.generateCommitMessage()
    ),
    vscode.commands.registerCommand(Commands.commit, () => provider.commitFromCommand()),
    vscode.commands.registerCommand(Commands.stageAll, () => provider.stageAll()),
    vscode.commands.registerCommand(Commands.unstageAll, () => provider.unstageAll()),
    vscode.commands.registerCommand(Commands.openSettings, () =>
      provider.focusAndOpenTab("settings")
    ),
    vscode.commands.registerCommand(Commands.validateApiKey, () =>
      provider.validateActiveProviderKey()
    ),
    vscode.commands.registerCommand(Commands.push, () => provider.pushCommand()),
    vscode.commands.registerCommand(Commands.pull, () => provider.pullCommand()),
    vscode.commands.registerCommand(Commands.createBranch, () => provider.createBranchCommand()),
    vscode.commands.registerCommand(Commands.switchBranch, () => provider.switchBranchCommand())
  );

  logger.info("Gitable activated.");
}

export function deactivate(): void {
  logger?.info("Gitable deactivated.");
  logger = undefined;
}
