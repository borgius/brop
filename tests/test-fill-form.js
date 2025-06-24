#!/usr/bin/env node
/**
 * Test script for fill_form command
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
			this.ws = new WebSocket("ws://localhost:9225?name=fill_form_test");

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
	console.log("🧪 Testing fill_form Command");
	console.log(`=${"=".repeat(60)}`);

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log("");

		// Create tab with local test file
		const testFilePath = join(
			dirname(__dirname),
			"tests/test-selector-page.html",
		);
		const testFileUrl = `file://${testFilePath}`;

		console.log("📋 Creating test tab with form elements...");
		const tab = await client.sendCommand("create_tab", {
			url: testFileUrl,
			active: true,
		});
		console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
		console.log("");

		// Wait for page to load
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Test 1: Fill form fields by various selectors
		console.log("🧪 Test 1: Fill form fields using different selectors");
		try {
			const result = await client.sendCommand("fill_form", {
				tabId: tab.tabId,
				formData: {
					username: "testuser123", // Should match by ID
					email: "test@example.com", // Should match by name
					Password: "secret123", // Should match by placeholder
					comments: "This is a test comment", // Should match by ID
				},
				submit: false,
			});

			console.log("✅ Form filling successful:");
			console.log(
				`   Filled: ${result.filledFields}/${result.totalFields} fields`,
			);
			console.log(`   Form found: ${result.formFound}`);

			if (result.filled.length > 0) {
				console.log("   Filled fields:");
				for (const field of result.filled) {
					console.log(
						`     - ${field.fieldName} (${field.fieldType}): ${field.value}`,
					);
				}
			}

			if (result.errors.length > 0) {
				console.log("   Errors:");
				for (const error of result.errors) {
					console.log(`     - ${error}`);
				}
			}
		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: Fill select dropdown
		console.log("\n🧪 Test 2: Fill select dropdown");
		try {
			const result = await client.sendCommand("fill_form", {
				tabId: tab.tabId,
				formData: {
					country: "Canada", // Should match select option by text
				},
			});

			console.log("✅ Select field filled:");
			console.log(
				`   Filled: ${result.filledFields}/${result.totalFields} fields`,
			);
			if (result.filled.length > 0) {
				console.log(
					`   Field: ${result.filled[0].fieldName} = ${result.filled[0].value}`,
				);
			}
		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Error handling - non-existent fields
		console.log("\n🧪 Test 3: Error handling with non-existent fields");
		try {
			const result = await client.sendCommand("fill_form", {
				tabId: tab.tabId,
				formData: {
					nonexistent1: "value1",
					nonexistent2: "value2",
					username: "validuser", // This one should work
				},
			});

			console.log("✅ Partial form filling:");
			console.log(
				`   Filled: ${result.filledFields}/${result.totalFields} fields`,
			);
			console.log(`   Success: ${result.success}`);
			console.log(`   Errors: ${result.errors.length}`);
			if (result.errors.length > 0) {
				for (const error of result.errors) {
					console.log(`     - ${error}`);
				}
			}
		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Fill and submit a form
		console.log("\n🧪 Test 4: Fill form and submit");
		try {
			// First, let's check what happens when we try to submit
			// Note: Since this is a local file, submit won't actually navigate anywhere
			const result = await client.sendCommand("fill_form", {
				tabId: tab.tabId,
				formData: {
					username: "submituser",
					email: "submit@example.com",
					country: "USA",
				},
				submit: true,
			});

			console.log("✅ Form filled and submitted:");
			console.log(
				`   Filled: ${result.filledFields}/${result.totalFields} fields`,
			);
			console.log(`   Submitted: ${result.submitted}`);
			console.log(`   Form found: ${result.formFound}`);
		} catch (error) {
			console.error("❌ Test 4 failed:", error.message);
		}

		// Test 5: Fill specific form using formSelector
		console.log("\n🧪 Test 5: Target specific form with selector");
		try {
			// Since our test page has form elements but might not have a specific form tag,
			// this test demonstrates the formSelector parameter
			const result = await client.sendCommand("fill_form", {
				tabId: tab.tabId,
				formData: {
					username: "formuser",
				},
				formSelector: "body", // Using body as a container since we might not have a form tag
			});

			console.log("✅ Targeted form filling:");
			console.log(
				`   Filled: ${result.filledFields}/${result.totalFields} fields`,
			);
			console.log(`   Form found: ${result.formFound}`);
		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Test with W3Schools form page
		console.log("\n🧪 Test 6: Test with real form page");
		console.log("📋 Navigating to W3Schools form example...");

		await client.sendCommand("navigate", {
			tabId: tab.tabId,
			url: "https://www.w3schools.com/html/html_forms.asp",
		});

		// Wait for navigation
		await new Promise((resolve) => setTimeout(resolve, 3000));

		try {
			const result = await client.sendCommand("fill_form", {
				tabId: tab.tabId,
				formData: {
					fname: "John",
					lname: "Doe",
				},
			});

			console.log("✅ Real form filled:");
			console.log(
				`   Filled: ${result.filledFields}/${result.totalFields} fields`,
			);
			console.log(`   Form found: ${result.formFound}`);
			if (result.filled.length > 0) {
				console.log("   Filled fields:");
				for (const field of result.filled) {
					console.log(`     - ${field.fieldName}: ${field.value}`);
				}
			}
		} catch (error) {
			console.error("❌ Test 6 failed:", error.message);
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test tab closed");
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
