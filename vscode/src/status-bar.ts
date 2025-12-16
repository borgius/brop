import * as vscode from 'vscode';
import { getBropStatus, startBropServer, stopBropServer } from './extension';

let statusBarItem: vscode.StatusBarItem | null = null;

export function createStatusBar(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'brop.toggleServer';
  context.subscriptions.push(statusBarItem);
  updateStatusBar();
  statusBarItem.show();
}

export function updateStatusBar() {
  if (!statusBarItem) return;
  const s = getBropStatus();
  if (s.started) {
    statusBarItem.text = `$(server) BROP: running`; 
    statusBarItem.tooltip = `BROP server running (pid: ${s.pid}) — click to stop`;
  } else {
    statusBarItem.text = `$(server) BROP: stopped`;
    statusBarItem.tooltip = `BROP server stopped — click to start`;
  }
}
