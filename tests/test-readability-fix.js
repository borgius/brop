#!/usr/bin/env node
/**
 * Quick test to verify Readability fix
 */

import WebSocket from "ws";

async function testReadability() {
	const ws = new WebSocket("ws://localhost:9225?name=readability_fix_test");

	return new Promise((resolve, reject) => {
		ws.on("open", async () => {
			console.log("✅ Connected to BROP server");

			try {
				// Create tab
				const createMsg = {
					id: "test_1",
					method: "create_tab",
					params: { url: "https://example.com" },
				};
				ws.send(JSON.stringify(createMsg));

				// Wait for response
				ws.on("message", async (data) => {
					const response = JSON.parse(data.toString());

					if (response.id === "test_1") {
						const tabId = response.result.tabId;
						console.log(`✅ Created tab ${tabId}`);

						// Wait a bit for page load
						setTimeout(() => {
							// Test HTML extraction
							const testMsg = {
								id: "test_2",
								method: "get_simplified_dom",
								params: {
									tabId: tabId,
									format: "html",
									enableDetailedResponse: false,
								},
							};
							ws.send(JSON.stringify(testMsg));
						}, 2000);
					}

					if (response.id === "test_2") {
						if (response.success) {
							console.log("✅ HTML extraction successful!");
							console.log(
								`   HTML length: ${response.result.html?.length || 0} chars`,
							);
							console.log(`   Source: ${response.result.stats?.source}`);

							// Close tab
							const closeMsg = {
								id: "test_3",
								method: "close_tab",
								params: { tabId: response.result.tabId },
							};
							ws.send(JSON.stringify(closeMsg));
						} else {
							console.error("❌ HTML extraction failed:", response.error);
						}
					}

					if (response.id === "test_3") {
						console.log("✅ Tab closed");
						ws.close();
						resolve();
					}
				});
			} catch (error) {
				console.error("❌ Error:", error);
				ws.close();
				reject(error);
			}
		});

		ws.on("error", (error) => {
			console.error("❌ WebSocket error:", error.message);
			reject(error);
		});
	});
}

console.log("🧪 Testing Readability fix...\n");
testReadability()
	.then(() => console.log("\n✅ Test completed successfully!"))
	.catch((error) => {
		console.error("\n❌ Test failed:", error);
		process.exit(1);
	});
