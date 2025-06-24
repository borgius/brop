#!/usr/bin/env node
/**
 * Test to show how forms and form elements appear in markdown output
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
			this.ws = new WebSocket("ws://localhost:9225?name=form_output_test");

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

async function runTest() {
	console.log("🧪 Testing Form Elements in Markdown Output");
	console.log(`=${"=".repeat(60)}`);

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log("");

		// Use our local test file that has various form elements
		const testFilePath = join(
			dirname(__dirname),
			"test/test-selector-page.html",
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

		// Extract with CSS selectors
		console.log("📄 Extracting markdown with CSS selectors...\n");
		const result = await client.sendCommand("get_simplified_dom", {
			tabId: tab.tabId,
			format: "markdown",
			enableDetailedResponse: false,
			includeSelectors: true,
		});

		// Display the full markdown to see how forms appear
		console.log(`=${"=".repeat(60)}`);
		console.log("FULL MARKDOWN OUTPUT:");
		console.log(`=${"=".repeat(60)}`);
		console.log(result.markdown);
		console.log(`=${"=".repeat(60)}`);

		// Extract and categorize form elements
		console.log("\n📊 FORM ELEMENTS ANALYSIS:\n");

		// Find all input elements
		const inputMatches =
			result.markdown?.match(
				/\[(text|email|password|input|textarea|select):[\s\S]*?\]<!--[^>]+-->/gi,
			) || [];
		console.log(`Input Fields Found: ${inputMatches.length}`);
		if (inputMatches.length > 0) {
			console.log("Examples:");
			for (const match of inputMatches) {
				console.log(`  - ${match}`);
			}
		}

		// Find all button elements
		const buttonMatches =
			result.markdown?.match(
				/\[(?!text:|email:|password:|input:|textarea:|select:)[\s\S]*?\]<!--[^>]*(?:button|submit|btn)[^>]*-->/gi,
			) || [];
		console.log(`\nButtons Found: ${buttonMatches.length}`);
		if (buttonMatches.length > 0) {
			console.log("Examples:");
			for (const match of buttonMatches) {
				console.log(`  - ${match}`);
			}
		}

		// Find label elements
		const labelMatches =
			result.markdown?.match(/[^[]*<!--[^>]*label[^>]*-->/gi) || [];
		console.log(`\nLabels Found: ${labelMatches.length}`);
		if (labelMatches.length > 0) {
			console.log("Examples:");
			for (const match of labelMatches) {
				console.log(`  - ${match.trim()}`);
			}
		}

		// Show lines that contain form-related content
		console.log("\n📝 FORM-RELATED LINES:\n");
		const lines = result.markdown?.split("\n") || [];
		const formLines = lines.filter(
			(line) =>
				line.toLowerCase().includes("form") ||
				line.toLowerCase().includes("input") ||
				line.toLowerCase().includes("button") ||
				line.toLowerCase().includes("username") ||
				line.toLowerCase().includes("password") ||
				line.toLowerCase().includes("email") ||
				line.toLowerCase().includes("textarea") ||
				line.toLowerCase().includes("select"),
		);

		for (const line of formLines) {
			if (line.trim()) {
				console.log(`  ${line.trim()}`);
			}
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test tab closed");
	} catch (error) {
		console.error("\n❌ Test failed:", error.message);
	} finally {
		client.disconnect();
		console.log("\n✅ Test completed");
	}
}

// Run test
console.log("");
runTest()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
