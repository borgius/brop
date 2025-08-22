#!/usr/bin/env node
/**
 * Edge Cases and Performance Test for Element Detection Framework
 * 
 * This test focuses on edge cases, error conditions, and performance scenarios
 * that could break the element detection system.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import TestServer, { 
	generateLargeDOMHTML, 
	generateMalformedHTML, 
	generateIframeTestHTML, 
	generateSimpleTestHTML, 
	generateMemoryTestHTML 
} from "./test-server.js";

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
			this.ws = new WebSocket("ws://localhost:9225?name=edge_cases_test");

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

			// Timeout after 60 seconds for performance tests
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

async function runEdgeCaseTests() {
	console.log("🧪 Testing Element Detection Framework - Edge Cases & Performance");
	console.log(`=${"=".repeat(70)}`);

	const client = new BROPTestClient();
	const server = new TestServer();

	try {
		// Start HTTP server
		await server.start();
		
		await client.connect();
		console.log("");

		// Test 1: Large DOM Performance Test
		console.log("🧪 Test 1: Large DOM Performance Test (1000 elements)");
		try {
			const largeHTML = generateLargeDOMHTML(1000);
			await server.writeHtmlFile('large-dom-1000.html', largeHTML);
			const testUrl = server.getUrl('large-dom-1000.html');
			
			const tab1 = await client.sendCommand("create_tab", {
				url: testUrl,
				active: true,
			});
			
			await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page load
			
			const startTime = Date.now();
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab1.tabId
			});
			const duration = Date.now() - startTime;

			console.log("✅ Large DOM test completed:");
			console.log(`   Elements detected: ${result.total_detected}`);
			console.log(`   Detection time: ${duration}ms`);
			console.log(`   Elements/second: ${Math.round(result.total_detected / (duration / 1000))}`);
			
			if (duration < 10000) {
				console.log("   ✅ Performance acceptable for large DOM (<10s)");
			} else {
				console.log("   ⚠️  Performance concern for large DOM (≥10s)");
			}

			await client.sendCommand("close_tab", { tabId: tab1.tabId });

		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: Extra Large DOM Stress Test
		console.log("\n🧪 Test 2: Extra Large DOM Stress Test (5000 elements)");
		try {
			const extraLargeHTML = generateLargeDOMHTML(5000);
			await server.writeHtmlFile('large-dom-5000.html', extraLargeHTML);
			const testUrl = server.getUrl('large-dom-5000.html');
			
			const tab2 = await client.sendCommand("create_tab", {
				url: testUrl,
				active: true,
			});
			
			await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for page load
			
			console.log("   Testing with maxElements limit...");
			const startTime = Date.now();
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab2.tabId,
				maxElements: 100  // Limit to prevent timeout
			});
			const duration = Date.now() - startTime;

			console.log("✅ Extra large DOM test completed:");
			console.log(`   Elements detected: ${result.total_detected}`);
			console.log(`   Detection time: ${duration}ms`);
			console.log(`   Limit respected: ${result.total_detected <= 100 ? '✅ Yes' : '❌ No'}`);

			await client.sendCommand("close_tab", { tabId: tab2.tabId });

		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Malformed HTML Test
		console.log("\n🧪 Test 3: Malformed HTML Edge Cases");
		try {
			const malformedHTML = generateMalformedHTML();
			await server.writeHtmlFile('malformed.html', malformedHTML);
			const testUrl = server.getUrl('malformed.html');
			
			const tab3 = await client.sendCommand("create_tab", {
				url: testUrl,
				active: true,
			});
			
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab3.tabId
			});

			console.log("✅ Malformed HTML test completed:");
			console.log(`   Elements detected: ${result.total_detected}`);
			console.log(`   Framework survived malformed HTML: ✅ Yes`);
			
			// Check for specific edge case elements
			const hasNestedButton = result.elements.some(el => 
				el.serialized && el.serialized.id === 'nested-button'
			);
			const hasUnicodeElement = result.elements.some(el => 
				el.serialized && el.serialized.id === 'unicode-元素'
			);
			const hasSpecialCharsElement = result.elements.some(el => 
				el.serialized && el.serialized.id && el.serialized.id.includes('special-chars')
			);

			console.log(`   Nested button detected: ${hasNestedButton ? '✅ Yes' : '❌ No'}`);
			console.log(`   Unicode element detected: ${hasUnicodeElement ? '✅ Yes' : '❌ No'}`);
			console.log(`   Special chars element detected: ${hasSpecialCharsElement ? '✅ Yes' : '❌ No'}`);

			await client.sendCommand("close_tab", { tabId: tab3.tabId });

		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Cross-Origin Iframe Test
		console.log("\n🧪 Test 4: Cross-Origin Iframe Handling");
		try {
			const iframeTestHTML = generateIframeTestHTML();
			await server.writeHtmlFile('iframe-test.html', iframeTestHTML);
			const testUrl = server.getUrl('iframe-test.html');
			
			const tab4 = await client.sendCommand("create_tab", {
				url: testUrl,
				active: true,
			});
			
			await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for iframes to load
			
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab4.tabId
			});

			console.log("✅ Iframe test completed:");
			console.log(`   Elements detected: ${result.total_detected}`);
			
			// Should detect outside-iframe elements and handle iframe errors gracefully
			const hasOutsideButton = result.elements.some(el => 
				el.serialized && el.serialized.id === 'outside-iframe-button'
			);

			console.log(`   Outside iframe elements detected: ${hasOutsideButton ? '✅ Yes' : '❌ No'}`);
			console.log(`   Framework handled iframes gracefully: ✅ Yes`);

			await client.sendCommand("close_tab", { tabId: tab4.tabId });

		} catch (error) {
			console.error("❌ Test 4 failed:", error.message);
		}

		// Test 5: Parameter Validation and Error Handling
		console.log("\n🧪 Test 5: Parameter Validation and Error Handling");
		try {
			// Create a minimal test page first
			const simpleHTML = generateSimpleTestHTML();
			await server.writeHtmlFile('simple-test.html', simpleHTML);
			const testUrl = server.getUrl('simple-test.html');
			
			const tab5 = await client.sendCommand("create_tab", {
				url: testUrl,
				active: true,
			});
			
			await new Promise(resolve => setTimeout(resolve, 1000));

			console.log("✅ Parameter validation tests:");

			// Test invalid confidence levels
			try {
				await client.sendCommand("detect_interactive_elements", {
					tabId: tab5.tabId,
					minConfidence: "INVALID"
				});
				console.log("   ❌ Should have rejected invalid confidence level");
			} catch (error) {
				console.log("   ✅ Correctly rejected invalid confidence level");
			}

			// Test negative maxElements
			try {
				const result = await client.sendCommand("detect_interactive_elements", {
					tabId: tab5.tabId,
					maxElements: -1
				});
				console.log(`   ⚠️  Negative maxElements accepted, returned ${result.total_detected} elements`);
			} catch (error) {
				console.log("   ✅ Correctly rejected negative maxElements");
			}

			// Test extremely large maxElements
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab5.tabId,
				maxElements: 999999
			});
			console.log(`   ✅ Large maxElements handled gracefully: ${result.total_detected} elements`);

			await client.sendCommand("close_tab", { tabId: tab5.tabId });

		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Memory Usage and Cleanup
		console.log("\n🧪 Test 6: Memory Usage Pattern Test");
		try {
			console.log("   Running multiple detection cycles to test memory...");
			
			const memoryHTML = generateMemoryTestHTML();
			await server.writeHtmlFile('memory-test.html', memoryHTML);
			const testUrl = server.getUrl('memory-test.html');
			
			const tab6 = await client.sendCommand("create_tab", {
				url: testUrl,
				active: true,
			});
			
			await new Promise(resolve => setTimeout(resolve, 1000));

			const cycles = 10;
			const timings = [];
			
			for (let i = 0; i < cycles; i++) {
				const startTime = Date.now();
				const result = await client.sendCommand("detect_interactive_elements", {
					tabId: tab6.tabId
				});
				const duration = Date.now() - startTime;
				timings.push(duration);
				
				// Brief pause between cycles
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
			const maxTime = Math.max(...timings);
			const minTime = Math.min(...timings);

			console.log("✅ Memory pattern test completed:");
			console.log(`   Cycles completed: ${cycles}`);
			console.log(`   Average time: ${Math.round(avgTime)}ms`);
			console.log(`   Min time: ${minTime}ms, Max time: ${maxTime}ms`);
			console.log(`   Time variance: ${Math.round(maxTime - minTime)}ms`);
			
			if (maxTime - minTime < avgTime) {
				console.log("   ✅ Consistent performance across cycles");
			} else {
				console.log("   ⚠️  Performance variance detected");
			}

			await client.sendCommand("close_tab", { tabId: tab6.tabId });

		} catch (error) {
			console.error("❌ Test 6 failed:", error.message);
		}

		// Test 7: Real Website Stress Test
		console.log("\n🧪 Test 7: Real Website Stress Test");
		try {
			console.log("   Testing on a real complex website...");
			
			const tab7 = await client.sendCommand("create_tab", {
				url: "https://www.github.com",
				active: true,
			});
			
			// Wait longer for real website to load
			await new Promise(resolve => setTimeout(resolve, 5000));

			const startTime = Date.now();
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab7.tabId,
				maxElements: 200  // Limit for real website
			});
			const duration = Date.now() - startTime;

			console.log("✅ Real website test completed:");
			console.log(`   Website: GitHub`);
			console.log(`   Elements detected: ${result.total_detected}`);
			console.log(`   Detection time: ${duration}ms`);
			console.log(`   Framework handled real website: ✅ Yes`);

			await client.sendCommand("close_tab", { tabId: tab7.tabId });

		} catch (error) {
			console.error("❌ Test 7 failed (this is expected for network issues):", error.message);
		}

		console.log("\n✅ All edge case tests completed");

	} catch (error) {
		console.error("\n❌ Edge case test suite failed:", error.message);
	} finally {
		client.disconnect();
		await server.stop();
		console.log("\n✅ Edge case testing completed");
	}
}

// Run tests
console.log("");
runEdgeCaseTests()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});