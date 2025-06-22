#!/usr/bin/env node
/**
 * Test CSS selector extraction with a local HTML file
 */

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
			this.ws = new WebSocket('ws://localhost:9225?name=local_selector_test');

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
	console.log('🧪 Testing CSS Selector Extraction with Local HTML File');
	console.log(`=${'='.repeat(60)}`);

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log('');

		// Create tab with local test file
		const testFilePath = join(dirname(__dirname), 'test/test-selector-page.html');
		const testFileUrl = `file://${testFilePath}`;

		console.log('📋 Creating test tab with local HTML file...');
		console.log(`   URL: ${testFileUrl}`);

		const tab = await client.sendCommand('create_tab', {
			url: testFileUrl,
			active: true
		});
		console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
		console.log('');

		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Test with CSS selectors enabled
		console.log('🧪 Testing Markdown extraction WITH CSS selectors');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'markdown',
				enableDetailedResponse: false,
				includeSelectors: true
			});

			console.log('✅ Extraction successful');
			console.log(`   Title: ${result.title}`);
			console.log(`   Length: ${result.markdown?.length || 0} characters`);

			// Extract and analyze CSS selectors
			const selectorMatches = result.markdown?.match(/<!--([^>]+)-->/g) || [];
			const selectors = selectorMatches.map(match => match.slice(4, -3));

			console.log("\n📊 CSS Selector Analysis:");
			console.log(`   Total selectors found: ${selectors.length}`);

			// Categorize selectors
			const idSelectors = selectors.filter(s => s.startsWith('#'));
			const classSelectors = selectors.filter(s => s.startsWith('.'));
			const ariaSelectors = selectors.filter(s => s.includes('[aria-label='));
			const testIdSelectors = selectors.filter(s => s.includes('[data-testid='));
			const nameSelectors = selectors.filter(s => s.includes('[name='));
			const containsSelectors = selectors.filter(s => s.includes(':contains('));

			console.log(`   ID selectors: ${idSelectors.length}`);
			console.log(`   Class selectors: ${classSelectors.length}`);
			console.log(`   ARIA selectors: ${ariaSelectors.length}`);
			console.log(`   Test ID selectors: ${testIdSelectors.length}`);
			console.log(`   Name selectors: ${nameSelectors.length}`);
			console.log(`   Contains selectors: ${containsSelectors.length}`);

			// Show examples of each type
			console.log('\n📝 Selector Examples:');
			if (idSelectors.length > 0) {
				console.log(`   ID: ${idSelectors[0]}`);
			}
			if (classSelectors.length > 0) {
				console.log(`   Class: ${classSelectors[0]}`);
			}
			if (ariaSelectors.length > 0) {
				console.log(`   ARIA: ${ariaSelectors[0]}`);
			}
			if (testIdSelectors.length > 0) {
				console.log(`   Test ID: ${testIdSelectors[0]}`);
			}

			// Show sample markdown with selectors
			console.log('\n📄 Sample Markdown Output:');
			const lines = result.markdown?.split('\n') || [];
			const linesWithSelectors = lines.filter(line => line.includes('<!--'));
			for (const line of linesWithSelectors.slice(0, 5)) {
				console.log(`   ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
			}

		} catch (error) {
			console.error('❌ Test failed:', error.message);
		}

		// Clean up
		console.log('\n🧹 Cleaning up...');
		await client.sendCommand('close_tab', { tabId: tab.tabId });
		console.log('✅ Test tab closed');

	} catch (error) {
		console.error('\n❌ Test suite failed:', error.message);
	} finally {
		client.disconnect();
		console.log('\n✅ Test completed');
	}
}

// Run tests
console.log('');
runTests().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});