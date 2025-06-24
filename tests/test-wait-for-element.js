#!/usr/bin/env node
/**
 * Test script for wait_for_element BROP command
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
			this.ws = new WebSocket("ws://localhost:9225?name=wait_element_test");

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

			// Timeout after 60 seconds for wait operations
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
	console.log("🧪 Testing wait_for_element Command");
	console.log(`=${"=".repeat(60)}`);
	console.log(
		"\nThis command waits for elements to appear with visibility checks.\n",
	);
	console.log("⚠️  IMPORTANT: Make sure you've reloaded the Chrome extension!");
	console.log("   The wait_for_element method was just implemented.\n");

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

		// Test 1: Wait for existing element
		console.log("\n🧪 Test 1: Wait for existing element (immediate)");
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

		// Wait for existing element
		console.log("\n⏳ Waiting for existing button...");
		try {
			const result = await client.sendCommand("wait_for_element", {
				tabId: tab1.tabId,
				selector: "#submit-button",
			});
			console.log("✅ Element found immediately");
			console.log(`   Wait time: ${result.waitTime}ms`);
			console.log(
				`   Element: ${result.element.tagName} #${result.element.id}`,
			);
			console.log(
				`   Visible: ${result.element.isVisible ? "✅ Yes" : "❌ No"}`,
			);
		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: Wait for dynamically added element
		console.log("\n\n🧪 Test 2: Wait for dynamically added element");
		console.log("📋 Creating dynamic test page...");

		const dynamicTestPath = join(
			dirname(__dirname),
			"tests/test-wait-dynamic.html",
		);
		const dynamicPageUrl = `file://${dynamicTestPath}`;

		const tab2 = await client.sendCommand("create_tab", {
			url: dynamicPageUrl,
			active: true,
		});
		console.log(`✅ Created tab ${tab2.tabId}`);

		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Click button to trigger dynamic element
		console.log("🖱️ Clicking button to add element in 2 seconds...");
		await client.sendCommand("click", {
			tabId: tab2.tabId,
			selector: "#add-element-btn",
		});

		// Wait for dynamic element
		console.log("⏳ Waiting for dynamic element to appear...");
		try {
			const startTime = Date.now();
			const result = await client.sendCommand("wait_for_element", {
				tabId: tab2.tabId,
				selector: "#dynamic-element",
				timeout: 5000,
			});
			const actualWaitTime = Date.now() - startTime;

			console.log("✅ Dynamic element found");
			console.log(`   Wait time reported: ${result.waitTime}ms`);
			console.log(`   Actual wait time: ${actualWaitTime}ms`);
			console.log(`   Element text: "${result.element.textContent}"`);
		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Wait with visibility check
		console.log("\n\n🧪 Test 3: Wait for element to become visible");
		console.log("📋 Creating page with hidden element...");

		const visibilityTestPath = join(
			dirname(__dirname),
			"tests/test-wait-visibility.html",
		);
		const hiddenPageUrl = `file://${visibilityTestPath}`;

		const tab3 = await client.sendCommand("create_tab", {
			url: hiddenPageUrl,
			active: true,
		});
		console.log(`✅ Created tab ${tab3.tabId}`);

		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Start waiting before making visible
		console.log("⏳ Waiting for element to become visible...");

		// Run wait in parallel with making it visible
		const waitPromise = client.sendCommand("wait_for_element", {
			tabId: tab3.tabId,
			selector: "#hidden-element",
			visible: true,
			timeout: 5000,
		});

		// Make element visible after 1.5 seconds
		setTimeout(async () => {
			console.log("🖱️ Making element visible...");
			await client.sendCommand("click", {
				tabId: tab3.tabId,
				selector: "#show-element-btn",
			});
		}, 1500);

		try {
			const result = await waitPromise;
			console.log("✅ Element became visible");
			console.log(`   Wait time: ${result.waitTime}ms`);
			console.log(
				`   Element is now visible: ${result.element.isVisible ? "✅ Yes" : "❌ No"}`,
			);
		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Timeout when element not found
		console.log("\n\n🧪 Test 4: Timeout when element not found");
		console.log("⏳ Waiting for non-existent element (should timeout)...");

		try {
			const startTime = Date.now();
			await client.sendCommand("wait_for_element", {
				tabId: tab1.tabId,
				selector: "#non-existent-element",
				timeout: 3000,
			});
			console.error("❌ Test 4 failed: Should have thrown timeout error");
		} catch (error) {
			const duration = Date.now() - startTime;
			console.log("✅ Correctly timed out");
			console.log(`   Error: ${error.message}`);
			console.log(`   Duration: ~${Math.round(duration / 1000)}s`);
		}

		// Test 5: Fast polling
		console.log("\n\n🧪 Test 5: Fast polling interval");
		console.log("📋 Testing with 50ms poll interval...");

		// Add element after random delay
		const delay = Math.floor(Math.random() * 500) + 200; // 200-700ms
		setTimeout(async () => {
			await client.sendCommand("execute_console", {
				tabId: tab1.tabId,
				code: `
					const div = document.createElement('div');
					div.id = 'fast-poll-element';
					div.textContent = 'Found with fast polling!';
					document.body.appendChild(div);
				`,
			});
		}, delay);

		console.log(`⏳ Element will appear in ~${delay}ms...`);
		try {
			const result = await client.sendCommand("wait_for_element", {
				tabId: tab1.tabId,
				selector: "#fast-poll-element",
				pollInterval: 50,
				timeout: 2000,
			});
			console.log("✅ Element found with fast polling");
			console.log(`   Wait time: ${result.waitTime}ms`);
			console.log(
				`   Detection accuracy: ${Math.abs(result.waitTime - delay)}ms difference`,
			);
		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Wait without visibility check
		console.log("\n\n🧪 Test 6: Wait for hidden element (visible=false)");

		// Add hidden element
		await client.sendCommand("execute_console", {
			tabId: tab1.tabId,
			code: `
				const div = document.createElement('div');
				div.id = 'hidden-test';
				div.style.display = 'none';
				div.textContent = 'Hidden element';
				document.body.appendChild(div);
			`,
		});

		console.log("⏳ Waiting for hidden element...");
		try {
			const result = await client.sendCommand("wait_for_element", {
				tabId: tab1.tabId,
				selector: "#hidden-test",
				visible: false,
			});
			console.log("✅ Hidden element found");
			console.log(`   Wait time: ${result.waitTime}ms`);
			console.log("   Element exists but is hidden");
		} catch (error) {
			console.error("❌ Test 6 failed:", error.message);
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab1.tabId });
		await client.sendCommand("close_tab", { tabId: tab2.tabId });
		await client.sendCommand("close_tab", { tabId: tab3.tabId });
		console.log("✅ Test tabs closed");

		console.log("\n📊 Summary:");
		console.log("   - wait_for_element provides flexible element detection");
		console.log("   - Dual approach: polling + MutationObserver");
		console.log("   - Optional visibility validation");
		console.log("   - Configurable timeout and poll interval");
		console.log("   - Returns accurate wait times");
		console.log("   - Perfect for dynamic content and AJAX");
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
