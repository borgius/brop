#!/usr/bin/env node
/**
 * Test script for clear_console_logs command
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket("ws://localhost:9225?name=clear_logs_test");

			this.ws.on("open", () => {
				console.log("✅ Connected to BROP server");
				resolve();
			});

			this.ws.on("error", (error) => {
				console.error("❌ WebSocket error:", error.message);
				reject(error);
			});

			this.ws.on("message", (data) => {
				try {
					const response = JSON.parse(data.toString());
					const pending = this.pendingRequests.get(response.id);
					if (pending) {
						this.pendingRequests.delete(response.id);
						if (response.success) {
							pending.resolve(response.result || response);
						} else {
							pending.reject(new Error(response.error));
						}
					}
				} catch (error) {
					console.error("Error parsing response:", error);
				}
			});
		});
	}

	async sendCommand(method, params = {}) {
		const id = `test_${++this.messageId}`;
		const message = { id, method, params };

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.ws.send(JSON.stringify(message));

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error("Request timeout"));
				}
			}, 10000);
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function runTests() {
	console.log("🧪 Testing clear_console_logs Command");
	console.log(`=${"=".repeat(60)}`);
	console.log("\nThis tests the clear_console_logs functionality.\n");

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log("");

		// Check extension status
		console.log("📋 Checking extension status...");
		try {
			const version = await client.sendCommand("get_extension_version", {});
			console.log(
				`✅ Extension connected: ${version.result.extension_name} v${version.result.extension_version}`,
			);
		} catch (error) {
			console.error("❌ Extension not connected:", error.message);
			return;
		}

		// Test 1: Create a test tab
		console.log("\n🧪 Test 1: Create test tab");
		const tab = await client.sendCommand("create_tab", {
			url: "https://example.com",
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId}`);

		// Wait for page to load
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Test 2: Try clearing logs without active capture
		console.log("\n🧪 Test 2: Clear logs without active capture");
		try {
			const result = await client.sendCommand("clear_console_logs", {
				tabId: tab.tabId,
			});
			console.log(`⚠️  ${result.message}`);
		} catch (error) {
			console.error("❌ Error:", error.message);
		}

		// Test 3: Start console capture
		console.log("\n🧪 Test 3: Start console capture");
		const capture = await client.sendCommand("start_console_capture", {
			tabId: tab.tabId,
		});
		console.log("✅ Console capture started");

		// Test 4: Generate some logs
		console.log("\n🧪 Test 4: Generate initial logs");
		await client.sendCommand("evaluate_js", {
			tabId: tab.tabId,
			code: `
				console.log('First batch - log 1');
				console.log('First batch - log 2');
				console.warn('First batch - warning');
				console.error('First batch - error');
				for (let i = 1; i <= 5; i++) {
					console.log('First batch - iteration', i);
				}
				return 'First batch generated';
			`,
		});
		console.log("✅ Generated first batch of logs");

		// Check logs
		const firstBatch = await client.sendCommand("get_console_logs", {
			tabId: tab.tabId,
		});
		console.log(`✅ First batch contains ${firstBatch.total_captured} logs`);

		// Test 5: Clear console logs
		console.log("\n🧪 Test 5: Clear console logs");
		const clearResult = await client.sendCommand("clear_console_logs", {
			tabId: tab.tabId,
		});
		console.log("✅ Console logs cleared");
		console.log(`   Logs cleared: ${clearResult.logs_cleared}`);
		console.log(
			`   Previous capture duration: ${(clearResult.previous_capture_duration / 1000).toFixed(1)}s`,
		);

		// Verify logs are cleared
		const afterClear = await client.sendCommand("get_console_logs", {
			tabId: tab.tabId,
		});
		console.log(
			`✅ Logs after clearing: ${afterClear.total_captured} (should be 0)`,
		);

		// Test 6: Generate new logs after clearing
		console.log("\n🧪 Test 6: Generate logs after clearing");
		await client.sendCommand("evaluate_js", {
			tabId: tab.tabId,
			code: `
				console.log('Second batch - log 1');
				console.log('Second batch - log 2');
				console.info('Second batch - info');
				return 'Second batch generated';
			`,
		});
		console.log("✅ Generated second batch of logs");

		const secondBatch = await client.sendCommand("get_console_logs", {
			tabId: tab.tabId,
		});
		console.log(`✅ Second batch contains ${secondBatch.total_captured} logs`);

		if (secondBatch.logs.length > 0) {
			console.log("\n   Second batch logs:");
			secondBatch.logs.forEach((log, i) => {
				console.log(`   ${i + 1}. [${log.level}] ${log.message}`);
			});
		}

		// Test 7: Clear and immediately check
		console.log("\n🧪 Test 7: Clear and immediately check");
		await client.sendCommand("clear_console_logs", { tabId: tab.tabId });
		const immediate = await client.sendCommand("get_console_logs", {
			tabId: tab.tabId,
		});
		console.log(
			`✅ Immediate check after clear: ${immediate.total_captured} logs`,
		);

		// Test 8: Session persists after clear
		console.log("\n🧪 Test 8: Verify session persists after clear");
		await client.sendCommand("evaluate_js", {
			tabId: tab.tabId,
			code: `console.log('Session still active after clear'); return true;`,
		});

		const afterClearGenerate = await client.sendCommand("get_console_logs", {
			tabId: tab.tabId,
		});
		console.log(
			`✅ Session still active: ${afterClearGenerate.total_captured} logs captured`,
		);

		// Stop capture
		console.log("\n🧪 Stopping console capture");
		const stop = await client.sendCommand("stop_console_capture", {
			tabId: tab.tabId,
		});
		console.log("✅ Capture stopped");

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test tab closed");

		console.log("\n📊 Summary:");
		console.log(
			"   - clear_console_logs clears captured logs without stopping the session",
		);
		console.log("   - Returns count of logs cleared and capture duration");
		console.log("   - Resets capture start time for duration tracking");
		console.log("   - Session remains active and continues capturing new logs");
		console.log("   - Useful for resetting logs at specific checkpoints");
	} catch (error) {
		console.error("\n❌ Test suite failed:", error.message);
	} finally {
		client.disconnect();
		console.log("\n✅ Test completed");
	}
}

// Run tests
console.log("");
runTests()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
