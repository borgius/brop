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

    // track current panel to send status updates
    currentPanel = panel;

    panel.webview.html = getWebviewContent(context, panel);

    const statusInterval = setInterval(() => {
      try {
        panel.webview.postMessage({ command: 'status', status: getBropStatus() });
      } catch (e) {}
    }, 2000);

    panel.onDidDispose(() => {
      clearInterval(statusInterval);
      if (currentPanel === panel) currentPanel = null;
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'getTools':
          panel.webview.postMessage({ command: 'tools', tools: getTools() });
          break;

        case 'getStatus':
          panel.webview.postMessage({ command: 'status', status: getBropStatus() });
          break;

        case 'runToolWithParams':
          // run with explicit params object from webview
          panel.webview.postMessage({ command: 'running', toolId: message.toolId, params: message.params });
          try {
            const result = await runBropTool(message.toolId, message.params || {});
            panel.webview.postMessage({ command: 'runResult', toolId: message.toolId, result });
            const out = JSON.stringify(result, null, 2).slice(0, 2000);
            vscode.window.showInformationMessage(`Tool ${message.toolId} result: ${out}`);
          } catch (err: any) {
            panel.webview.postMessage({ command: 'runError', toolId: message.toolId, error: err.message });
            vscode.window.showErrorMessage(`Tool ${message.toolId} failed: ${err.message}`);
          }
          break;

        case 'runTool':
          // Fallback: Ask the user for params as JSON and run the selected tool
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

  const toggleCmd = vscode.commands.registerCommand('brop.toggleServer', async () => {
    if (bropStarted) {
      await stopBropServer();
      vscode.window.showInformationMessage('BROP MCP server stopped');
    } else {
      await startBropServer(context);
      vscode.window.showInformationMessage('BROP MCP server starting');
    }
    try { sb.updateStatusBar(); } catch (e) { /* ignore */ }
  });
  context.subscriptions.push(toggleCmd);

  // Export a small API that other extensions can call.
  const api = {
    getTools,
    runTool,
    registerTool,
    startBropServer,
    stopBropServer,
    getBropStatus,
  };

  // Create status bar item
  // Lazy import status bar module to avoid cycles
  const sb = require('./status-bar');
  sb.createStatusBar(context);
  // Update periodically
  const statusInterval = setInterval(() => sb.updateStatusBar(), 2000);
  context.subscriptions.push({ dispose: () => clearInterval(statusInterval) });

  return api;
}

async function runBropTool(toolId: string, params: any) {
  const { getMethodForTool } = require('./tool-mapping');
  const method = getMethodForTool(toolId);
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

export async function stopBropServer() {
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

export async function startBropServer(context: vscode.ExtensionContext | null = null) {
  if (bropProcess) return;

  // allow tests to pass a context; otherwise derive from extension path
  const base = context ? context.extensionPath : path.join(__dirname, '..');
  const scriptPath = path.join(base, 'bridge', 'mcp-server.js');
  const node = process.execPath || 'node';

  if (bropOutputChannel) bropOutputChannel.appendLine(`Starting BROP MCP server: ${node} ${scriptPath}`);

  bropProcess = spawn(node, [scriptPath], {
    cwd: path.join(base),
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

    function createParamsForm(toolId) {
      const form = document.createElement('div');
      form.style.marginTop = '6px';

      function addInput(name, placeholder) {
        const input = document.createElement('input');
        input.placeholder = placeholder || name;
        input.style.marginRight = '8px';
        input.dataset.param = name;
        return input;
      }

      // Provide basic forms for common tools; fallback to raw JSON editor
      if (toolId === 'brop_navigate' || toolId === 'cdp_navigate' || toolId === 'brop_create_page') {
        const url = addInput('url', 'https://example.com');
        const err = document.createElement('span'); err.style.color = 'red'; err.style.marginLeft = '8px';
        const run = document.createElement('button');
        run.textContent = 'Run';
        run.disabled = true;
        function validateUrl() {
          try {
            if (!url.value) throw new Error('URL required');
            new URL(url.value);
            err.textContent = '';
            run.disabled = false;
          } catch (e) {
            err.textContent = 'Invalid URL';
            run.disabled = true;
          }
        }
        url.oninput = validateUrl;
        run.onclick = () => {
          const params = {};
          if (url.value) params.url = url.value;
          vscode.postMessage({ command: 'runToolWithParams', toolId, params });
        };
        form.appendChild(url);
        form.appendChild(err);
        form.appendChild(run);
        return form;
      }

      if (toolId === 'brop_click_element' || toolId === 'brop_type_text') {
        const selector = addInput('selector', '#my-element');
        const text = addInput('text', 'text (for type)');
        const err = document.createElement('span'); err.style.color = 'red'; err.style.marginLeft = '8px';
        const run = document.createElement('button');
        run.textContent = 'Run';
        run.disabled = true;
        function validateSelector() {
          if (selector.value && selector.value.trim().length > 0) {
            err.textContent = '';
            if (toolId === 'brop_type_text' && !text.value) {
              run.disabled = true;
              err.textContent = 'Text required for typing';
            } else {
              run.disabled = false;
            }
          } else {
            err.textContent = 'Selector required';
            run.disabled = true;
          }
        }
        selector.oninput = validateSelector;
        text.oninput = validateSelector;
        run.onclick = () => {
          const params: any = { selector: selector.value };
          if (text.value) params.text = text.value;
          vscode.postMessage({ command: 'runToolWithParams', toolId, params });
        };
        form.appendChild(selector);
        form.appendChild(text);
        form.appendChild(err);
        form.appendChild(run);
        return form;
      }

      // Default: JSON input
      const ta = document.createElement('textarea');
      ta.placeholder = '{ "tabId": 1 }';
      ta.cols = 60;
      ta.rows = 4;
      ta.style.display = 'block';
      ta.style.marginTop = '6px';
      const run = document.createElement('button');
      run.textContent = 'Run';
      run.onclick = () => {
        try {
          const params = ta.value ? JSON.parse(ta.value) : {};
          vscode.postMessage({ command: 'runToolWithParams', toolId, params });
        } catch (err) {
          const status = document.getElementById('status');
          status.textContent = 'Invalid JSON in params';
        }
      };
      form.appendChild(ta);
      form.appendChild(run);
      return form;
    }

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
        btn.onclick = () => {
          // toggle params form per row
          if (row.querySelector('.params')) {
            const el = row.querySelector('.params');
            el.remove();
            return;
          }
          const paramsDiv = document.createElement('div');
          paramsDiv.className = 'params';
          paramsDiv.style.marginTop = '6px';
          paramsDiv.appendChild(createParamsForm(it.id));
          row.appendChild(paramsDiv);
        };
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
      } else if (msg.command === 'status') {
        const status = document.getElementById('status');
        status.textContent = 'Server: ' + (msg.status.started ? 'running' : 'stopped') + (msg.status.pid ? ' (pid: ' + msg.status.pid + ')' : '');
      }
    });

    // request tools and status
    vscode.postMessage({ command: 'getTools' });
    vscode.postMessage({ command: 'getStatus' });
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

let currentPanel: vscode.WebviewPanel | null = null;

export function getBropStatus() {
  return {
    started: !!bropStarted,
    pid: bropProcess ? bropProcess.pid : null,
  };
}
