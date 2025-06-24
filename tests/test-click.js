#!/usr/bin/env node
/**
 * Test script for click BROP command
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
			this.ws = new WebSocket("ws://localhost:9225?name=click_test");

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
	console.log("🧪 Testing click Command");
	console.log(`=${"=".repeat(60)}`);
	console.log("\nThis command simulates mouse clicks on DOM elements.\n");

	const client = new BROPTestClient();

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

		// Test 1: Click on a button in a test page
		console.log("\n🧪 Test 1: Click on a button");
		console.log("📋 Creating tab with test page...");

		const testFilePath = join(
			dirname(__dirname),
			"tests/test-selector-page.html",
		);
		const testFileUrl = `file://${testFilePath}`;

		const tab1 = await client.sendCommand("create_tab", {
			url: testFileUrl,
			active: true,
		});
		console.log(`✅ Created tab ${tab1.tabId}`);

		// Wait for page to load
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Click on submit button
		console.log("\n🖱️ Clicking submit button...");
		try {
			const result = await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: "#submit-button",
			});
			console.log("✅ Click successful");
			console.log(
				`   Element: ${result.clicked.tagName} #${result.clicked.id}`,
			);
			console.log(`   Text: "${result.clicked.text}"`);
			console.log(
				`   Position: x=${result.position.x}, y=${result.position.y}`,
			);
			console.log(
				`   Size: ${result.position.width}x${result.position.height}`,
			);
		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: Click on a link
		console.log("\n\n🧪 Test 2: Click on a link");
		console.log("🖱️ Clicking on a link...");

		try {
			const result = await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: 'a[href="#section1"]',
			});
			console.log("✅ Link click successful");
			console.log(`   Element: ${result.clicked.tagName}`);
			console.log(`   Href: ${result.clicked.href}`);
			console.log(`   Text: "${result.clicked.text}"`);
		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Click with navigation detection
		console.log("\n\n🧪 Test 3: Click with navigation detection");
		console.log("📋 Navigating to example.com...");

		await client.sendCommand("navigate", {
			tabId: tab1.tabId,
			url: "https://example.com",
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		console.log(
			'🖱️ Clicking "More information" link with navigation detection...',
		);
		try {
			const result = await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: 'a[href="https://www.iana.org/domains/example"]',
				waitForNavigation: true,
			});
			console.log("✅ Click with navigation detection successful");
			console.log(`   Clicked: ${result.clicked.tagName}`);
			console.log(
				`   Navigation occurred: ${result.navigation?.occurred || false}`,
			);
			if (result.navigation?.occurred) {
				console.log(`   Old URL: ${result.navigation.oldUrl}`);
				console.log(`   New URL: ${result.navigation.newUrl}`);
			}
		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Click on checkbox
		console.log("\n\n🧪 Test 4: Click on checkbox");
		console.log("📋 Navigating back to test page...");

		await client.sendCommand("navigate", {
			tabId: tab1.tabId,
			url: testFileUrl,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		console.log("🖱️ Clicking checkbox...");
		try {
			const result = await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: "#newsletter",
			});
			console.log("✅ Checkbox click successful");
			console.log(`   Element: ${result.clicked.tagName}`);
			console.log(`   Type: ${result.clicked.type}`);
			console.log(`   ID: ${result.clicked.id}`);

			// Check if checkbox is now checked
			const element = await client.sendCommand("get_element", {
				tabId: tab1.tabId,
				selector: "#newsletter",
			});
			console.log(
				`   Checked state: ${element.element.checked ? "✅ Checked" : "⬜ Unchecked"}`,
			);
		} catch (error) {
			console.error("❌ Test 4 failed:", error.message);
		}

		// Test 5: Click on select dropdown
		console.log("\n\n🧪 Test 5: Click on select dropdown");
		console.log("🖱️ Clicking select element...");

		try {
			const result = await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: "#country",
			});
			console.log("✅ Select click successful");
			console.log(`   Element: ${result.clicked.tagName}`);
			console.log(`   ID: ${result.clicked.id}`);
		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Error handling - element not found
		console.log("\n\n🧪 Test 6: Error handling - element not found");
		try {
			await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: "#non-existent-element",
				timeout: 2000,
			});
			console.error("❌ Test 6 failed: Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly handled error:", error.message);
		}

		// Test 7: Error handling - invalid tab ID
		console.log("\n\n🧪 Test 7: Error handling - invalid tab ID");
		try {
			await client.sendCommand("click", {
				tabId: 999999,
				selector: "#submit-button",
			});
			console.error("❌ Test 7 failed: Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly handled error:", error.message);
		}

		// Test 8: Click with custom timeout
		console.log("\n\n🧪 Test 8: Click with custom timeout");
		console.log("🖱️ Clicking with 10 second timeout...");

		try {
			const result = await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: 'button[type="submit"]',
				timeout: 10000,
			});
			console.log("✅ Click with custom timeout successful");
			console.log("   Found and clicked in < 10 seconds");
		} catch (error) {
			console.error("❌ Test 8 failed:", error.message);
		}

		// Test 9: Click on element with role="button"
		console.log('\n\n🧪 Test 9: Click on element with role="button"');

		// First, let's check what elements are available
		const domContent = await client.sendCommand("get_simplified_dom", {
			tabId: tab1.tabId,
			includeSelectors: true,
		});

		// Look for any element with role="button" in the markdown
		if (
			domContent.markdown?.includes('role="button"') ||
			domContent.markdown?.includes('[role="button"]')
		) {
			console.log('🖱️ Found element with role="button", clicking...');
			try {
				const result = await client.sendCommand("click", {
					tabId: tab1.tabId,
					selector: '[role="button"]',
				});
				console.log("✅ Role button click successful");
				console.log(`   Element: ${result.clicked.tagName}`);
			} catch (error) {
				console.error("❌ Test 9 failed:", error.message);
			}
		} else {
			console.log('⚠️ No element with role="button" found on test page');
		}

		// Test 10: Click on disabled element (should fail)
		console.log("\n\n🧪 Test 10: Click on disabled element");

		// First, disable an element
		await client.sendCommand("execute_console", {
			tabId: tab1.tabId,
			code: 'document.getElementById("submit-button").disabled = true',
		});

		console.log("🖱️ Attempting to click disabled button...");
		try {
			await client.sendCommand("click", {
				tabId: tab1.tabId,
				selector: "#submit-button",
			});
			console.error("❌ Test 10 failed: Should have thrown an error");
		} catch (error) {
			console.log(
				"✅ Correctly prevented click on disabled element:",
				error.message,
			);
		}

		// Re-enable the button
		await client.sendCommand("execute_console", {
			tabId: tab1.tabId,
			code: 'document.getElementById("submit-button").disabled = false',
		});

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab1.tabId });
		console.log("✅ Test tab closed");

		console.log("\n📊 Summary:");
		console.log("   - click command simulates full mouse event sequence");
		console.log(
			"   - Waits for elements to appear (with configurable timeout)",
		);
		console.log("   - Validates element visibility and enabled state");
		console.log("   - Supports navigation detection");
		console.log("   - Returns clicked element details and position");
		console.log(
			"   - Works with all clickable elements (links, buttons, checkboxes, etc.)",
		);
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
