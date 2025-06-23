#!/usr/bin/env node
/**
 * Simple test for get_screenshot - assumes Chrome is open with extension loaded
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
			this.ws = new WebSocket('ws://localhost:9225?name=screenshot_simple_test');

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

async function runTest() {
	console.log('🧪 Simple Screenshot Test');
	console.log(`=${'='.repeat(60)}`);
	console.log('\nPrerequisites:');
	console.log('1. Chrome browser is open');
	console.log('2. BROP extension is loaded and connected');
	console.log('3. Bridge server is running (pnpm run dev)');
	console.log('');

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();

		// Check extension status
		console.log('📋 Checking extension status...');
		try {
			const version = await client.sendCommand('get_extension_version', {});
			console.log(`✅ Extension connected: ${version.result.extension_name} v${version.result.extension_version}`);
		} catch (error) {
			console.error('❌ Extension not connected:', error.message);
			console.log('\nPlease ensure:');
			console.log('1. Chrome extension is loaded');
			console.log('2. Bridge server is running (pnpm run dev)');
			console.log('3. Extension popup shows "Connected"');
			return;
		}

		// List tabs
		console.log('\n📋 Listing available tabs...');
		const tabList = await client.sendCommand('list_tabs', {});
		console.log(`Found ${tabList.totalTabs} tabs (${tabList.accessibleTabs} accessible)`);
		
		let tab;
		if (tabList.accessibleTabs === 0) {
			console.log('\n📋 No accessible tabs found, creating a new one...');
			try {
				tab = await client.sendCommand('create_tab', {
					url: 'https://example.com',
					active: true
				});
				console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
				
				// Wait for tab to load
				console.log('⏳ Waiting for page to load...');
				await new Promise(resolve => setTimeout(resolve, 2000));
			} catch (error) {
				console.error('❌ Failed to create tab:', error.message);
				console.log('\nPossible reasons:');
				console.log('1. No Chrome window is open');
				console.log('2. Chrome is in a special state');
				console.log('3. Extension permissions issue');
				return;
			}
		} else {
			// Use the first accessible tab
			tab = tabList.tabs.find(t => t.accessible);
			console.log(`\nUsing existing tab ${tab.tabId}: ${tab.title}`);
			console.log(`URL: ${tab.url}`);
		}

		// Take screenshot
		console.log('\n📸 Taking screenshot...');
		const startTime = Date.now();
		
		try {
			const screenshot = await client.sendCommand('get_screenshot', {
				tabId: tab.tabId,
				format: 'png'
			});

			const elapsed = Date.now() - startTime;
			console.log(`✅ Screenshot captured in ${elapsed}ms`);
			console.log(`   Format: ${screenshot.format}`);
			console.log(`   Tab title: ${screenshot.tab_title}`);
			console.log(`   Tab URL: ${screenshot.tab_url}`);
			console.log(`   Image data length: ${screenshot.image_data?.length || 0} characters`);
			
			// Save screenshot
			if (screenshot.image_data) {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				const outputPath = join(__dirname, `screenshot-${timestamp}.png`);
				const imageBuffer = Buffer.from(screenshot.image_data, 'base64');
				writeFileSync(outputPath, imageBuffer);
				console.log(`   Saved to: ${outputPath}`);
				console.log(`   File size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
				
				// Basic validation
				console.log('\n📊 Screenshot validation:');
				console.log(`   PNG signature: ${imageBuffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? '✅ Valid' : '❌ Invalid'}`);
				console.log(`   Has content: ${imageBuffer.length > 1000 ? '✅ Yes' : '❌ Too small'}`);
			}
		} catch (error) {
			console.error('❌ Screenshot failed:', error.message);
		}

		// Test JPEG format
		console.log('\n📸 Testing JPEG format...');
		try {
			const screenshot = await client.sendCommand('get_screenshot', {
				tabId: tab.tabId,
				format: 'jpeg'
			});

			console.log('✅ JPEG screenshot captured');
			console.log(`   Format: ${screenshot.format}`);
			console.log(`   Image data length: ${screenshot.image_data?.length || 0} characters`);
			
			if (screenshot.image_data) {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				const outputPath = join(__dirname, `screenshot-${timestamp}.jpg`);
				const imageBuffer = Buffer.from(screenshot.image_data, 'base64');
				writeFileSync(outputPath, imageBuffer);
				console.log(`   Saved to: ${outputPath}`);
				console.log(`   File size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
				
				// JPEG validation
				console.log(`   JPEG signature: ${imageBuffer.slice(0, 3).toString('hex') === 'ffd8ff' ? '✅ Valid' : '❌ Invalid'}`);
			}
		} catch (error) {
			console.error('❌ JPEG screenshot failed:', error.message);
		}

	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
	} finally {
		client.disconnect();
		console.log('\n✅ Test completed');
	}
}

// Run test
console.log('');
runTest()
	.then(() => process.exit(0))
	.catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});