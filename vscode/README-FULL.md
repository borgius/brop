# BROP MCP Tools — VS Code Extension 🔧

Integrates BROP MCP tools into VS Code and provides a lightweight UI and a small programmatic API that other extensions can use. This extension currently exposes a simple command and a webview-based panel listing available BROP tools.

## Features ✅

- Command: `BROP: Connect to MCP Tools` (command id `brop.connect`)
- Webview panel that lists available tools and lets you run them (stub implementation)
- Small exported API with `getTools()`, `runTool(id)` and `registerTool(tool)` to allow other extensions to integrate

## Development / Build 🔧

1. Change into the `vscode` folder:

   ```bash
   cd vscode
   ```

2. Install dev dependencies and compile:

   ```bash
   npm install
   npm run compile
   ```

3. Run the extension in VS Code: Press F5 ("Run Extension") in the debugger.

## Usage 💡

- Open the command palette (Cmd/Ctrl+Shift+P) and run `BROP: Connect to MCP Tools`.
- The panel will show the current list of stub tools and allow running them; this currently shows a simple message when running.

## Extension API (for other extensions) 🔌

When another extension activates and depends on this extension, it can access the exported API:

```ts
const bropExt = await vscode.extensions.getExtension('brop-mcp-vscode')?.activate();
if (bropExt) {
  const tools = bropExt.getTools();
  bropExt.registerTool({ id: 'my-tool', title: 'My Tool', description: 'Plugin example' });
}
```

## Next steps ✨

- Wire up real BROP MCP tool invocations (bridge communication / commands)
- Add tests and CI job to run compile checks
- Improve UI and add persistent configuration

---

If you'd like, I can continue wiring the extension into the bridge in this repository and add tests and CI; tell me which tool you'd like integrated first.
