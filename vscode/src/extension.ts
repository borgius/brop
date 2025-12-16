import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';


export interface BropTool {
  id: string;
  title: string;
  description?: string;
}

let tools: BropTool[] = [
  { id: 'brop_navigate', title: 'Navigate (brop_navigate)', description: 'Navigate to a URL in the browser' },
  { id: 'brop_get_page_content', title: 'Get Page Content (brop_get_page_content)', description: 'Retrieve page HTML/text/metadata' },
  { id: 'brop_get_simplified_content', title: 'Get Simplified Content (brop_get_simplified_content)', description: 'Get simplified DOM as HTML or Markdown' },
  { id: 'brop_execute_script', title: 'Execute Script (brop_execute_script)', description: 'Execute JS in the page context' },
  { id: 'brop_click_element', title: 'Click Element (brop_click_element)', description: 'Click an element by selector' },
  { id: 'brop_type_text', title: 'Type Text (brop_type_text)', description: 'Type text into an input' },
  { id: 'brop_create_page', title: 'Create Page (brop_create_page)', description: 'Create a new tab/page' },
  { id: 'brop_close_tab', title: 'Close Tab (brop_close_tab)', description: 'Close a browser tab' },
  { id: 'brop_list_tabs', title: 'List Tabs (brop_list_tabs)', description: 'List open browser tabs' },
  { id: 'brop_activate_tab', title: 'Activate Tab (brop_activate_tab)', description: 'Activate/switch to a tab' },
  { id: 'brop_get_server_status', title: 'Get Server Status (brop_get_server_status)', description: 'Get BROP server/connection status' },
  { id: 'brop_start_console_capture', title: 'Start Console Capture (brop_start_console_capture)', description: 'Start capturing console logs for a tab' },
  { id: 'brop_get_console_logs', title: 'Get Console Logs (brop_get_console_logs)', description: 'Retrieve captured console logs' },
  { id: 'brop_clear_console_logs', title: 'Clear Console Logs (brop_clear_console_logs)', description: 'Clear captured console logs' },
  { id: 'brop_stop_console_capture', title: 'Stop Console Capture (brop_stop_console_capture)', description: 'Stop console capture for a tab' },
  { id: 'cdp_execute_command', title: 'CDP Execute Command (cdp_execute_command)', description: 'Execute a CDP command' },
  { id: 'cdp_create_page', title: 'CDP Create Page (cdp_create_page)', description: 'Create a page via CDP' },
  { id: 'cdp_navigate', title: 'CDP Navigate (cdp_navigate)', description: 'Navigate with CDP' },
  { id: 'cdp_evaluate', title: 'CDP Evaluate (cdp_evaluate)', description: 'Evaluate JS in page via CDP' }
];

let bropProcess: ChildProcessWithoutNullStreams | null = null;
let bropStarted = false;
let bropOutputChannel: vscode.OutputChannel | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('BROP MCP Tools extension activated');

  // Create an output channel for server logs
  bropOutputChannel = vscode.window.createOutputChannel('BROP MCP');
  context.subscriptions.push(bropOutputChannel);

  // Start the BROP MCP server automatically on extension activation
  startBropServer(context).catch((err) => {
    vscode.window.showWarningMessage('Failed to start local BROP MCP server: ' + err.message);
    console.warn('Failed to start BROP MCP server:', err);
  });

  const connectCmd = vscode.commands.registerCommand('brop.connect', async () => {
    const panel = vscode.window.createWebviewPanel(
      'bropMcp',
      'BROP MCP Tools',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(context, panel);

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'getTools':
          panel.webview.postMessage({ command: 'tools', tools: getTools() });
          break;
        case 'runTool':
          // Ask the user for params as JSON and run the selected tool
          const paramsInput = await vscode.window.showInputBox({
            prompt: `Enter JSON parameters for ${message.toolId} (e.g. {"url":"https://example.com"})`,
            placeHolder: '{}',
          });

          let params = {};
          if (paramsInput && paramsInput.trim().length > 0) {
            try {
              params = JSON.parse(paramsInput);
            } catch (err) {
              vscode.window.showErrorMessage('Invalid JSON parameters');
              return;
            }
          }

          panel.webview.postMessage({ command: 'running', toolId: message.toolId, params });

          try {
            const result = await runBropTool(message.toolId, params);
            panel.webview.postMessage({ command: 'runResult', toolId: message.toolId, result });
            const out = JSON.stringify(result, null, 2).slice(0, 2000);
            vscode.window.showInformationMessage(`Tool ${message.toolId} result: ${out}`);
          } catch (err: any) {
            panel.webview.postMessage({ command: 'runError', toolId: message.toolId, error: err.message });
            vscode.window.showErrorMessage(`Tool ${message.toolId} failed: ${err.message}`);
          }

          break;
      }
    });
  });

  context.subscriptions.push(connectCmd);

  // Export a small API that other extensions can call.
  const api = {
    getTools,
    runTool,
    registerTool
  };

  return api;
}

