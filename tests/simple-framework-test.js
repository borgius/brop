#!/usr/bin/env node
import TestServer, { generateFrameworkTestHTML } from "./test-server.js";
import WebSocket from "ws";

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket("ws://localhost:9225?name=simple_framework_test");

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
			}, 30000);
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function simpleFrameworkTest() {
	const server = new TestServer();
	const client = new BROPTestClient();

	try {
		// Start server
		await server.start();

		// Create test HTML file  
		const testHTML = generateFrameworkTestHTML();
		await server.writeHtmlFile('framework-test.html', testHTML);
		const testUrl = server.getUrl('framework-test.html');
		
		console.log(`📋 Generated framework test URL: ${testUrl}`);

		// Connect to BROP
		await client.connect();

		// Create tab with HTTP URL
		const tab = await client.sendCommand("create_tab", {
			url: testUrl,
			active: true,
		});

		console.log(`✅ Created tab: ${tab.tabId} - ${tab.title}`);

		await new Promise(resolve => setTimeout(resolve, 2000));

		// Try basic element detection
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId
			});
			console.log(`✅ Element detection successful:`);
			console.log(`   Total elements: ${result.total_detected}`);
			console.log(`   Detection layers: ${result.detection_layers}`);
			
			// Sample some elements  
			if (result.elements && result.elements.length > 0) {
				console.log(`   Sample elements:`);
				result.elements.slice(0, 3).forEach((el, i) => {
					console.log(`     ${i+1}. ${el.serialized?.tag || 'unknown'} (${el.confidence}) - ${el.serialized?.description?.substring(0, 50)}...`);
				});
			}
		} catch (error) {
			console.log(`❌ Element detection failed: ${error.message}`);
		}

		// Clean up
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		
	} catch (error) {
		console.error("❌ Simple framework test failed:", error.message);
	} finally {
		client.disconnect();
		await server.stop();
	}
}

simpleFrameworkTest();