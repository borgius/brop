#!/usr/bin/env node
/**
 * Test debugger attachment
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
			this.ws = new WebSocket("ws://localhost:9225?name=debugger_test");

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

async function testDebugger() {
	console.log("🧪 Testing Chrome Debugger Attachment");
	console.log("=".repeat(60));
	console.log(
		"\n⚠️  NOTE: Chrome may show a warning banner about debugger being attached.",
	);
	console.log(
		"This is normal and expected for the evaluate_js functionality.\n",
	);

	const client = new BROPTestClient();

	try {
		await client.connect();

		// Create test tab
		const tab = await client.sendCommand("create_tab", {
			url: "https://example.com",
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId}`);

		// Wait for page to load
		console.log("⏳ Waiting for page to load...");
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Simple test that should use debugger
		console.log('\n🧪 Testing simple expression: "1 + 1"');
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "1 + 1",
			});
			console.log("Result:", JSON.stringify(result, null, 2));

			if (result.limited) {
				console.log("\n⚠️  WARNING: Debugger API is not working!");
				console.log("The code fell back to limited execution mode.");
				console.log("Possible reasons:");
				console.log(
					"- Chrome is showing a debugger warning that needs to be accepted",
				);
				console.log("- Another debugger is already attached");
				console.log("- The extension needs to be reloaded");
			} else {
				console.log("\n✅ Debugger API is working correctly!");
			}
		} catch (error) {
			console.error("❌ Error:", error.message);
		}

		// Test with more complex code
		console.log("\n🧪 Testing complex code with return statement");
		console.log('Code: "const x = 10; const y = 20; return x + y;"');
		try {
			const result = await client.sendCommand("evaluate_js", {
				tabId: tab.tabId,
				code: "const x = 10; const y = 20; return x + y;",
			});
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error("❌ Error:", error.message);
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test completed");
	} catch (error) {
		console.error("\n❌ Test failed:", error.message);
	} finally {
		client.disconnect();
	}
}

// Run test
testDebugger()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
