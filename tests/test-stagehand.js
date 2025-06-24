import { Stagehand } from "@browserbasehq/stagehand";
import { chromium } from "playwright";

const CDP_ENDPOINT = "http://localhost:19222";

async function runStagehandTest() {
	console.log("Starting Stagehand test with CDP bridge...");

	let browser;
	let stagehand;

	try {
		// First, connect Playwright to our CDP endpoint
		console.log("Connecting to CDP endpoint:", CDP_ENDPOINT);
		browser = await chromium.connectOverCDP(CDP_ENDPOINT);

		console.log("Browser connected successfully");

		// Get the default context
		const contexts = browser.contexts();
		let context = contexts[0];

		// If no context exists, create one
		if (!context) {
			context = await browser.newContext();
		}

		// Initialize Stagehand in LOCAL mode with custom browser
		stagehand = new Stagehand({
			env: "LOCAL",
			verbose: 2,
			headless: false,
			// Use a custom CDP URL that Stagehand will use internally
			localBrowserLaunchOptions: {
				cdpUrl: CDP_ENDPOINT,
			},
		});

		// Initialize Stagehand
		await stagehand.init();
		console.log("Stagehand initialized successfully");

		// Navigate to the GitHub page
		await stagehand.page.goto("https://github.com/browserbase/stagehand");
		console.log("Navigated to GitHub page");

		// Wait for the page to load
		await stagehand.page.waitForLoadState("networkidle");

		// Create an agent to extract the top contributor
		const agent = stagehand.agent();
		console.log("Agent created, executing task...");

		const { message, actions } = await agent.execute(
			"Extract the top contributor's username from this repository page",
		);

		console.log("\n=== Agent Results ===");
		console.log("Message:", message);
		console.log("Actions performed:", actions.length);
		actions.forEach((action, index) => {
			console.log(`\nAction ${index + 1}:`, JSON.stringify(action, null, 2));
		});

		// Alternative: Use extract directly for simpler data extraction
		console.log("\n=== Alternative: Direct Extraction ===");
		const extractResult = await stagehand.page.extract({
			instruction: "Find the top contributor's username",
			schema: {
				username: {
					type: "string",
					description: "The GitHub username of the top contributor",
				},
			},
		});

		console.log("Direct extraction result:", extractResult);
	} catch (error) {
		console.error("Test failed:", error);
		throw error;
	} finally {
		// Cleanup
		if (stagehand) {
			await stagehand.close();
		}
		if (browser) {
			await browser.close();
		}
		console.log("\nTest completed");
	}
}

// Run the test
runStagehandTest().catch(console.error);
