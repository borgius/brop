#!/usr/bin/env node
/**
 * Test script for get_page_content BROP command
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
			this.ws = new WebSocket('ws://localhost:9225?name=page_content_test');

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
	console.log('🧪 Testing get_page_content Command');
	console.log(`=${'='.repeat(60)}`);
	console.log('\nThis command returns the full HTML and text content of a page.\n');

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log('');

		// Check extension status first
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

		// Test 1: Get content from a simple webpage
		console.log('\n🧪 Test 1: Get content from example.com');
		console.log('📋 Creating tab with example.com...');
		
		const tab1 = await client.sendCommand('create_tab', {
			url: 'https://example.com',
			active: true
		});
		console.log(`✅ Created tab ${tab1.tabId}: ${tab1.title}`);
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		// Get page content
		console.log('\n📄 Getting page content...');
		try {
			const content = await client.sendCommand('get_page_content', {
				tabId: tab1.tabId
			});

			console.log('✅ Page content retrieved successfully');
			console.log(`   Title: ${content.title}`);
			console.log(`   URL: ${content.url}`);
			console.log(`   HTML length: ${content.html?.length || 0} characters`);
			console.log(`   Text length: ${content.text?.length || 0} characters`);
			
			// Save HTML to file
			if (content.html) {
				const outputPath = join(__dirname, 'page-content-example.html');
				writeFileSync(outputPath, content.html);
				console.log(`   HTML saved to: ${outputPath}`);
			}
			
			// Show first few lines of text content
			if (content.text) {
				console.log('\n📝 Text content preview:');
				const lines = content.text.split('\n').filter(line => line.trim());
				lines.slice(0, 5).forEach(line => {
					console.log(`   ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
				});
				if (lines.length > 5) {
					console.log(`   ... and ${lines.length - 5} more lines`);
				}
			}
			
			// Basic HTML validation
			console.log('\n📊 Content validation:');
			console.log(`   Has DOCTYPE: ${content.html?.includes('<!DOCTYPE') ? '✅ Yes' : '❌ No'}`);
			console.log(`   Has <html>: ${content.html?.includes('<html') ? '✅ Yes' : '❌ No'}`);
			console.log(`   Has <head>: ${content.html?.includes('<head') ? '✅ Yes' : '❌ No'}`);
			console.log(`   Has <body>: ${content.html?.includes('<body') ? '✅ Yes' : '❌ No'}`);
			
		} catch (error) {
			console.error('❌ Test 1 failed:', error.message);
		}

		// Test 2: Get content from a complex webpage
		console.log('\n\n🧪 Test 2: Get content from a complex webpage');
		console.log('📋 Navigating to Wikipedia...');
		
		await client.sendCommand('navigate', {
			tabId: tab1.tabId,
			url: 'https://en.wikipedia.org/wiki/Main_Page'
		});
		
		// Wait for navigation
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		console.log('📄 Getting page content...');
		try {
			const content = await client.sendCommand('get_page_content', {
				tabId: tab1.tabId
			});

			console.log('✅ Complex page content retrieved');
			console.log(`   Title: ${content.title}`);
			console.log(`   URL: ${content.url}`);
			console.log(`   HTML length: ${content.html?.length || 0} characters`);
			console.log(`   Text length: ${content.text?.length || 0} characters`);
			
			// Analyze HTML structure
			if (content.html) {
				const linkCount = (content.html.match(/<a\s/g) || []).length;
				const imgCount = (content.html.match(/<img\s/g) || []).length;
				const formCount = (content.html.match(/<form\s/g) || []).length;
				const scriptCount = (content.html.match(/<script/g) || []).length;
				const styleCount = (content.html.match(/<style/g) || []).length;
				
				console.log('\n📊 HTML Structure Analysis:');
				console.log(`   Links: ${linkCount}`);
				console.log(`   Images: ${imgCount}`);
				console.log(`   Forms: ${formCount}`);
				console.log(`   Scripts: ${scriptCount}`);
				console.log(`   Styles: ${styleCount}`);
			}
			
		} catch (error) {
			console.error('❌ Test 2 failed:', error.message);
		}

		// Test 3: Local HTML file
		console.log('\n\n🧪 Test 3: Get content from local HTML file');
		
		const testFilePath = join(dirname(__dirname), 'tests/test-selector-page.html');
		const testFileUrl = `file://${testFilePath}`;
		
		await client.sendCommand('navigate', {
			tabId: tab1.tabId,
			url: testFileUrl
		});
		
		// Wait for navigation
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		try {
			const content = await client.sendCommand('get_page_content', {
				tabId: tab1.tabId
			});

			console.log('✅ Local file content retrieved');
			console.log(`   Title: ${content.title}`);
			console.log(`   URL: ${content.url}`);
			console.log(`   HTML length: ${content.html?.length || 0} characters`);
			console.log(`   Text length: ${content.text?.length || 0} characters`);
			
			// Check for form elements in our test file
			if (content.html) {
				const hasUsernameField = content.html.includes('id="username"');
				const hasPasswordField = content.html.includes('type="password"');
				const hasSelectField = content.html.includes('<select');
				const hasTextarea = content.html.includes('<textarea');
				
				console.log('\n📊 Form Elements Check:');
				console.log(`   Username field: ${hasUsernameField ? '✅ Found' : '❌ Not found'}`);
				console.log(`   Password field: ${hasPasswordField ? '✅ Found' : '❌ Not found'}`);
				console.log(`   Select field: ${hasSelectField ? '✅ Found' : '❌ Not found'}`);
				console.log(`   Textarea: ${hasTextarea ? '✅ Found' : '❌ Not found'}`);
			}
			
		} catch (error) {
			console.error('❌ Test 3 failed:', error.message);
		}

		// Test 4: Error handling - invalid tab ID
		console.log('\n\n🧪 Test 4: Error handling with invalid tab ID');
		try {
			await client.sendCommand('get_page_content', {
				tabId: 999999
			});
			console.error('❌ Test 4 failed: Should have thrown an error');
		} catch (error) {
			console.log('✅ Correctly handled error:', error.message);
		}

		// Test 5: Compare with get_simplified_dom
		console.log('\n\n🧪 Test 5: Compare with get_simplified_dom');
		try {
			// Get both page content and simplified DOM
			const pageContent = await client.sendCommand('get_page_content', {
				tabId: tab1.tabId
			});
			
			const simplifiedDom = await client.sendCommand('get_simplified_dom', {
				tabId: tab1.tabId,
				format: 'html',
				enableDetailedResponse: false
			});

			console.log('📊 Comparison:');
			console.log(`   get_page_content HTML: ${pageContent.html?.length || 0} chars`);
			console.log(`   get_simplified_dom HTML: ${simplifiedDom.html?.length || 0} chars`);
			console.log(`   Reduction: ${Math.round((1 - (simplifiedDom.html?.length || 0) / (pageContent.html?.length || 1)) * 100)}%`);
			console.log('\n   Note: get_simplified_dom uses Readability to extract main content');
			console.log('   while get_page_content returns the full DOM');
			
		} catch (error) {
			console.error('❌ Test 5 failed:', error.message);
		}

		// Clean up
		console.log('\n🧹 Cleaning up...');
		await client.sendCommand('close_tab', { tabId: tab1.tabId });
		console.log('✅ Test tab closed');

		console.log('\n📊 Summary:');
		console.log('   - get_page_content returns complete HTML and text');
		console.log('   - HTML includes all elements, scripts, and styles');
		console.log('   - Text is extracted using innerText');
		console.log('   - Works with both remote and local files');
		console.log('   - Provides title and URL metadata');

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