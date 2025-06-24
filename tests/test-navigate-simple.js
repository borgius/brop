#!/usr/bin/env node
/**
 * Simple test script for navigate BROP command
 */

import WebSocket from "ws";

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket("ws://localhost:9225?name=navigate_simple_test");

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
	console.log("🧪 Simple Navigate Test");
	console.log("======================\n");

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();

		// Test 1: Create tab and navigate with delay
		console.log("📋 Creating a new tab...");
		const tab = await client.sendCommand("create_tab", {
			url: "about:blank",
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId}`);

		// Wait for tab to be ready
		console.log("⏳ Waiting for tab to be ready...");
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Navigate to example.com
		console.log("\n🌐 Navigating to example.com...");
		const nav1 = await client.sendCommand("navigate", {
			url: "https://example.com",
			tabId: tab.tabId,
		});
		console.log("✅ Navigation command sent");
		console.log(`   Tab ID: ${nav1.tabId}`);
		console.log(`   URL: ${nav1.url}`);
		console.log(`   Title: ${nav1.title || "Loading..."}`);

		// Wait for navigation to complete
		console.log("\n⏳ Waiting for page to load...");
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Get page content to verify navigation
		console.log("\n📄 Getting page content to verify...");
		const content = await client.sendCommand("get_page_content", {
			tabId: tab.tabId,
		});
		console.log("✅ Page content retrieved");
		console.log(`   Current URL: ${content.url}`);
		console.log(`   Current Title: ${content.title}`);
		console.log(`   Content length: ${content.html?.length || 0} characters`);

		// Navigate to another page
		console.log("\n🌐 Navigating to Wikipedia...");
		const nav2 = await client.sendCommand("navigate", {
			url: "https://en.wikipedia.org/wiki/Main_Page",
			tabId: tab.tabId,
		});
		console.log("✅ Second navigation command sent");

		// Wait and verify
		console.log("\n⏳ Waiting for Wikipedia to load...");
		await new Promise((resolve) => setTimeout(resolve, 4000));

		const content2 = await client.sendCommand("get_page_content", {
			tabId: tab.tabId,
		});
		console.log("✅ Page content retrieved");
		console.log(`   Current URL: ${content2.url}`);
		console.log(`   Current Title: ${content2.title}`);

		// Test create_new_tab option
		console.log("\n🌐 Testing create_new_tab option...");
		const newTab = await client.sendCommand("navigate", {
			url: "https://github.com",
			create_new_tab: true,
		});
		console.log("✅ New tab created with navigation");
		console.log(`   Tab ID: ${newTab.tabId}`);
		console.log(`   Action: ${newTab.action}`);

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		await client.sendCommand("close_tab", { tabId: newTab.tabId });
		console.log("✅ Tabs closed");

		console.log("\n✅ All tests passed!");
	} catch (error) {
		console.error("\n❌ Test failed:", error.message);
	} finally {
		client.disconnect();
		console.log("\nTest completed");
	}
}

// Run tests
runTests()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
