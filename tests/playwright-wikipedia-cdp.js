import { chromium } from "playwright";

async function testWikipediaCDP() {
	console.log("🎭 Playwright Wikipedia CDP Test");
	console.log("================================\n");
	let browser;
	const port = 9222;
	if (process.env.RUN_BROWSER) {
		console.log("🚀 Launching browser with remote debugging port...");
		browser = await chromium.launch({
			headless: false,
			args: [`--remote-debugging-port=${port}`],
		});

		console.log(
			`✅ Browser launched with remote debugging available at http://localhost:${port}`,
		);
	}

	try {
		// Connect directly to Bridge server instead of proxy
		const bridgePort = 9222;
		console.log(`📡 Connecting to CDP on port ${bridgePort}...`);
		browser = await chromium.connectOverCDP(`http://localhost:${bridgePort}`);
		console.log("✅ Connected to browser via CDP\n");

		// Get the default context
		const context = browser.contexts()[0];
		if (!context) {
			throw new Error("No browser context found");
		}

		// Create a new page
		console.log("📄 Creating new page...");
		const page = await context.newPage();
		console.log("✅ Page created\n");

		// Navigate to Wikipedia
		console.log("🌐 Navigating to Wikipedia...");
		await page.goto("https://en.wikipedia.org/wiki/Main_Page", {
			waitUntil: "networkidle",
			timeout: 30000,
		});
		console.log("✅ Navigation complete\n");

		// Wait for content to load
		await page.waitForSelector("#mp-welcome", { timeout: 10000 });

		// Extract various text elements
		console.log("📝 Extracting content from Wikipedia:\n");

		// 1. Get the welcome message
		const welcomeText = await page.textContent("#mp-welcome");
		console.log("1. Welcome Message:");
		console.log(`   "${welcomeText}"\n`);

		// 2. Get today's featured article title - use the correct selector
		let featuredTitle = "Not found";
		try {
			// The heading has id="mp-tfa-h2"
			const heading = await page.$("#mp-tfa-h2");
			if (heading) {
				featuredTitle = (await heading.textContent()) || "Not found";
				featuredTitle = featuredTitle.trim();
			}
		} catch (e) {
			// If selector fails, just use default
		}
		console.log("2. Featured Article Section:");
		console.log(`   "${featuredTitle}"\n`);

		// 3. Get the first paragraph of featured article
		let featuredContent = "Featured article content not found";
		try {
			// The featured article content is in #mp-tfa div, first p element
			const featuredPara = await page.$("#mp-tfa p");
			if (featuredPara) {
				const text = await featuredPara.textContent();
				featuredContent = text?.trim() || "";
				// Limit to first 200 characters for readability
				if (featuredContent.length > 200) {
					featuredContent = `${featuredContent.substring(0, 200)}...`;
				}
			}
		} catch (e) {
			// Use default if selector fails
		}
		console.log("3. Featured Article Preview:");
		console.log(`   "${featuredContent}"\n`);

		// 4. Get "In the news" section
		let newsItems = [];
		try {
			// News items are in #mp-itn ul li elements
			newsItems = await page.$$eval("#mp-itn > ul > li", (items) =>
				items
					.slice(0, 3)
					.map((li) => li.textContent?.trim() || "")
					.filter((text) => text),
			);
		} catch (e) {
			// Use empty array if selector fails
		}
		console.log("4. In The News (first 3 items):");
		newsItems.forEach((item, i) => {
			console.log(
				`   ${i + 1}. ${item.substring(0, 100)}${item.length > 100 ? "..." : ""}`,
			);
		});
		console.log("");

		// 5. Count total links on the page
		const linkCount = await page.$$eval("a", (links) => links.length);
		console.log(`5. Total Links on Page: ${linkCount}\n`);

		// 6. Get page title
		const pageTitle = await page.title();
		console.log(`6. Page Title: "${pageTitle}"\n`);

		// Take a screenshot
		console.log("📸 Taking screenshot...");
		await page.screenshot({
			path: "wikipedia-screenshot.png",
			fullPage: false,
		});
		console.log("✅ Screenshot saved as wikipedia-screenshot.png\n");

		// Search for a specific term
		console.log('🔍 Performing search for "artificial intelligence"...');
		await page.fill("#searchInput", "artificial intelligence");
		await page.press("#searchInput", "Enter");

		// Just wait a bit for the page to load
		await page.waitForTimeout(3000);
		console.log("✅ Search complete\n");

		// Get the article title
		const articleTitle = await page.textContent("h1.firstHeading");
		console.log(`7. Article Title: "${articleTitle}"\n`);

		// Get the first paragraph of the article
		const firstParagraph = await page.$eval(
			"#mw-content-text .mw-parser-output > p:first-of-type",
			(el) => {
				const text = el.textContent?.trim() || "";
				return text.length > 300 ? `${text.substring(0, 300)}...` : text;
			},
		);
		console.log("8. First Paragraph:");
		console.log(`   "${firstParagraph}"\n`);

		console.log("✅ Test completed successfully!");
	} catch (error) {
		console.error("❌ Test failed:", error.message);
		console.error("Stack:", error.stack);
		process.exit(1);
	} finally {
		if (browser) {
			console.log("\n🔌 Closing browser connection...");
			await browser.close();
			console.log("✅ Browser connection closed");
		}
	}
}

// Run the test
console.log("Starting Playwright Wikipedia CDP test...\n");
testWikipediaCDP()
	.then(() => {
		console.log("\n✨ All tests passed!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("\n💥 Unexpected error:", error);
		process.exit(1);
	});
