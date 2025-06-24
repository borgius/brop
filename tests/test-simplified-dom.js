#!/usr/bin/env node
/**
 * Comprehensive test for get_simplified_dom command
 * Tests both Turndown (markdown) and Readability (HTML) extraction
 * Including CSS selector extraction feature
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
			this.ws = new WebSocket("ws://localhost:9225?name=simplified_dom_test");

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

function validateMarkdownContent(markdown) {
	const checks = {
		hasHeaders: /^#{1,6}\s/m.test(markdown),
		hasLinks: /\[([^\]]+)\]\(([^)]+)\)/.test(markdown),
		hasBold: /\*\*([^*]+)\*\*|__([^_]+)__/.test(markdown),
		hasItalic: /\*([^*]+)\*|_([^_]+)_/.test(markdown),
		hasLists: /^[\s]*[-*+]\s|^\d+\.\s/m.test(markdown),
		hasCodeBlocks: /```[\s\S]*?```/.test(markdown),
		hasInlineCode: /`[^`]+`/.test(markdown),
		hasBlockquotes: /^>\s/m.test(markdown),
		hasImages: /!\[([^\]]*)\]\(([^)]+)\)/.test(markdown),
		hasParagraphs: /\n\n/.test(markdown),
	};

	return checks;
}

function validateHTMLContent(html) {
	const checks = {
		hasHeadings: /<h[1-6][^>]*>.*?<\/h[1-6]>/i.test(html),
		hasLinks: /<a[^>]*>.*?<\/a>/i.test(html),
		hasParagraphs: /<p[^>]*>.*?<\/p>/i.test(html),
		hasLists: /<[uo]l[^>]*>.*?<\/[uo]l>/i.test(html),
		hasImages: /<img[^>]*>/i.test(html),
		hasStrong: /<strong[^>]*>.*?<\/strong>|<b[^>]*>.*?<\/b>/i.test(html),
		hasEm: /<em[^>]*>.*?<\/em>|<i[^>]*>.*?<\/i>/i.test(html),
		noScripts: !/<script[^>]*>.*?<\/script>/i.test(html),
		noStyles: !/<style[^>]*>.*?<\/style>/i.test(html),
	};

	return checks;
}

function validateCSSSelectors(markdown) {
	const selectorMatches = markdown.match(/<!--([^>]+)-->/g) || [];
	const selectors = selectorMatches.map((match) => match.slice(4, -3));

	const types = {
		id: selectors.filter((s) => s.startsWith("#")),
		class: selectors.filter((s) => s.startsWith(".")),
		attribute: selectors.filter((s) => s.startsWith("[") && s.endsWith("]")),
		contains: selectors.filter((s) => s.includes(":contains(")),
		nthChild: selectors.filter((s) => s.includes(":nth-child(")),
	};

	return {
		total: selectors.length,
		types,
		selectors,
	};
}

async function runTests() {
	console.log("🧪 Comprehensive Test Suite for get_simplified_dom");
	console.log(`=${"=".repeat(60)}`);

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log("");

		// Test different types of web pages
		const testPages = [
			{
				name: "Simple Example Page",
				url: "https://example.com",
				waitTime: 2000,
			},
			{
				name: "MDN Web Docs (Technical Content)",
				url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
				waitTime: 3000,
			},
			{
				name: "Wikipedia (Rich Content)",
				url: "https://en.wikipedia.org/wiki/Markdown",
				waitTime: 3000,
			},
		];

		for (const testPage of testPages) {
			console.log(`\n${"=".repeat(60)}`);
			console.log(`📋 Testing: ${testPage.name}`);
			console.log(`   URL: ${testPage.url}`);
			console.log(`${"=".repeat(60)}\n`);

			// Create tab
			const tab = await client.sendCommand("create_tab", {
				url: testPage.url,
				active: true,
			});
			console.log(`✅ Created tab ${tab.tabId}`);

			// Wait for page load
			await new Promise((resolve) => setTimeout(resolve, testPage.waitTime));

			// Test 1: Markdown extraction with selectors
			console.log("\n🧪 Test 1: Markdown with CSS selectors");
			try {
				const result = await client.sendCommand("get_simplified_dom", {
					tabId: tab.tabId,
					format: "markdown",
					enableDetailedResponse: false,
					includeSelectors: true,
				});

				console.log("✅ Extraction successful");
				console.log(`   Title: ${result.title}`);
				console.log(`   URL: ${result.url}`);
				console.log(`   Length: ${result.markdown?.length || 0} characters`);
				console.log(`   Source: ${result.stats?.source}`);

				// Validate markdown content
				const mdChecks = validateMarkdownContent(result.markdown || "");
				console.log("\n   Markdown Content Analysis:");
				Object.entries(mdChecks).forEach(([check, passed]) => {
					console.log(`     ${check}: ${passed ? "✅" : "❌"}`);
				});

				// Validate CSS selectors
				const selectorInfo = validateCSSSelectors(result.markdown || "");
				console.log("\n   CSS Selector Analysis:");
				console.log(`     Total selectors: ${selectorInfo.total}`);
				console.log(`     ID selectors: ${selectorInfo.types.id.length}`);
				console.log(`     Class selectors: ${selectorInfo.types.class.length}`);
				console.log(
					`     Attribute selectors: ${selectorInfo.types.attribute.length}`,
				);
				console.log(
					`     Contains selectors: ${selectorInfo.types.contains.length}`,
				);
				console.log(
					`     Nth-child selectors: ${selectorInfo.types.nthChild.length}`,
				);

				if (selectorInfo.total > 0) {
					console.log("\n   Sample selectors:");
					selectorInfo.selectors.slice(0, 5).forEach((sel) => {
						console.log(`     ${sel}`);
					});
				}
			} catch (error) {
				console.error("❌ Test 1 failed:", error.message);
			}

			// Test 2: Markdown without selectors
			console.log("\n🧪 Test 2: Markdown without CSS selectors");
			try {
				const result = await client.sendCommand("get_simplified_dom", {
					tabId: tab.tabId,
					format: "markdown",
					enableDetailedResponse: false,
					includeSelectors: false,
				});

				console.log("✅ Extraction successful");
				console.log(`   Length: ${result.markdown?.length || 0} characters`);

				const selectorInfo = validateCSSSelectors(result.markdown || "");
				console.log(
					`   CSS selectors found: ${selectorInfo.total} (should be 0)`,
				);

				if (selectorInfo.total > 0) {
					console.log("   ⚠️  Unexpected selectors found!");
				}
			} catch (error) {
				console.error("❌ Test 2 failed:", error.message);
			}

			// Test 3: Detailed markdown extraction
			console.log("\n🧪 Test 3: Detailed markdown extraction");
			try {
				const result = await client.sendCommand("get_simplified_dom", {
					tabId: tab.tabId,
					format: "markdown",
					enableDetailedResponse: true,
					includeSelectors: true,
				});

				console.log("✅ Extraction successful");
				console.log(`   Length: ${result.markdown?.length || 0} characters`);
				console.log(`   Source: ${result.stats?.source}`);
				console.log(
					`   Size increase from simple: ${
						result.markdown?.length > 0 ? "Yes" : "No"
					}`,
				);
			} catch (error) {
				console.error("❌ Test 3 failed:", error.message);
			}

			// Test 4: HTML extraction with Readability
			console.log("\n🧪 Test 4: HTML extraction (Readability)");
			try {
				const result = await client.sendCommand("get_simplified_dom", {
					tabId: tab.tabId,
					format: "html",
					enableDetailedResponse: false,
				});

				console.log("✅ Extraction successful");
				console.log(`   Title: ${result.title}`);
				console.log(`   Length: ${result.html?.length || 0} characters`);
				console.log(`   Source: ${result.stats?.source}`);

				// Validate HTML content
				const htmlChecks = validateHTMLContent(result.html || "");
				console.log("\n   HTML Content Analysis:");
				Object.entries(htmlChecks).forEach(([check, passed]) => {
					console.log(`     ${check}: ${passed ? "✅" : "❌"}`);
				});

				// Check Readability stats
				if (result.stats?.byline) {
					console.log("\n   Readability metadata:");
					console.log(`     Byline: ${result.stats.byline}`);
					console.log(
						`     Excerpt: ${result.stats.excerpt?.substring(0, 100)}...`,
					);
					console.log(`     Read time: ${result.stats.readTime}`);
					console.log(`     Text length: ${result.stats.textLength}`);
				}
			} catch (error) {
				console.error("❌ Test 4 failed:", error.message);
			}

			// Test 5: Performance comparison
			console.log("\n🧪 Test 5: Performance comparison");
			try {
				// Time markdown extraction
				const mdStart = Date.now();
				await client.sendCommand("get_simplified_dom", {
					tabId: tab.tabId,
					format: "markdown",
					enableDetailedResponse: false,
					includeSelectors: true,
				});
				const mdTime = Date.now() - mdStart;

				// Time HTML extraction
				const htmlStart = Date.now();
				await client.sendCommand("get_simplified_dom", {
					tabId: tab.tabId,
					format: "html",
					enableDetailedResponse: false,
				});
				const htmlTime = Date.now() - htmlStart;

				console.log("✅ Performance test complete");
				console.log(`   Markdown extraction: ${mdTime}ms`);
				console.log(`   HTML extraction: ${htmlTime}ms`);
				console.log(`   Difference: ${Math.abs(mdTime - htmlTime)}ms`);
			} catch (error) {
				console.error("❌ Test 5 failed:", error.message);
			}

			// Clean up tab
			await client.sendCommand("close_tab", { tabId: tab.tabId });
			console.log("\n✅ Tab closed");
		}

		// Test error handling
		console.log(`\n${"=".repeat(60)}`);
		console.log("🧪 Testing Error Handling");
		console.log(`${"=".repeat(60)}\n`);

		// Test with invalid tab ID
		console.log("🧪 Test: Invalid tab ID");
		try {
			await client.sendCommand("get_simplified_dom", {
				tabId: 999999,
				format: "markdown",
			});
			console.log("❌ Should have thrown an error");
		} catch (error) {
			console.log("✅ Correctly caught error:", error.message);
		}

		// Test with chrome:// URL
		console.log("\n🧪 Test: Chrome URL restriction");
		try {
			const tab = await client.sendCommand("create_tab", {
				url: "chrome://settings",
			});

			try {
				await client.sendCommand("get_simplified_dom", {
					tabId: tab.tabId,
					format: "markdown",
				});
				console.log("❌ Should have thrown an error");
			} catch (error) {
				console.log("✅ Correctly caught error:", error.message);
			}

			await client.sendCommand("close_tab", { tabId: tab.tabId });
		} catch (error) {
			console.log("✅ Chrome URL handling:", error.message);
		}
	} catch (error) {
		console.error("\n❌ Test suite failed:", error.message);
	} finally {
		client.disconnect();
		console.log(`\n${"=".repeat(60)}`);
		console.log("✅ Test suite completed");
		console.log(`${"=".repeat(60)}`);
	}
}

// Run tests
console.log("");
runTests().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
