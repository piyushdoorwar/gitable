const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Bundles the extension host code into a single CommonJS file that VS Code loads.
 * The `vscode` module is provided by the runtime, so it stays external.
 */
async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node24",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "info"
  });

  if (watch) {
    await ctx.watch();
    console.log("[esbuild] watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
