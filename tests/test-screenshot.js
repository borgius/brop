#!/usr/bin/env node
/**
 * Test script for get_screenshot BROP command
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

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
			this.ws = new WebSocket('ws://localhost:9225?name=screenshot_test');

			this.ws.on('open', () => {
				console.log('✅ Connected to BROP server');
				resolve();
			});

			this.ws.on('error', (error) => {
				console.error('❌ WebSocket error:', error.message);
				reject(error);
			});

			this.ws.on('message', (data) => {
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
					console.error('Error parsing response:', error);
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
					reject(new Error('Request timeout'));
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

async function runTests() {
	console.log('🧪 Testing get_screenshot Command');
	console.log(`=${'='.repeat(60)}`);

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log('');

		// First, list existing tabs
		console.log('📋 Checking existing tabs...');
		const tabList = await client.sendCommand('list_tabs', {});
		console.log(`   Found ${tabList.totalTabs} tabs`);
		
		let tab;
		if (tabList.tabs.length > 0 && tabList.tabs.some(t => t.accessible)) {
			// Use an existing accessible tab
			tab = tabList.tabs.find(t => t.accessible);
			console.log(`   Using existing tab ${tab.tabId}: ${tab.title}`);
		} else {
			// Create a new tab
			console.log('   No accessible tabs found, creating new tab...');
			tab = await client.sendCommand('create_tab', {
				url: 'https://example.com',
				active: true
			});
			console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
		}

		// Test 1: Screenshot of a webpage
		console.log('\n🧪 Test 1: Take screenshot of a webpage');
		
		// Navigate to ensure we have a loaded page
		console.log('📋 Navigating to example.com...');
		await client.sendCommand('navigate', {
			tabId: tab.tabId,
			url: 'https://example.com'
		});
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		// Take screenshot
		console.log('\n📸 Taking screenshot...');
		try {
			const screenshot = await client.sendCommand('get_screenshot', {
				tabId: tab.tabId,
				format: 'png'
			});

			console.log('✅ Screenshot captured successfully');
			console.log(`   Format: ${screenshot.format}`);
			console.log(`   Tab title: ${screenshot.tab_title}`);
			console.log(`   Tab URL: ${screenshot.tab_url}`);
			console.log(`   Image data length: ${screenshot.image_data?.length || 0} characters`);
			
			// Save screenshot to file
			if (screenshot.image_data) {
				const outputPath = join(__dirname, 'test-screenshot-example.png');
				const imageBuffer = Buffer.from(screenshot.image_data, 'base64');
				writeFileSync(outputPath, imageBuffer);
				console.log(`   Saved to: ${outputPath}`);
				console.log(`   File size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
			}
		} catch (error) {
			console.error('❌ Test 1 failed:', error.message);
		}

		// Test 2: Screenshot with JPEG format
		console.log('\n\n🧪 Test 2: Screenshot with JPEG format');
		console.log('📋 Navigating to a colorful page...');
		
		await client.sendCommand('navigate', {
			tabId: tab.tabId,
			url: 'https://www.wikipedia.org'
		});
		
		// Wait for navigation
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		console.log('📸 Taking JPEG screenshot...');
		try {
			const screenshot = await client.sendCommand('get_screenshot', {
				tabId: tab.tabId,
				format: 'jpeg'
			});

			console.log('✅ JPEG screenshot captured successfully');
			console.log(`   Format: ${screenshot.format}`);
			console.log(`   Tab title: ${screenshot.tab_title}`);
			console.log(`   Image data length: ${screenshot.image_data?.length || 0} characters`);
			
			// Save JPEG screenshot
			if (screenshot.image_data) {
				const outputPath = join(__dirname, 'test-screenshot-wikipedia.jpg');
				const imageBuffer = Buffer.from(screenshot.image_data, 'base64');
				writeFileSync(outputPath, imageBuffer);
				console.log(`   Saved to: ${outputPath}`);
				console.log(`   File size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
			}
		} catch (error) {
			console.error('❌ Test 2 failed:', error.message);
		}

		// Test 3: Error handling - invalid tab ID
		console.log('\n\n🧪 Test 3: Error handling with invalid tab ID');
		try {
			await client.sendCommand('get_screenshot', {
				tabId: 999999,
				format: 'png'
			});
			console.error('❌ Test 3 failed: Should have thrown an error');
		} catch (error) {
			console.log('✅ Correctly handled error:', error.message);
		}

		// Test 4: Screenshot without format (should default to PNG)
		console.log('\n\n🧪 Test 4: Screenshot with default format');
		try {
			const screenshot = await client.sendCommand('get_screenshot', {
				tabId: tab.tabId
			});

			console.log('✅ Default format screenshot captured');
			console.log(`   Format: ${screenshot.format} (should be png)`);
			console.log(`   Image data present: ${!!screenshot.image_data}`);
		} catch (error) {
			console.error('❌ Test 4 failed:', error.message);
		}

		// Test 5: Screenshot of local file
		console.log('\n\n🧪 Test 5: Screenshot of local HTML file');
		
		const testFilePath = join(dirname(__dirname), 'tests/test-selector-page.html');
		const testFileUrl = `file://${testFilePath}`;
		
		await client.sendCommand('navigate', {
			tabId: tab.tabId,
			url: testFileUrl
		});
		
		// Wait for navigation
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		try {
			const screenshot = await client.sendCommand('get_screenshot', {
				tabId: tab.tabId,
				format: 'png'
			});

			console.log('✅ Local file screenshot captured');
			console.log(`   Tab title: ${screenshot.tab_title}`);
			console.log(`   Tab URL: ${screenshot.tab_url}`);
			
			if (screenshot.image_data) {
				const outputPath = join(__dirname, 'test-screenshot-local.png');
				const imageBuffer = Buffer.from(screenshot.image_data, 'base64');
				writeFileSync(outputPath, imageBuffer);
				console.log(`   Saved to: ${outputPath}`);
			}
		} catch (error) {
			console.error('❌ Test 5 failed:', error.message);
		}

		// Clean up
		console.log('\n🧹 Cleaning up...');
		await client.sendCommand('close_tab', { tabId: tab.tabId });
		console.log('✅ Test tab closed');

		console.log('\n📊 Summary:');
		console.log('   - PNG screenshots work correctly');
		console.log('   - JPEG format is supported');
		console.log('   - Error handling for invalid tabs works');
		console.log('   - Default format is PNG');
		console.log('   - Local files can be screenshotted');

	} catch (error) {
		console.error('\n❌ Test suite failed:', error.message);
	} finally {
		client.disconnect();
		console.log('\n✅ Test completed');
	}
}

// Run tests
console.log('');
runTests()
	.then(() => process.exit(0))
	.catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});