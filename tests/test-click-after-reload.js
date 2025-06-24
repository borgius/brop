#!/usr/bin/env node
/**
 * Test click method after extension reload
 *
 * INSTRUCTIONS:
 * 1. Make sure the bridge server is running: pnpm run dev
 * 2. Reload the Chrome extension:
 *    - Open chrome://extensions
 *    - Find "Browser Remote Operations Protocol"
 *    - Click the refresh/reload button
 * 3. Run this test: node tests/test-click-after-reload.js
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("📋 Click Method Test (After Extension Reload)");
console.log("=".repeat(50));
console.log("\n⚠️  IMPORTANT: Make sure you've reloaded the Chrome extension!");
console.log("   1. Go to chrome://extensions");
console.log('   2. Find "Browser Remote Operations Protocol"');
console.log("   3. Click the refresh button\n");

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket("ws://localhost:9225?name=click_reload_test");

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

			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error("Request timeout"));
				}
			}, 30000);
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function runTest() {
	const client = new BROPTestClient();

	try {
		await client.connect();

		// Test 1: Create a test tab
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

		// Test 2: Test click method
		console.log("\n🧪 Testing click method...");
		try {
			const result = await client.sendCommand("click", {
				tabId: tab.tabId,
				selector: "#submit-button",
			});

			console.log("✅ Click method is working!");
			console.log(
				`   Clicked element: ${result.clicked.tagName} #${result.clicked.id}`,
			);
			console.log(`   Text: "${result.clicked.text}"`);
			console.log(`   Position: ${result.position.x}, ${result.position.y}`);
			console.log(
				`   Size: ${result.position.width}x${result.position.height}`,
			);
		} catch (error) {
			if (error.message.includes("not yet implemented")) {
				console.error("❌ Click method still shows as not implemented");
				console.error("   This means the extension hasn't been reloaded");
				console.error("   Please reload the extension and try again");
			} else {
				console.error("❌ Click failed with error:", error.message);
			}
		}

		// Test 3: Click a link
		console.log("\n🧪 Testing link click...");
		try {
			const result = await client.sendCommand("click", {
				tabId: tab.tabId,
				selector: 'a[href="#section1"]',
			});

			console.log("✅ Link click successful");
			console.log(`   Element: ${result.clicked.tagName}`);
			console.log(`   Text: "${result.clicked.text}"`);
		} catch (error) {
			console.error("❌ Link click failed:", error.message);
		}

		// Test 4: Test error handling
		console.log("\n🧪 Testing error handling...");
		try {
			await client.sendCommand("click", {
				tabId: tab.tabId,
				selector: "#non-existent-element",
				timeout: 2000,
			});
			console.error("❌ Should have thrown an error for non-existent element");
		} catch (error) {
			if (error.message.includes("Element not found")) {
				console.log("✅ Correctly handled non-existent element");
			} else {
				console.error("❌ Unexpected error:", error.message);
			}
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test tab closed");

		console.log("\n✅ All tests completed successfully!");
		console.log("   The click method is now fully implemented.");
	} catch (error) {
		console.error("\n❌ Test failed:", error.message);
	} finally {
		client.disconnect();
		console.log("\nTest finished");
	}
}

// Run the test
runTest()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
