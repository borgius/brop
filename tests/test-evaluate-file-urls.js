#!/usr/bin/env node
/**
 * Test evaluate_js behavior with file:// URLs
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
			this.ws = new WebSocket("ws://localhost:9225?name=file_url_test");

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

async function testFileUrls() {
	console.log("🧪 Testing evaluate_js with file:// URLs");
	console.log("=".repeat(60));
	console.log("\nTesting behavior and limitations with local files.\n");

	const client = new BROPTestClient();

	try {
		await client.connect();

		// Create test tab with file URL
		const testFilePath = join(
			dirname(__dirname),
			"tests/test-selector-page.html",
		);
		const testFileUrl = `file://${testFilePath}`;

		const tab = await client.sendCommand("create_tab", {
			url: testFileUrl,
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId} with file:// URL`);

		// Wait for page to load
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Test different types of code to see what works and what doesn't
		const tests = [
			{
				name: "Simple expression",
				code: "1 + 1",
			},
			{
				name: "DOM property access",
				code: "document.title",
			},
			{
				name: "DOM query",
				code: "document.querySelectorAll('input').length",
			},
			{
				name: "Variable and return",
				code: "const x = 5; return x * 2;",
			},
			{
				name: "Object literal",
				code: '({ name: "test", value: 123 })',
			},
			{
				name: "Array creation",
				code: "[1, 2, 3, 4, 5]",
			},
			{
				name: "Function definition",
				code: 'function test() { return "hello"; }',
			},
			{
				name: "Arrow function",
				code: '() => "hello"',
			},
			{
				name: "Window object",
				code: "window",
			},
			{
				name: "Document object",
				code: "document",
			},
			{
				name: "Invalid syntax",
				code: "this is not valid",
			},
			{
				name: "Throw error",
				code: 'throw new Error("test")',
			},
		];

		console.log("\n📊 Testing various code patterns:\n");

		for (const test of tests) {
			console.log(`🧪 ${test.name}`);
			console.log(`   Code: ${test.code}`);

			try {
				const result = await client.sendCommand("evaluate_js", {
					tabId: tab.tabId,
					code: test.code,
				});

				console.log("   ✅ Success");
				console.log(`   Result: ${JSON.stringify(result.result)}`);
				console.log(`   Type: ${result.type}`);
				if (result.limited) {
					console.log(`   ⚠️  Limited mode: ${result.note}`);
				}
			} catch (error) {
				console.log(`   ❌ Error: ${error.message}`);
			}
			console.log("");
		}

		// Clean up
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test completed");

		console.log("\n📊 Summary:");
		console.log(
			"   The behavior with file:// URLs appears to be inconsistent.",
		);
		console.log("   Chrome may allow some debugger operations but not others.");
		console.log("   For reliable JavaScript execution, use HTTP/HTTPS URLs.");
	} catch (error) {
		console.error("\n❌ Test suite failed:", error.message);
	} finally {
		client.disconnect();
	}
}

// Run tests
testFileUrls()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
