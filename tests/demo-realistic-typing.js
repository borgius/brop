#!/usr/bin/env node
/**
 * Demo to showcase realistic human typing speeds
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🎭 Realistic Human Typing Speed Demo");
console.log("===================================\n");
console.log("This demo compares different typing speeds and modes.\n");

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket("ws://localhost:9225?name=typing_speed_demo");

			this.ws.on("open", () => {
				resolve();
			});

			this.ws.on("error", (error) => {
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
		const id = `demo_${++this.messageId}`;
		const message = { id, method, params };

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.ws.send(JSON.stringify(message));

			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error("Request timeout"));
				}
			}, 120000); // 2 minute timeout for long demos
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function runDemo() {
	const client = new BROPTestClient();

	try {
		console.log("🔌 Connecting to BROP server...");
		await client.connect();
		console.log("✅ Connected\n");

		// Create a demo page with multiple input fields
		console.log("📋 Creating demo page...");
		const demoPagePath = join(
			dirname(__dirname),
			"tests/demo-typing-page.html",
		);
		const demoPageUrl = `file://${demoPagePath}`;

		const tab = await client.sendCommand("create_tab", {
			url: demoPageUrl,
			active: true,
		});
		console.log("✅ Demo page created\n");

		// Wait for page to load
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const demoText =
			"The quick brown fox jumps over the lazy dog. This demonstrates realistic typing!";

		// Demo 1: Robot mode
		console.log("🤖 Demo 1: Robot Mode (consistent 50ms delay)");
		console.log("   Watch the first input field...\n");

		const robotStart = Date.now();
		await client.sendCommand("type", {
			tabId: tab.tabId,
			selector: "#robot",
			text: demoText,
			delay: 50,
			humanLike: false,
		});
		const robotDuration = Date.now() - robotStart;
		console.log(
			`   ✅ Completed in ${robotDuration}ms (${Math.round(robotDuration / demoText.length)}ms per char average)\n`,
		);

		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Demo 2: Human mode with default speed
		console.log("🧑 Demo 2: Human Mode - Default Speed");
		console.log("   Watch the second input field for natural typing...\n");

		const humanDefaultStart = Date.now();
		const result2 = await client.sendCommand("type", {
			tabId: tab.tabId,
			selector: "#human-default",
			text: demoText,
			humanLike: true,
			typoChance: 0.03,
			// delay is auto-set to 100ms for humanLike
		});
		const humanDefaultDuration = Date.now() - humanDefaultStart;
		console.log(
			`   ✅ Completed in ${humanDefaultDuration}ms (${Math.round(humanDefaultDuration / demoText.length)}ms per char average)`,
		);
		console.log(`   Corrections made: ${result2.corrections}\n`);

		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Demo 3: Fast human typist
		console.log("⚡ Demo 3: Human Mode - Fast Typist");
		console.log("   Watch the third input field for faster human typing...\n");

		const humanFastStart = Date.now();
		const result3 = await client.sendCommand("type", {
			tabId: tab.tabId,
			selector: "#human-fast",
			text: demoText,
			delay: 70,
			humanLike: true,
			typoChance: 0.04, // Slightly more typos when typing fast
		});
		const humanFastDuration = Date.now() - humanFastStart;
		console.log(
			`   ✅ Completed in ${humanFastDuration}ms (${Math.round(humanFastDuration / demoText.length)}ms per char average)`,
		);
		console.log(`   Corrections made: ${result3.corrections}\n`);

		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Demo 4: Slow, careful typist
		console.log("🐌 Demo 4: Human Mode - Careful Typist");
		console.log(
			"   Watch the fourth input field for slow, deliberate typing...\n",
		);

		const humanSlowStart = Date.now();
		const result4 = await client.sendCommand("type", {
			tabId: tab.tabId,
			selector: "#human-slow",
			text: demoText,
			delay: 150,
			humanLike: true,
			typoChance: 0.01, // Fewer typos when typing carefully
		});
		const humanSlowDuration = Date.now() - humanSlowStart;
		console.log(
			`   ✅ Completed in ${humanSlowDuration}ms (${Math.round(humanSlowDuration / demoText.length)}ms per char average)`,
		);
		console.log(`   Corrections made: ${result4.corrections}\n`);

		// Summary
		console.log("📊 Summary of Typing Speeds:");
		console.log(
			`   Robot mode:      ${robotDuration}ms total (${Math.round(robotDuration / demoText.length)}ms/char)`,
		);
		console.log(
			`   Human default:   ${humanDefaultDuration}ms total (${Math.round(humanDefaultDuration / demoText.length)}ms/char)`,
		);
		console.log(
			`   Human fast:      ${humanFastDuration}ms total (${Math.round(humanFastDuration / demoText.length)}ms/char)`,
		);
		console.log(
			`   Human careful:   ${humanSlowDuration}ms total (${Math.round(humanSlowDuration / demoText.length)}ms/char)`,
		);

		// Keep tab open for observation
		console.log("\n📌 Demo complete! The tab will stay open for 30 seconds.");
		console.log(
			"   Notice how the human modes have natural variations in speed.\n",
		);

		await new Promise((resolve) => setTimeout(resolve, 30000));

		// Clean up
		console.log("🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Demo tab closed");
	} catch (error) {
		console.error("\n❌ Demo failed:", error.message);
		console.log("\nMake sure:");
		console.log("1. The Chrome extension is reloaded");
		console.log("2. The bridge server is running (pnpm run dev)");
	} finally {
		client.disconnect();
		console.log("\nDemo finished");
	}
}

// Run demo
runDemo()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
