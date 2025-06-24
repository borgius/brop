#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
	console.log(
		"Usage: cdp-traffic-analyzer <native-dump.jsonl> <bridge-dump.jsonl> [output.html]",
	);
	console.log("\nExample:");
	console.log(
		"  cdp-traffic-analyzer cdp_dump_native.jsonl cdp_dump_bridge.jsonl comparison.html",
	);
	process.exit(1);
}

const [nativeFile, bridgeFile, outputFile = "cdp-comparison.html"] = args;

// Validate input files
if (!existsSync(nativeFile)) {
	console.error(`Error: Native dump file not found: ${nativeFile}`);
	process.exit(1);
}

if (!existsSync(bridgeFile)) {
	console.error(`Error: Bridge dump file not found: ${bridgeFile}`);
	process.exit(1);
}

console.log("CDP Traffic Analyzer");
console.log("===================");
console.log(`Native dump: ${nativeFile}`);
console.log(`Bridge dump: ${bridgeFile}`);
console.log(`Output file: ${outputFile}\n`);

// Read and parse dump files
function readDumpFile(filename) {
	try {
		const content = readFileSync(filename, "utf-8");
		const lines = content.split("\n").filter((l) => l.trim());
		return lines
			.map((line, idx) => {
				try {
					return JSON.parse(line);
				} catch (e) {
					console.error(
						`Error parsing line ${idx + 1} in ${filename}: ${e.message}`,
					);
					return null;
				}
			})
			.filter((msg) => msg !== null);
	} catch (e) {
		console.error(`Error reading ${filename}: ${e.message}`);
		return [];
	}
}

const nativeMessages = readDumpFile(nativeFile);
const bridgeMessages = readDumpFile(bridgeFile);

console.log(`Loaded ${nativeMessages.length} native messages`);
console.log(`Loaded ${bridgeMessages.length} bridge messages`);

// Analyze messages
function analyzeMessages(messages) {
	const analysis = {
		total: messages.length,
		byDirection: { clientToServer: 0, serverToClient: 0 },
		methods: new Map(),
		errors: [],
		sessionIds: new Set(),
		timing: { first: null, last: null, duration: 0 },
	};

	messages.forEach((msg, idx) => {
		// Direction
		if (msg.direction === "client_to_server") {
			analysis.byDirection.clientToServer++;
		} else {
			analysis.byDirection.serverToClient++;
		}

		// Methods
		if (msg.cdp_data?.method) {
			const method = msg.cdp_data.method;
			analysis.methods.set(method, (analysis.methods.get(method) || 0) + 1);
		}

		// Errors
		if (msg.cdp_data?.error) {
			analysis.errors.push({
				index: idx,
				id: msg.cdp_data.id,
				error: msg.cdp_data.error,
			});
		}

		// Sessions
		if (msg.cdp_data?.sessionId) {
			analysis.sessionIds.add(msg.cdp_data.sessionId);
		}

		// Timing
		const timestamp = new Date(msg.timestamp);
		if (!analysis.timing.first || timestamp < analysis.timing.first) {
			analysis.timing.first = timestamp;
		}
		if (!analysis.timing.last || timestamp > analysis.timing.last) {
			analysis.timing.last = timestamp;
		}
	});

	if (analysis.timing.first && analysis.timing.last) {
		analysis.timing.duration =
			(analysis.timing.last - analysis.timing.first) / 1000;
	}

	return analysis;
}

const nativeAnalysis = analyzeMessages(nativeMessages);
const bridgeAnalysis = analyzeMessages(bridgeMessages);

// Find divergences
function findDivergences() {
	const divergences = [];
	const maxLen = Math.min(nativeMessages.length, bridgeMessages.length);

	for (let i = 0; i < maxLen; i++) {
		const n = nativeMessages[i];
		const b = bridgeMessages[i];

		const nData = n.cdp_data;
		const bData = b.cdp_data;

		// Compare methods
		if (nData.method !== bData.method) {
			divergences.push({
				index: i,
				type: "method_mismatch",
				native: { method: nData.method },
				bridge: { method: bData.method },
			});
		}

		// Compare results
		if (nData.result && bData.result) {
			const nResult = JSON.stringify(nData.result);
			const bResult = JSON.stringify(bData.result);
			if (nResult !== bResult) {
				divergences.push({
					index: i,
					type: "result_mismatch",
					native: nData,
					bridge: bData,
				});
			}
		}

		// Check for missing responses
		if ((nData.result && !bData.result) || (!nData.result && bData.result)) {
			divergences.push({
				index: i,
				type: "response_mismatch",
				native: nData,
				bridge: bData,
			});
		}
	}

	return divergences;
}

