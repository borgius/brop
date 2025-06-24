#!/usr/bin/env node
/**
 * Test script for navigate BROP command
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
			this.ws = new WebSocket("ws://localhost:9225?name=navigate_test");

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

			// Timeout after 30 seconds
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

async function runTests() {
	console.log("🧪 Testing navigate Command");
	console.log(`=${"=".repeat(60)}`);
	console.log(
		"\nThis command handles browser navigation with multiple options.\n",
	);

	const client = new BROPTestClient();
	let createdTabs = [];

	try {
		// Connect to BROP server
		await client.connect();
		console.log("");

		// Check extension status first
		console.log("📋 Checking extension status...");
		try {
			const version = await client.sendCommand("get_extension_version", {});
			console.log(
				`✅ Extension connected: ${version.result.extension_name} v${version.result.extension_version}`,
			);
		} catch (error) {
			console.error("❌ Extension not connected:", error.message);
			console.log("\nPlease ensure:");
			console.log("1. Chrome extension is loaded");
			console.log("2. Bridge server is running (pnpm run dev)");
			console.log('3. Extension popup shows "Connected"');
			return;
		}

		// Test 1: Navigate active tab
		console.log("\n🧪 Test 1: Navigate active tab (default behavior)");
		console.log("📋 Creating a test tab...");

		const tab1 = await client.sendCommand("create_tab", {
			url: "about:blank",
			active: true,
		});
		createdTabs.push(tab1.tabId);
		console.log(`✅ Created tab ${tab1.tabId}`);

		console.log("🌐 Navigating to example.com...");
		try {
			const result = await client.sendCommand("navigate", {
				url: "https://example.com",
			});
			console.log("✅ Navigation successful");
			console.log(`   Action: ${result.action}`);
			console.log(`   Tab ID: ${result.tabId}`);
			console.log(`   URL: ${result.url}`);
			console.log(`   Title: ${result.title || "Loading..."}`);
		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: Navigate specific tab by ID
		console.log("\n\n🧪 Test 2: Navigate specific tab by ID");
		console.log("🌐 Navigating tab to Wikipedia...");

		try {
			const result = await client.sendCommand("navigate", {
				url: "https://en.wikipedia.org/wiki/Main_Page",
				tabId: tab1.tabId,
			});
			console.log("✅ Navigation with tabId successful");
			console.log(`   Action: ${result.action}`);
			console.log(`   Tab ID: ${result.tabId}`);
			console.log(`   URL: ${result.url}`);
		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Create new tab with navigation
		console.log("\n\n🧪 Test 3: Create new tab with navigation");
		console.log("📋 Creating new tab and navigating...");

		try {
			const result = await client.sendCommand("navigate", {
				url: "https://github.com",
				create_new_tab: true,
			});
			createdTabs.push(result.tabId);
			console.log("✅ New tab created and navigated");
			console.log(`   Action: ${result.action}`);
			console.log(`   Tab ID: ${result.tabId}`);
			console.log(`   URL: ${result.url}`);
			console.log(`   Title: ${result.title || "Loading..."}`);
		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Navigate and close tab
		console.log("\n\n🧪 Test 4: Close tab after navigation");
		console.log("📋 Creating tab to close...");

		const tabToClose = await client.sendCommand("create_tab", {
			url: "https://example.org",
			active: false,
		});
		console.log(`✅ Created tab ${tabToClose.tabId}`);

		console.log("🗑️ Closing the tab...");
		try {
			const result = await client.sendCommand("navigate", {
				tabId: tabToClose.tabId,
				close_tab: true,
			});
			console.log("✅ Tab closed successfully");
			console.log(`   Action: ${result.action}`);
			console.log(`   Tab ID: ${result.tabId}`);
			// Remove from createdTabs since it's closed
			createdTabs = createdTabs.filter((id) => id !== tabToClose.tabId);
		} catch (error) {
			console.error("❌ Test 4 failed:", error.message);
			createdTabs.push(tabToClose.tabId); // Add back if close failed
		}

		// Test 5: Navigate to local file
		console.log("\n\n🧪 Test 5: Navigate to local file");
		const testFilePath = join(
			dirname(__dirname),
			"tests/test-selector-page.html",
		);
		const testFileUrl = `file://${testFilePath}`;

		console.log(`🌐 Navigating to local file: ${testFileUrl}`);
		try {
			const result = await client.sendCommand("navigate", {
				url: testFileUrl,
				tabId: tab1.tabId,
			});
			console.log("✅ Local file navigation successful");
			console.log(`   URL: ${result.url}`);
			console.log(`   Title: ${result.title || "Loading..."}`);
		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Error handling - invalid tab ID
		console.log("\n\n🧪 Test 6: Error handling with invalid tab ID");
		try {
			await client.sendCommand("navigate", {
				url: "https://example.com",
				tabId: 999999,
			});
			console.error("❌ Test 6 failed: Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly handled error:", error.message);
		}

		// Test 7: Error handling - no active tab
		console.log("\n\n🧪 Test 7: Navigate without URL (should fail)");
		try {
			await client.sendCommand("navigate", {
				tabId: tab1.tabId,
			});
			console.error("❌ Test 7 failed: Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly handled error:", error.message);
		}

		// Test 8: Navigate to chrome:// URL (should work but with limitations)
		console.log("\n\n🧪 Test 8: Navigate to chrome:// URL");
		try {
			const result = await client.sendCommand("navigate", {
				url: "chrome://version",
				tabId: tab1.tabId,
			});
			console.log("✅ Chrome URL navigation attempted");
			console.log(`   URL: ${result.url}`);
			console.log("   Note: Content scripts cannot access chrome:// pages");
		} catch (error) {
			console.error("❌ Test 8 failed:", error.message);
		}

		// Test 9: Navigate with about:blank
		console.log("\n\n🧪 Test 9: Navigate to about:blank");
		try {
			const result = await client.sendCommand("navigate", {
				url: "about:blank",
				tabId: tab1.tabId,
			});
			console.log("✅ about:blank navigation successful");
			console.log(`   URL: ${result.url}`);
		} catch (error) {
			console.error("❌ Test 9 failed:", error.message);
		}

		// Test 10: Multiple navigations in sequence
		console.log("\n\n🧪 Test 10: Multiple navigations in sequence");
		const urls = [
			"https://example.com",
			"https://example.org",
			"https://example.net",
		];

		for (const url of urls) {
			console.log(`🌐 Navigating to ${url}...`);
			try {
				const result = await client.sendCommand("navigate", {
					url: url,
					tabId: tab1.tabId,
				});
				console.log(`✅ Navigated to ${result.url}`);
				await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief pause between navigations
			} catch (error) {
				console.error(`❌ Failed to navigate to ${url}:`, error.message);
			}
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		for (const tabId of createdTabs) {
			try {
				await client.sendCommand("close_tab", { tabId });
				console.log(`✅ Closed tab ${tabId}`);
			} catch (error) {
				// Tab might already be closed
			}
		}

		console.log("\n📊 Summary:");
		console.log("   - navigate supports multiple modes of operation");
		console.log(
			"   - Can navigate active tab, specific tab, or create new tab",
		);
		console.log("   - close_tab parameter allows closing tabs");
		console.log("   - Handles errors for invalid tab IDs");
		console.log("   - Works with HTTP(S), file://, and chrome:// URLs");
		console.log("   - Returns tab information after navigation");

		console.log("\n🎯 Navigate Method Parameters:");
		console.log("   - url (required): URL to navigate to");
		console.log("   - tabId (optional): Specific tab to navigate");
		console.log(
			"   - create_new_tab (optional): Create new tab for navigation",
		);
		console.log("   - close_tab (optional): Close the specified tab");
	} catch (error) {
		console.error("\n❌ Test suite failed:", error.message);
		// Clean up any created tabs
		for (const tabId of createdTabs) {
			try {
				await client.sendCommand("close_tab", { tabId });
			} catch (e) {
				// Ignore cleanup errors
			}
		}
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
