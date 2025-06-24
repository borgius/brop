import { chromium } from "playwright";

async function launchChromeWithDebugPort() {
	const browser = await chromium.launch({
		headless: false,
		args: [
			"--remote-debugging-port=9222",
			"--no-first-run",
			"--disable-background-timer-throttling",
			"--disable-renderer-backgrounding",
			"--disable-backgrounding-occluded-windows",
		],
	});

	const page = await browser.newPage();
	await page.goto("https://example.com");

	console.log("Chrome launched with debug port 9222");
	console.log("You can now connect to http://localhost:9222");

	// Keep browser open
	// await browser.close();
}

launchChromeWithDebugPort().catch(console.error);
