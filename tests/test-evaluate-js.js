#!/usr/bin/env node
/**
 * Test script for evaluate_js BROP command
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
			this.ws = new WebSocket("ws://localhost:9225?name=evaluate_js_test");

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

			// Timeout after 60 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error("Request timeout"));
				}
			}, 60000);
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function runTests() {
	console.log("🧪 Testing evaluate_js Command");
	console.log(`=${"=".repeat(60)}`);
	console.log("\nThis command executes JavaScript code in web page context.\n");
	console.log("⚠️  IMPORTANT: Make sure you've reloaded the Chrome extension!");
	console.log("   The evaluate_js method was just implemented.\n");

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

		// Create test tab
		console.log("\n📋 Creating test tab...");
		const testFilePath = join(
			dirname(__dirname),
			"tests/test-selector-page.html",
		);
		const testFileUrl = `file://${testFilePath}`;

		const tab = await client.sendCommand("create_tab", {
			url: testFileUrl,
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId}`);

		// Wait for page to load
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Test 1: Simple expression
		console.log("\n🧪 Test 1: Simple expression");
		console.log('📝 Code: "document.title"');

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "document.title",
			});
			console.log("✅ Expression evaluated");
			console.log(`   Result: "${result.result}"`);
			console.log(`   Type: ${result.type}`);
		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: DOM query
		console.log("\n\n🧪 Test 2: DOM query");
		console.log("📝 Code: \"document.querySelectorAll('a').length\"");

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "document.querySelectorAll('a').length",
			});
			console.log("✅ DOM query executed");
			console.log(`   Number of links: ${result.result}`);
			console.log(`   Type: ${result.type}`);
		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Multiple statements with return
		console.log("\n\n🧪 Test 3: Multiple statements with return");
		console.log(
			"📝 Code: \"const inputs = document.querySelectorAll('input'); return inputs.length;\"",
		);

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "const inputs = document.querySelectorAll('input'); return inputs.length;",
			});
			console.log("✅ Multi-statement code executed");
			console.log(`   Number of inputs: ${result.result}`);
		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Function with arguments
		console.log("\n\n🧪 Test 4: Function with arguments");
		console.log('📝 Code: "(a, b) => a + b"');
		console.log("📝 Args: [10, 25]");

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "(a, b) => a + b",
				args: [10, 25],
			});
			console.log("✅ Function with args executed");
			console.log(`   Result: ${result.result}`);
			console.log("   Expected: 35");
		} catch (error) {
			console.error("❌ Test 4 failed:", error.message);
		}

		// Test 5: Async function
		console.log("\n\n🧪 Test 5: Async function with await");
		console.log(
			"📝 Code: \"async () => { await new Promise(r => setTimeout(r, 1000)); return 'waited 1 second'; }\"",
		);

		try {
			const startTime = Date.now();
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "async () => { await new Promise(r => setTimeout(r, 1000)); return 'waited 1 second'; }",
			});
			const duration = Date.now() - startTime;

			console.log("✅ Async function executed");
			console.log(`   Result: "${result.result}"`);
			console.log(`   Duration: ${duration}ms`);
			console.log(`   Is Promise: ${result.isPromise}`);
		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Return complex object
		console.log("\n\n🧪 Test 6: Return complex object");
		console.log("📝 Code: Returns page info object");

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: `
					({
						title: document.title,
						url: window.location.href,
						linkCount: document.querySelectorAll('a').length,
						formCount: document.querySelectorAll('form').length,
						timestamp: new Date().toISOString()
					})
				`,
			});
			console.log("✅ Complex object returned");
			console.log(`   Title: "${result.result.title}"`);
			console.log(`   Links: ${result.result.linkCount}`);
			console.log(`   Forms: ${result.result.formCount}`);
			console.log(`   Timestamp: ${result.result.timestamp}`);
		} catch (error) {
			console.error("❌ Test 6 failed:", error.message);
		}

		// Test 7: DOM manipulation
		console.log("\n\n🧪 Test 7: DOM manipulation");
		console.log("📝 Code: Add new element to page");

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: `
					const div = document.createElement('div');
					div.id = 'test-element';
					div.textContent = 'Added by evaluate_js!';
					div.style.padding = '20px';
					div.style.background = '#4CAF50';
					div.style.color = 'white';
					document.body.appendChild(div);
					return div.id;
				`,
			});
			console.log("✅ DOM manipulation successful");
			console.log(`   Created element ID: "${result.result}"`);

			// Verify element exists
			const verify = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "document.getElementById('test-element').textContent",
			});
			console.log(`   Verified content: "${verify.result}"`);
		} catch (error) {
			console.error("❌ Test 7 failed:", error.message);
		}

		// Test 8: Error handling - syntax error
		console.log("\n\n🧪 Test 8: Error handling - syntax error");
		console.log('📝 Code: "this is not valid javascript"');

		try {
			await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "this is not valid javascript",
			});
			console.error("❌ Test 8 failed: Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly handled syntax error");
			console.log(`   Error: ${error.message}`);
		}

		// Test 9: Timeout handling
		console.log("\n\n🧪 Test 9: Timeout handling");
		console.log("📝 Code: Infinite loop with 2s timeout");

		try {
			await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "while(true) {}",
				timeout: 2000,
			});
			console.error("❌ Test 9 failed: Should have timed out");
		} catch (error) {
			console.log("✅ Correctly handled timeout");
			console.log(`   Error: ${error.message}`);
		}

		// Test 10: Non-serializable object
		console.log("\n\n🧪 Test 10: Non-serializable object handling");
		console.log("📝 Code: Return window object (circular reference)");

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "window",
			});
			console.log("✅ Handled non-serializable object");
			console.log(`   Result: ${result.result}`);
			console.log(`   Type: ${result.type}`);
			console.log(`   Is Serializable: ${result.isSerializable}`);
		} catch (error) {
			console.error("❌ Test 10 failed:", error.message);
		}

		// Test 11: Return by reference
		console.log("\n\n🧪 Test 11: Return by reference (returnByValue=false)");
		console.log("📝 Code: Get document object reference");

		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "document",
				returnByValue: false,
			});
			console.log("✅ Returned object reference");
			if (result.result && typeof result.result === "object") {
				console.log(`   Type: ${result.result.type || result.type}`);
				console.log(`   Class: ${result.result.className || result.className}`);
				console.log(`   Description: ${result.result.description || "N/A"}`);
				console.log(
					`   Properties: ${result.result.properties?.slice(0, 5).join(", ") || "N/A"}...`,
				);
			} else {
				console.log(`   Result: ${JSON.stringify(result.result)}`);
				console.log(`   Type: ${result.type}`);
			}
		} catch (error) {
			console.error("❌ Test 11 failed:", error.message);
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test tab closed");

		console.log("\n📊 Summary:");
		console.log("   - evaluate_js provides flexible JavaScript execution");
		console.log("   - Supports expressions, statements, and functions");
		console.log("   - Handles async/await with timeout protection");
		console.log("   - Can pass arguments to functions");
		console.log("   - Serializes return values automatically");
		console.log("   - Provides error handling and stack traces");
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
