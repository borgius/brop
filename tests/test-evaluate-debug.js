#!/usr/bin/env node
/**
 * Debug test for evaluate_js to understand response structure
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
			this.ws = new WebSocket("ws://localhost:9225?name=evaluate_debug_test");

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

async function runDebugTests() {
	console.log("🧪 Debug Test for evaluate_js");
	console.log("=".repeat(60));

	const client = new BROPTestClient();

	try {
		await client.connect();

		// Create test tab
		const testFilePath = join(
			dirname(__dirname),
			"tests/test-selector-page.html",
		);
		const testFileUrl = `file://${testFilePath}`;

		const tab = await client.sendCommand("create_tab", {
			url: testFileUrl,
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId}\n`);

		// Wait for page to load
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Test 1: Simple expression returning a number
		console.log("\n🧪 Test 1: Simple number expression");
		console.log('Code: "1 + 2"');
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "1 + 2",
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("Error:", error.message);
		}

		// Test 2: Code with return statement
		console.log("\n🧪 Test 2: Code with return statement");
		console.log('Code: "const x = 5; return x * 2;"');
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "const x = 5; return x * 2;",
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("Error:", error.message);
		}

		// Test 2b: Test the exact code from failing test
		console.log("\n🧪 Test 2b: Query inputs with return");
		console.log(
			"Code: \"const inputs = document.querySelectorAll('input'); return inputs.length;\"",
		);
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "const inputs = document.querySelectorAll('input'); return inputs.length;",
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("Error:", error.message);
		}

		// Test 3: DOM query
		console.log("\n🧪 Test 3: DOM query");
		console.log("Code: \"document.querySelectorAll('input').length\"");
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "document.querySelectorAll('input').length",
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("Error:", error.message);
		}

		// Test 4: Arrow function with args
		console.log("\n🧪 Test 4: Arrow function with arguments");
		console.log('Code: "(a, b) => a + b"');
		console.log("Args: [10, 25]");
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "(a, b) => a + b",
				args: [10, 25],
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("Error:", error.message);
		}

		// Test 5: Async function
		console.log("\n🧪 Test 5: Async function");
		console.log(
			"Code: \"async () => { await new Promise(r => setTimeout(r, 1000)); return 'waited 1 second'; }\"",
		);
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "async () => { await new Promise(r => setTimeout(r, 1000)); return 'waited 1 second'; }",
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("Error:", error.message);
		}

		// Test 6: Window object
		console.log("\n🧪 Test 6: Window object (non-serializable)");
		console.log('Code: "window"');
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "window",
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("Error:", error.message);
		}

		// Clean up
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("\n✅ Test completed");
	} catch (error) {
		console.error("\n❌ Test suite failed:", error.message);
	} finally {
		client.disconnect();
	}
}

// Run tests
runDebugTests()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
