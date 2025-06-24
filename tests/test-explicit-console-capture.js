#!/usr/bin/env node
/**
 * Test script for explicit console capture commands
 * - start_console_capture: Start collecting logs
 * - get_console_logs: Get collected logs
 * - stop_console_capture: Stop collection
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
			this.ws = new WebSocket("ws://localhost:9225?name=explicit_console_test");

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
	console.log("🧪 Testing Explicit Console Capture");
	console.log(`=${"=".repeat(60)}`);
	console.log("\nThis tests the explicit console capture workflow.\n");

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
		console.log("📋 Creating test tab...");

		const tab = await client.sendCommand("create_tab", {
			url: "https://example.com",
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId}`);

		// Wait for page to load
		console.log("⏳ Waiting for page to load...");
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Test 2: Try getting logs without starting capture
		console.log("\n🧪 Test 2: Get logs without active capture");
		try {
			const result = await client.sendCommand("get_console_logs", {
				tabId: tab.tabId,
			});
			console.log(`⚠️  No active session: ${result.message}`);
			console.log(`   Logs returned: ${result.logs.length}`);
		} catch (error) {
			console.error("❌ Error:", error.message);
		}

		// Test 3: Start console capture
		console.log("\n🧪 Test 3: Start console capture");
		try {
			const result = await client.sendCommand("start_console_capture", {
				tabId: tab.tabId,
			});
			console.log("✅ Console capture started");
			console.log(`   Tab: ${result.tab_title} (${result.tab_url})`);
			console.log(
				`   Started at: ${new Date(result.capture_started).toLocaleTimeString()}`,
			);
		} catch (error) {
			console.error("❌ Failed to start capture:", error.message);
			await client.sendCommand("close_tab", { tabId: tab.tabId });
			return;
		}

		// Test 4: Generate console logs
		console.log("\n🧪 Test 4: Generate console logs");
		try {
			// Use evaluate_js to generate various console logs
			await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: `
					console.log('Test log message 1');
					console.warn('Test warning message');
					console.error('Test error message');
					console.info('Test info message');
					console.debug('Test debug message');
					
					// Log with objects
					console.log('Object test:', { key: 'value', number: 123 });
					console.log('Array test:', [1, 2, 3, 'four']);
					
					// Log with multiple arguments
					console.log('Multiple', 'arguments', 'test', 123, true);
					
					// Generate some logs in a loop
					for (let i = 0; i < 5; i++) {
						console.log('Loop iteration', i);
					}
					
					return 'Logs generated';
				`,
			});
			console.log("✅ Generated test logs");
		} catch (error) {
			console.error("❌ Failed to generate logs:", error.message);
		}

		// Wait a bit for logs to be captured
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Test 5: Get captured logs
		console.log("\n🧪 Test 5: Get captured logs");
		try {
			const result = await client.sendCommand("get_console_logs", {
				tabId: tab.tabId,
				limit: 20,
			});
			console.log(`✅ Retrieved ${result.total_captured} logs`);
			console.log(`   Source: ${result.source}`);
			console.log(`   Total in session: ${result.total_in_session}`);
			console.log(`   Capture duration: ${result.capture_duration}ms`);

			if (result.logs.length > 0) {
				console.log("\n   Captured logs:");
				result.logs.forEach((log, i) => {
					console.log(`   ${i + 1}. [${log.level}] ${log.message}`);
				});
			}
		} catch (error) {
			console.error("❌ Failed to get logs:", error.message);
		}

		// Test 6: Filter logs by level
		console.log("\n🧪 Test 6: Filter logs by level");
		const levels = ["log", "warn", "error", "info"];

		for (const level of levels) {
			try {
				const result = await client.sendCommand("get_console_logs", {
					tabId: tab.tabId,
					level: level,
				});
				console.log(`✅ [${level}] logs: ${result.total_captured} entries`);
			} catch (error) {
				console.error(`❌ Failed to get ${level} logs:`, error.message);
			}
		}

		// Test 7: Navigate to a new page (should clear logs)
		console.log("\n🧪 Test 7: Navigate to new page");
		console.log("📋 Navigating to Wikipedia...");

		await client.sendCommand("navigate", {
			tabId: tab.tabId,
			url: "https://www.wikipedia.org",
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Check if logs were cleared
		try {
			const result = await client.sendCommand("get_console_logs", {
				tabId: tab.tabId,
			});
			console.log(
				`✅ Logs after navigation: ${result.total_captured} (should be 0 or very few)`,
			);
		} catch (error) {
			console.error("❌ Failed to check logs after navigation:", error.message);
		}

		// Generate new logs on Wikipedia
		try {
			await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: `
					console.log('Wikipedia page loaded');
					console.log('Page title:', document.title);
					console.log('Links found:', document.querySelectorAll('a').length);
					return 'Wikipedia logs generated';
				`,
			});

			await new Promise((resolve) => setTimeout(resolve, 500));

			const result = await client.sendCommand("get_console_logs", {
				tabId: tab.tabId,
			});
			console.log(`✅ New logs captured: ${result.total_captured}`);

			if (result.logs.length > 0) {
				console.log("   Recent Wikipedia logs:");
				result.logs.slice(-3).forEach((log, i) => {
					console.log(`   ${i + 1}. [${log.level}] ${log.message}`);
				});
			}
		} catch (error) {
			console.error("❌ Failed to generate Wikipedia logs:", error.message);
		}

		// Test 8: Stop console capture
		console.log("\n🧪 Test 8: Stop console capture");
		try {
			const result = await client.sendCommand("stop_console_capture", {
				tabId: tab.tabId,
			});
			console.log("✅ Console capture stopped");
			console.log(`   Total logs captured: ${result.logs_captured}`);
			console.log(
				`   Capture duration: ${(result.capture_duration / 1000).toFixed(1)}s`,
			);
		} catch (error) {
			console.error("❌ Failed to stop capture:", error.message);
		}

		// Test 9: Try getting logs after stopping capture
		console.log("\n🧪 Test 9: Get logs after stopping capture");
		try {
			const result = await client.sendCommand("get_console_logs", {
				tabId: tab.tabId,
			});
			console.log(`⚠️  ${result.message}`);
			console.log(`   Logs returned: ${result.logs.length}`);
		} catch (error) {
			console.error("❌ Error:", error.message);
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test tab closed");

		console.log("\n📊 Summary:");
		console.log(
			"   - start_console_capture: Starts debugger-based log collection",
		);
		console.log(
			"   - get_console_logs: Returns logs collected since capture started",
		);
		console.log(
			"   - stop_console_capture: Stops collection and detaches debugger",
		);
		console.log("   - Logs are cleared on page navigation");
		console.log("   - Session persists until explicitly stopped");
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
