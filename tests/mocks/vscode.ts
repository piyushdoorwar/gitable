export const workspace = {
  workspaceFolders: []
};

export const window = {
  createOutputChannel() {
    return {
      appendLine() {
        // Test mock.
      },
      show() {
        // Test mock.
      },
      dispose() {
        // Test mock.
      }
    };
  }
};