async function runBropTool(toolId: string, params: any) {
  const mapping: Record<string, string> = {
    brop_navigate: 'navigate',
    brop_get_page_content: 'get_page_content',
    brop_get_simplified_content: 'get_simplified_dom',
    brop_execute_script: 'execute_console',
    brop_click_element: 'click',
    brop_type_text: 'type',
    brop_create_page: 'create_tab',
    brop_close_tab: 'close_tab',
    brop_list_tabs: 'list_tabs',
    brop_activate_tab: 'activate_tab',
    brop_get_server_status: 'get_server_status',
    brop_start_console_capture: 'start_console_capture',
    brop_get_console_logs: 'get_console_logs',
    brop_clear_console_logs: 'clear_console_logs',
    brop_stop_console_capture: 'stop_console_capture',
    cdp_execute_command: 'cdp_execute_command',
    cdp_create_page: 'cdp_create_page',
    cdp_navigate: 'cdp_navigate',
    cdp_evaluate: 'cdp_evaluate',
  };

  const method = mapping[toolId];
  if (!method) throw new Error(`Unknown tool id: ${toolId}`);

  // Simple WebSocket client to the local BROP server (port configurable later)
  const url = 'ws://localhost:9225';
  // Use ws dynamic import to avoid bundling issues
  const WebSocket = require('ws');

  return new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: 3000 });

    const id = Date.now();
    const payload = { id, method, params };

    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch (e) {}
      reject(new Error('Timeout waiting for BROP server response'));
    }, 10000);

    ws.on('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timeout);
          ws.close();

          if (msg.success === false) {
            reject(new Error(msg.error || 'BROP error'));
          } else {
            resolve(msg.result || msg);
          }
        }
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        reject(err);
      }
    });

    ws.on('error', (err: any) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err.message || err}`));
    });
  });
}

async function stopBropServer() {
  if (bropProcess) {
    try {
      bropProcess.kill();
    } catch (e) {
      console.warn('Failed to kill BROP process', e);
    }
    bropProcess = null;
    bropStarted = false;
  }
}

export async function deactivate() {
  await stopBropServer();
  if (bropOutputChannel) {
    bropOutputChannel.dispose();
    bropOutputChannel = null;
  }
}

async function startBropServer(context: vscode.ExtensionContext) {
  if (bropProcess) return;

  const scriptPath = path.join(context.extensionPath, '..', 'bridge', 'mcp-server.js');
  const node = process.execPath || 'node';

  if (bropOutputChannel) bropOutputChannel.appendLine(`Starting BROP MCP server: ${node} ${scriptPath}`);

  bropProcess = spawn(node, [scriptPath], {
    cwd: path.join(context.extensionPath, '..'),
    env: process.env,
  });

  bropProcess.stdout.on('data', (chunk: Buffer) => {
    const txt = chunk.toString();
    if (bropOutputChannel) bropOutputChannel.appendLine(`[BROP STDOUT] ${txt}`);
  });

  bropProcess.stderr.on('data', (chunk: Buffer) => {
    const txt = chunk.toString();
    if (bropOutputChannel) bropOutputChannel.appendLine(`[BROP STDERR] ${txt}`);

    // Detect a likely ready message
    if (!bropStarted && /BROP MCP Server running|MCP Server initialized|Bridge servers started successfully|running on stdio/i.test(txt)) {
      bropStarted = true;
      vscode.window.showInformationMessage('Local BROP MCP server started');
    }
  });

  bropProcess.on('exit', (code, signal) => {
    if (bropOutputChannel) bropOutputChannel.appendLine(`BROP process exited: code=${code} signal=${signal}`);
    bropProcess = null;
    bropStarted = false;
  });

  bropProcess.on('error', (err) => {
    if (bropOutputChannel) bropOutputChannel.appendLine(`BROP process error: ${err.message}`);
    bropProcess = null;
    bropStarted = false;
    throw err;
  });

  // Give it a short period to start; continue regardless
  // Wait up to 10s for a ready message
  const startPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (bropStarted) resolve();
      else {
        // still consider started but warn
        vscode.window.showWarningMessage('BROP MCP server did not signal ready within timeout, check output channel for details');
        resolve();
      }
    }, 10000);

    if (bropStarted) {
      clearTimeout(timeout);
      resolve();
    }
  });

  return startPromise;
}

function getTools(): BropTool[] {
  return tools.slice();
}

function runTool(id: string) {
  const tool = tools.find(t => t.id === id);
  if (!tool) {
    vscode.window.showErrorMessage(`Tool not found: ${id}`);
    return;
  }
  // For now just log and show a message — implementations can be added.
  console.log(`Executing BROP tool: ${id}`);
}

function registerTool(tool: BropTool) {
  if (tools.some(t => t.id === tool.id)) {
    throw new Error(`Tool with id ${tool.id} already registered`);
  }
  tools.push(tool);
}

function getWebviewContent(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
  const nonce = getNonce();
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.file(
    path.join(context.extensionPath, 'out', 'webview.js')
  ));

  // The webview JS is minimal — we'll also include inline script to avoid additional build for now.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BROP MCP Tools</title>
</head>
<body>
  <h2>BROP MCP Tools</h2>
  <div id="tools">Loading...</div>
  <div id="status" style="margin-top:12px;color:#333"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function renderTools(items) {
      const container = document.getElementById('tools');
      container.innerHTML = '';
      items.forEach(it => {
        const row = document.createElement('div');
        row.style.padding = '8px 0';
        row.innerHTML = '<b>' + it.title + '</b><div style="color:#666">' + (it.description || '') + '</div>';
        const btn = document.createElement('button');
        btn.textContent = 'Run';
        btn.style.marginLeft = '8px';
        btn.onclick = () => vscode.postMessage({ command: 'runTool', toolId: it.id });
        row.appendChild(btn);
        container.appendChild(row);
      });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'tools') {
        renderTools(msg.tools);
      } else if (msg.command === 'running') {
        const status = document.getElementById('status');
        status.textContent = 'Running ' + msg.toolId + '...';
      } else if (msg.command === 'runResult') {
        const status = document.getElementById('status');
        status.textContent = 'Result for ' + msg.toolId + ': ' + (JSON.stringify(msg.result) || '').slice(0,200);
      } else if (msg.command === 'runError') {
        const status = document.getElementById('status');
        status.textContent = 'Error running ' + msg.toolId + ': ' + msg.error;
      }
    });

    // request tools
    vscode.postMessage({ command: 'getTools' });
  </script>
</body>
</html>`;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 16; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
