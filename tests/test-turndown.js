#!/usr/bin/env node
/**
 * Test script for Turndown library integration
 * Tests the refactored get_simplified_dom command with Turndown
 */

import WebSocket from 'ws';

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket('ws://localhost:9225?name=turndown_test');
			
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
	console.log('🧪 Testing Turndown integration in BROP extension');
	console.log(`=${'='.repeat(50)}`);
	
	const client = new BROPTestClient();
	
	try {
		// Connect to BROP server
		await client.connect();
		console.log('');
		
		// Create a test tab
		console.log('📋 Creating test tab...');
		const tab = await client.sendCommand('create_tab', {
			url: 'https://example.com',
			active: true
		});
		console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
		console.log('');
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		// Test 1: Basic markdown extraction
		console.log('🧪 Test 1: Basic markdown extraction');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'markdown',
				enableDetailedResponse: false
			});
			
			console.log('✅ Markdown extraction successful');
			console.log(`   Title: ${result.title}`);
			console.log(`   URL: ${result.url}`);
			console.log(`   Length: ${result.markdown?.length || 0} characters`);
			console.log(`   Source: ${result.stats?.source}`);
			console.log('   First 200 chars:', `${result.markdown?.substring(0, 200)}...`);
			console.log('');
		} catch (error) {
			console.error('❌ Test 1 failed:', error.message);
		}
		
		// Test 2: Detailed markdown extraction
		console.log('🧪 Test 2: Detailed markdown extraction');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'markdown',
				enableDetailedResponse: true
			});
			
			console.log('✅ Detailed markdown extraction successful');
			console.log(`   Length: ${result.markdown?.length || 0} characters`);
			console.log(`   Source: ${result.stats?.source}`);
			console.log('');
		} catch (error) {
			console.error('❌ Test 2 failed:', error.message);
		}
		
		// Test 3: HTML extraction (should still use Readability)
		console.log('🧪 Test 3: HTML extraction with Readability');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'html',
				enableDetailedResponse: false
			});
			
			console.log('✅ HTML extraction successful');
			console.log(`   Length: ${result.html?.length || 0} characters`);
			console.log(`   Source: ${result.stats?.source}`);
			console.log('');
		} catch (error) {
			console.error('❌ Test 3 failed:', error.message);
		}
		
		// Navigate to a more complex page
		console.log('📋 Testing with Wikipedia page...');
		await client.sendCommand('navigate', {
			tabId: tab.tabId,
			url: 'https://en.wikipedia.org/wiki/Markdown'
		});
		
		// Wait for navigation
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		// Test 4: Complex page markdown extraction
		console.log('🧪 Test 4: Wikipedia page markdown extraction');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'markdown',
				enableDetailedResponse: false
			});
			
			console.log('✅ Wikipedia markdown extraction successful');
			console.log(`   Title: ${result.title}`);
			console.log(`   Length: ${result.markdown?.length || 0} characters`);
			
			// Check for some expected markdown elements
			const hasHeaders = result.markdown?.includes('#');
			const hasLinks = result.markdown?.includes('[') && result.markdown?.includes(']');
			const hasBold = result.markdown?.includes('**') || result.markdown?.includes('__');
			
			console.log(`   Contains headers: ${hasHeaders ? '✅' : '❌'}`);
			console.log(`   Contains links: ${hasLinks ? '✅' : '❌'}`);
			console.log(`   Contains bold text: ${hasBold ? '✅' : '❌'}`);
			console.log('');
		} catch (error) {
			console.error('❌ Test 4 failed:', error.message);
		}
		
		// Clean up
		console.log('🧹 Cleaning up...');
		await client.sendCommand('close_tab', { tabId: tab.tabId });
		console.log('✅ Test tab closed');
		
	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
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