const divergences = findDivergences();

// Helper function to generate message HTML
function generateMessageHTML(msg, idx, source, isDivergent) {
	const isRequest = msg.direction === "client_to_server";
	const cdpData = msg.cdp_data;
	const summary =
		cdpData.method ||
		(cdpData.result
			? `Response #${cdpData.id}`
			: cdpData.error
				? `Error #${cdpData.id}`
				: "Event");

	return `
    <div class="message-item ${isDivergent ? "divergence-marker" : ""}" data-index="${idx}" data-${source}="true">
        <div class="message-header" onclick="toggleMessage('${source}', ${idx})">
            <div class="message-index">#${idx + 1}</div>
            <div class="message-time">${new Date(msg.timestamp).toISOString().split("T")[1].substring(0, 12)}</div>
            <div class="message-direction ${isRequest ? "client-to-server" : "server-to-client"}">
                ${isRequest ? "→" : "←"}
            </div>
            <div class="message-summary">${summary}</div>
            <div class="expand-icon">▶</div>
        </div>
        <div class="message-content">
            <div class="json-content">${JSON.stringify(cdpData, null, 2)}</div>
        </div>
    </div>
  `;
}

// Generate HTML report
const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CDP Traffic Analysis: ${basename(nativeFile)} vs ${basename(bridgeFile)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1800px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 10px;
        }
        .subtitle {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 30px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-panel {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-panel h2 {
            margin: 0 0 15px 0;
            color: #2c3e50;
            font-size: 18px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 8px;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .stat-label {
            color: #666;
            font-size: 14px;
        }
        .stat-value {
            font-weight: 600;
            color: #2c3e50;
        }
        .timeline-container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .timeline-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #3498db;
        }
        .filter-controls {
            display: flex;
            gap: 10px;
        }
        .filter-button {
            padding: 6px 12px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }
        .filter-button:hover {
            background: #f8f9fa;
        }
        .filter-button.active {
            background: #3498db;
            color: white;
            border-color: #3498db;
        }
        .search-box {
            padding: 6px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            width: 200px;
        }
        .timeline-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .timeline-column {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
        }
        .timeline-column-header {
            background: #f8f9fa;
            padding: 12px 15px;
            font-weight: 600;
            border-bottom: 2px solid #e0e0e0;
        }
        .native-header {
            color: #1976d2;
            background: #e3f2fd;
        }
        .bridge-header {
            color: #388e3c;
            background: #e8f5e9;
        }
        .messages-container {
            max-height: 600px;
            overflow-y: auto;
        }
        .message-item {
            border-bottom: 1px solid #eee;
            transition: all 0.2s;
        }
        .message-item:hover {
            background: #f8f9fa;
        }
        .message-item.expanded {
            background: #f0f7ff;
        }
        .message-header {
            display: flex;
            align-items: center;
            padding: 10px 15px;
            cursor: pointer;
            user-select: none;
        }
        .message-index {
            width: 40px;
            font-size: 12px;
            color: #999;
            font-family: monospace;
        }
        .message-time {
            width: 90px;
            font-size: 11px;
            color: #666;
            font-family: monospace;
        }
        .message-direction {
            width: 30px;
            text-align: center;
            font-size: 16px;
        }
        .client-to-server {
            color: #3498db;
        }
        .server-to-client {
            color: #2ecc71;
        }
        .message-summary {
            flex: 1;
            font-family: monospace;
            font-size: 13px;
            color: #333;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .expand-icon {
            width: 20px;
            font-size: 12px;
            color: #666;
            transition: transform 0.2s;
        }
        .message-item.expanded .expand-icon {
            transform: rotate(90deg);
        }
        .message-content {
            display: none;
            padding: 0 15px 15px 15px;
            background: #f8f9fa;
        }
        .message-item.expanded .message-content {
            display: block;
        }
        .json-content {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 12px;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 11px;
            overflow-x: auto;
            white-space: pre;
            max-height: 300px;
            overflow-y: auto;
        }
        .empty-message {
            padding: 40px;
            text-align: center;
            color: #999;
            font-style: italic;
        }
        .divergence-marker {
            background: #fee;
            border-left: 3px solid #f44;
        }
        .stats-summary {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            margin-top: 30px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>CDP Traffic Analysis</h1>
        <div class="subtitle">${basename(nativeFile)} vs ${basename(bridgeFile)}</div>
        
        <div class="summary-grid">
            <div class="summary-panel">
                <h2>Native Chrome</h2>
                <div class="stat-row">
                    <span class="stat-label">Total Messages</span>
                    <span class="stat-value">${nativeAnalysis.total}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Duration</span>
                    <span class="stat-value">${nativeAnalysis.timing.duration.toFixed(3)}s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Client → Server</span>
                    <span class="stat-value">${nativeAnalysis.byDirection.clientToServer}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Server → Client</span>
                    <span class="stat-value">${nativeAnalysis.byDirection.serverToClient}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Unique Methods</span>
                    <span class="stat-value">${nativeAnalysis.methods.size}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Sessions</span>
                    <span class="stat-value">${nativeAnalysis.sessionIds.size}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Errors</span>
                    <span class="stat-value ${nativeAnalysis.errors.length > 0 ? "error" : ""}">${nativeAnalysis.errors.length}</span>
                </div>
            </div>
            
            <div class="summary-panel">
                <h2>Bridge Server</h2>
                <div class="stat-row">
                    <span class="stat-label">Total Messages</span>
                    <span class="stat-value">${bridgeAnalysis.total}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Duration</span>
                    <span class="stat-value">${bridgeAnalysis.timing.duration.toFixed(3)}s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Client → Server</span>
                    <span class="stat-value">${bridgeAnalysis.byDirection.clientToServer}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Server → Client</span>
                    <span class="stat-value">${bridgeAnalysis.byDirection.serverToClient}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Unique Methods</span>
                    <span class="stat-value">${bridgeAnalysis.methods.size}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Sessions</span>
                    <span class="stat-value">${bridgeAnalysis.sessionIds.size}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Errors</span>
                    <span class="stat-value ${bridgeAnalysis.errors.length > 0 ? "error" : ""}">${bridgeAnalysis.errors.length}</span>
                </div>
            </div>
        </div>
        
        <div class="timeline-container">
            <div class="timeline-header">
                <h2 style="margin: 0;">Side-by-Side Message Timeline</h2>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <div class="filter-controls">
                        <button class="filter-button active" onclick="setViewMode('all')">All</button>
                        <button class="filter-button" onclick="setViewMode('divergences')">Divergences</button>
                    </div>
                    <input type="text" class="search-box" placeholder="Search messages..." onkeyup="searchMessages(this.value)">
                </div>
            </div>
            
            <div class="timeline-grid">
                <div class="timeline-column">
                    <div class="timeline-column-header native-header">Native Chrome</div>
                    <div class="messages-container" id="native-messages">
                        ${
													nativeMessages.length === 0
														? '<div class="empty-message">No messages captured</div>'
														: nativeMessages
																.map((msg, idx) => {
																	const isDivergent = divergences.some(
																		(d) => d.index === idx,
																	);
																	return generateMessageHTML(
																		msg,
																		idx,
																		"native",
																		isDivergent,
																	);
																})
																.join("")
												}
                    </div>
                </div>
                
                <div class="timeline-column">
                    <div class="timeline-column-header bridge-header">Bridge Server</div>
                    <div class="messages-container" id="bridge-messages">
                        ${
													bridgeMessages.length === 0
														? '<div class="empty-message">No messages captured</div>'
														: bridgeMessages
																.map((msg, idx) => {
																	const isDivergent = divergences.some(
																		(d) => d.index === idx,
																	);
																	return generateMessageHTML(
																		msg,
																		idx,
																		"bridge",
																		isDivergent,
																	);
																})
																.join("")
												}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="stats-summary">
            ${
							divergences.length > 0
								? `<strong>Found ${divergences.length} divergences</strong> in the first ${Math.min(nativeMessages.length, bridgeMessages.length)} messages`
								: "No divergences found in compared messages"
						}
        </div>
    </div>
    
    <script>
        let currentViewMode = 'all';
        
        function toggleMessage(source, index) {
            const selector = '[data-index="' + index + '"][data-' + source + '="true"]';
            const item = document.querySelector(selector);
            if (item) {
                item.classList.toggle('expanded');
            }
        }
        
        function setViewMode(mode) {
            currentViewMode = mode;
            
            // Update button states
            document.querySelectorAll('.filter-button').forEach(btn => {
                btn.classList.remove('active');
                if (btn.textContent.toLowerCase() === mode) {
                    btn.classList.add('active');
                }
            });
            
            // Filter messages
            const allMessages = document.querySelectorAll('.message-item');
            allMessages.forEach(msg => {
                if (mode === 'all') {
                    msg.style.display = 'block';
                } else if (mode === 'divergences') {
                    msg.style.display = msg.classList.contains('divergence-marker') ? 'block' : 'none';
                }
            });
        }
        
        function searchMessages(query) {
            const messages = document.querySelectorAll('.message-item');
            const lowerQuery = query.toLowerCase();
            
            messages.forEach(msg => {
                const content = msg.textContent.toLowerCase();
                const matchesSearch = content.includes(lowerQuery);
                const matchesFilter = currentViewMode === 'all' || 
                                    (currentViewMode === 'divergences' && msg.classList.contains('divergence-marker'));
                
                msg.style.display = matchesSearch && matchesFilter ? 'block' : 'none';
            });
        }
        
        // Sync scrolling
        const nativeContainer = document.getElementById('native-messages');
        const bridgeContainer = document.getElementById('bridge-messages');
        
        let syncScrolling = true;
        
        nativeContainer.addEventListener('scroll', () => {
            if (syncScrolling) {
                syncScrolling = false;
                bridgeContainer.scrollTop = nativeContainer.scrollTop;
                setTimeout(() => syncScrolling = true, 10);
            }
        });
        
        bridgeContainer.addEventListener('scroll', () => {
            if (syncScrolling) {
                syncScrolling = false;
                nativeContainer.scrollTop = bridgeContainer.scrollTop;
                setTimeout(() => syncScrolling = true, 10);
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'e' && (e.ctrlKey || e.metaKey)) {
                document.querySelectorAll('.message-item').forEach(item => {
                    item.classList.add('expanded');
                });
                e.preventDefault();
            } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
                document.querySelectorAll('.message-item').forEach(item => {
                    item.classList.remove('expanded');
                });
                e.preventDefault();
            }
        });
    </script>
</body>
</html>`;

// Write output file
writeFileSync(outputFile, html);

console.log("\n✅ Analysis complete!");
console.log(`📄 Report saved to: ${outputFile}`);
console.log("\n📊 Summary:");
console.log(
	`   Native: ${nativeAnalysis.total} messages over ${nativeAnalysis.timing.duration.toFixed(3)}s`,
);
console.log(
	`   Bridge: ${bridgeAnalysis.total} messages over ${bridgeAnalysis.timing.duration.toFixed(3)}s`,
);
console.log(`   Divergences: ${divergences.length}`);

// Output method comparison
const nativeMethods = Array.from(nativeAnalysis.methods.keys());
const bridgeMethods = Array.from(bridgeAnalysis.methods.keys());
const missingInBridge = nativeMethods.filter((m) => !bridgeMethods.includes(m));

if (missingInBridge.length > 0) {
	console.log("\n⚠️  Methods missing in Bridge:");
	for (const m of missingInBridge) {
		console.log(`   - ${m}`);
	}
}

console.log(`\nView the report by opening: ${outputFile}`);
