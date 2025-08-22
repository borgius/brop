#!/usr/bin/env node
import TestServer, { generateSimpleTestHTML } from "./test-server.js";
import WebSocket from "ws";

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket("ws://localhost:9225?name=debug_test");

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
			}, 10000);
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function debugTest() {
	const server = new TestServer();
	const client = new BROPTestClient();

	try {
		// Start server
		await server.start();
		console.log(`✅ Server started on port ${server.actualPort}`);

		// Create test HTML file
		const testHTML = generateSimpleTestHTML();
		await server.writeHtmlFile('debug-test.html', testHTML);
		const testUrl = server.getUrl('debug-test.html');
		
		console.log(`📋 Generated test URL: ${testUrl}`);

		// Connect to BROP
		await client.connect();

		// Create tab with HTTP URL
		const tab = await client.sendCommand("create_tab", {
			url: testUrl,
			active: true,
		});

		console.log(`✅ Created tab: ${JSON.stringify(tab)}`);

		await new Promise(resolve => setTimeout(resolve, 2000));

		// Try element detection
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId
			});
			console.log(`✅ Element detection successful: ${result.total_detected} elements found`);
		} catch (error) {
			console.log(`❌ Element detection failed: ${error.message}`);
		}

		// Clean up
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		
	} catch (error) {
		console.error("❌ Debug test failed:", error.message);
	} finally {
		client.disconnect();
		await server.stop();
	}
}

debugTest();