import * as vscode from "vscode";

/**
 * URI scheme used for the missing side of an added/deleted-file diff.
 *
 * VS Code's Git content provider throws FileNotFound when a path does not exist
 * at a requested revision. A diff still needs a resolvable document on both
 * sides, so this provider supplies the expected empty document.
 */
export const EMPTY_DOCUMENT_SCHEME = "gitable-empty";

export class EmptyDocumentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(): string {
    return "";
  }
}

/** Creates a stable empty-document URI while retaining the file extension. */
export function emptyDocumentUri(filePath: string, revision: string): vscode.Uri {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const uriPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return vscode.Uri.from({
    scheme: EMPTY_DOCUMENT_SCHEME,
    path: uriPath,
    query: `revision=${encodeURIComponent(revision)}`
  });
}
