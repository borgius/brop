#!/usr/bin/env node
/**
 * Test script for type BROP command with human-like typing features
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
			this.ws = new WebSocket("ws://localhost:9225?name=type_test");

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
	console.log("🧪 Testing type Command");
	console.log(`=${"=".repeat(60)}`);
	console.log(
		"\nThis command types text into input elements with optional human-like behavior.\n",
	);
	console.log("⚠️  IMPORTANT: Make sure you've reloaded the Chrome extension!");
	console.log("   The type method was just implemented.\n");

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

		// Test 1: Basic typing
		console.log("\n🧪 Test 1: Basic typing into text input");
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

		// Type into username field
		console.log("\n⌨️ Typing into username field...");
		try {
			const startTime = Date.now();
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: "#username",
				text: "john.doe",
				delay: 50,
			});
			const duration = Date.now() - startTime;

			console.log("✅ Basic typing successful");
			console.log(
				`   Element: ${result.element.tagName} #${result.element.id}`,
			);
			console.log(`   Typed: "${result.typed}"`);
			console.log(`   Final value: "${result.finalValue}"`);
			console.log(
				`   Duration: ${duration}ms (~${Math.round(duration / result.typed.length)}ms per char)`,
			);
		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: Typing with clear
		console.log("\n\n🧪 Test 2: Typing with clear option");
		console.log("⌨️ Clearing and typing new text...");

		try {
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: "#username",
				text: "jane.smith",
				clear: true,
				delay: 30,
			});
			console.log("✅ Clear and type successful");
			console.log("   Previous content cleared");
			console.log(`   New value: "${result.finalValue}"`);
		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Human-like typing
		console.log("\n\n🧪 Test 3: Human-like typing with typos");
		console.log("⌨️ Typing with human-like behavior...");

		try {
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: '[name="email"]',
				text: "user@example.com",
				humanLike: true,
				typoChance: 0.1, // Higher chance for demo
				delay: 60,
			});
			console.log("✅ Human-like typing completed");
			console.log(`   Typed: "${result.typed}"`);
			console.log(`   Final value: "${result.finalValue}"`);
			console.log(`   Corrections made: ${result.corrections}`);
			console.log(
				`   Human-like mode: ${result.humanLike ? "✅ Enabled" : "❌ Disabled"}`,
			);
		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Type into password field
		console.log("\n\n🧪 Test 4: Type into password field");
		console.log("⌨️ Typing password...");

		try {
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: '[aria-label="User Password"]',
				text: "SecureP@ss123",
				delay: 40,
			});
			console.log("✅ Password typing successful");
			console.log(`   Element type: ${result.element.type}`);
			console.log(`   Characters typed: ${result.typed.length}`);
		} catch (error) {
			console.error("❌ Test 4 failed:", error.message);
		}

		// Test 5: Type into textarea
		console.log("\n\n🧪 Test 5: Type into textarea");
		console.log("⌨️ Typing multi-line text...");

		try {
			const multilineText =
				"Hello,\nThis is a test message.\nBest regards,\nJohn";
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: "#comments",
				text: multilineText,
				delay: 30,
			});
			console.log("✅ Textarea typing successful");
			console.log(`   Element: ${result.element.tagName}`);
			console.log(`   Lines typed: ${multilineText.split("\n").length}`);
		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Type with Enter key
		console.log("\n\n🧪 Test 6: Type with Enter key press");
		console.log("⌨️ Typing and pressing Enter...");

		try {
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: "#username",
				text: "submit-test",
				clear: true,
				pressEnter: true,
				delay: 50,
			});
			console.log("✅ Type with Enter successful");
			console.log(`   Typed: "${result.typed}"`);
			console.log("   Enter key pressed: ✅");
		} catch (error) {
			console.error("❌ Test 6 failed:", error.message);
		}

		// Test 7: Fast typing (no delay)
		console.log("\n\n🧪 Test 7: Fast typing without delay");
		console.log("⌨️ Typing as fast as possible...");

		try {
			const longText = "The quick brown fox jumps over the lazy dog";
			const startTime = Date.now();
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: "#comments",
				text: longText,
				clear: true,
				delay: 0,
			});
			const duration = Date.now() - startTime;

			console.log("✅ Fast typing completed");
			console.log(`   Characters: ${longText.length}`);
			console.log(`   Duration: ${duration}ms`);
			console.log(
				`   Speed: ~${Math.round(longText.length / (duration / 1000))} chars/second`,
			);
		} catch (error) {
			console.error("❌ Test 7 failed:", error.message);
		}

		// Test 8: Error handling - element not found
		console.log("\n\n🧪 Test 8: Error handling - element not found");
		try {
			await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: "#non-existent-input",
				text: "test",
				timeout: 2000,
			});
			console.error("❌ Test 8 failed: Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly handled error:", error.message);
		}

		// Test 9: Error handling - non-input element
		console.log("\n\n🧪 Test 9: Error handling - non-input element");
		try {
			await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: "#submit-button",
				text: "test",
			});
			console.error("❌ Test 9 failed: Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly handled error:", error.message);
		}

		// Test 10: Human-like typing showcase
		console.log("\n\n🧪 Test 10: Human-like typing showcase");
		console.log("⌨️ Watch the human-like typing in action...");

		try {
			console.log(
				"   (This will take a moment to show realistic typing speed)",
			);
			const result = await client.sendCommand("type", {
				tabId: tab1.tabId,
				selector: '[name="email"]',
				text: "realistic.typing@example.com",
				clear: true,
				humanLike: true,
				typoChance: 0.08,
				delay: 80,
			});
			console.log("✅ Human-like showcase completed");
			console.log(`   Corrections made: ${result.corrections}`);
			if (result.corrections > 0) {
				console.log("   (Typos were made and corrected automatically!)");
			}
		} catch (error) {
			console.error("❌ Test 10 failed:", error.message);
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab1.tabId });
		console.log("✅ Test tab closed");

		console.log("\n📊 Summary:");
		console.log("   - type command simulates realistic keyboard input");
		console.log("   - Character-by-character typing with proper events");
		console.log("   - Human-like mode includes:");
		console.log("     • Variable typing speed (30-120ms per character)");
		console.log("     • Occasional typos with corrections");
		console.log("     • Natural pauses before corrections");
		console.log("   - Works with all text input types");
		console.log("   - Supports clearing, Enter key, and custom delays");
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
