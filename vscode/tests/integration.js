#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('Integration test: start MCP server and run a few commands');

  const serverPath = path.resolve(__dirname, '..', '..', 'bridge', 'mcp-server.js');
  const node = process.execPath;

  // Start server from repository root
  // Quick check whether server deps are present. If not, skip test to avoid long CI failures.
  try {
    require.resolve('@modelcontextprotocol/sdk');
  } catch (err) {
    console.warn('Server dependencies not installed in repo root; skipping integration test.');
    process.exit(0);
  }

  const proc = spawn(node, [serverPath], { cwd: path.resolve(__dirname, '..', '..') });

  proc.stdout.on('data', (d) => process.stdout.write(`[BROP-OUT] ${d.toString()}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[BROP-ERR] ${d.toString()}`));

  let ready = false;

  proc.stderr.on('data', (d) => {
    const txt = d.toString();
    if (/BROP MCP Server running|MCP Server initialized|running on stdio/i.test(txt)) ready = true;
  });

  // Wait up to 30s for ready
  for (let i=0;i<60;i++) {
    if (ready) break;
    await sleep(500);
  }

  if (!ready) {
    console.warn('Server did not signal ready; continuing to attempt connection');
  }

  const url = 'ws://localhost:9225';
  const ws = new WebSocket(url);

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('ws open timeout')), 10000);
    ws.on('open', () => { clearTimeout(to); resolve(); });
    ws.on('error', (e) => reject(e));
  }).catch(async (err) => { proc.kill(); throw err; });

  console.log('Connected to BROP server, sending list_tabs');
  const id = Date.now();
  ws.send(JSON.stringify({ id, method: 'list_tabs', params: {} }));

  const res = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('no response to list_tabs')), 10000);
    ws.on('message', (d) => {
      try {
        const msg = JSON.parse(d.toString());
        if (msg.id === id) {
          clearTimeout(to);
          resolve(msg);
        }
      } catch (e) {}
    });
  });

  console.log('list_tabs response:', res.success ? 'SUCCESS' : ('FAIL: '+JSON.stringify(res.error)));

  // test simple navigate command (just ensure server accepts command)
  const id2 = Date.now()+1;
  ws.send(JSON.stringify({ id: id2, method: 'brop_navigate' , params: { url: 'about:blank' } }));

  const res2 = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('no response to navigate')), 10000);
    ws.on('message', (d) => {
      try {
        const msg = JSON.parse(d.toString());
        if (msg.id === id2) {
          clearTimeout(to);
          resolve(msg);
        }
      } catch (e) {}
    });
  });

  console.log('navigate response:', res2.success ? 'SUCCESS' : ('FAIL: '+JSON.stringify(res2.error)));

  ws.close();
  proc.kill();

  if (!res.success) process.exit(2);
  console.log('Integration test passed');
  process.exit(0);
})().catch((err) => {
  console.error('Integration test failed:', err && err.message || err);
  process.exit(1);
});