#!/usr/bin/env node
/**
 * Test script for CSS selector extraction in Turndown
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
			this.ws = new WebSocket('ws://localhost:9225?name=css_selector_test');
			
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
	console.log('🧪 Testing CSS Selector Extraction in Turndown');
	console.log('=' + '='.repeat(50));
	
	const client = new BROPTestClient();
	
	try {
		// Connect to BROP server
		await client.connect();
		console.log('');
		
		// Create a test tab with a page that has actionable elements
		console.log('📋 Creating test tab with GitHub...');
		const tab = await client.sendCommand('create_tab', {
			url: 'https://github.com/explore',
			active: true
		});
		console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
		console.log('');
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		// Test 1: Markdown with CSS selectors (default)
		console.log('🧪 Test 1: Markdown extraction WITH CSS selectors');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'markdown',
				enableDetailedResponse: false,
				includeSelectors: true
			});
			
			console.log('✅ Markdown extraction with selectors successful');
			console.log(`   Length: ${result.markdown?.length || 0} characters`);
			
			// Check for CSS selectors in comments
			const selectorMatches = result.markdown?.match(/<!--([^>]+)-->/g) || [];
			console.log(`   Found ${selectorMatches.length} CSS selectors`);
			
			if (selectorMatches.length > 0) {
				// Get unique selectors for better visibility
				const uniqueSelectors = [...new Set(selectorMatches)];
				console.log(`   Found ${uniqueSelectors.length} unique CSS selectors`);
				console.log('   Sample unique selectors:');
				uniqueSelectors.slice(0, 10).forEach(match => {
					console.log(`     ${match}`);
				});
			}
			
			// Check for different types of selectors
			const hasIdSelectors = result.markdown?.includes('<!--#');
			const hasClassSelectors = result.markdown?.includes('<!--.');
			const hasAriaSelectors = result.markdown?.includes('<!--[aria-label=');
			const hasDataTestIdSelectors = result.markdown?.includes('<!--[data-testid=');
			
			console.log(`   Has ID selectors: ${hasIdSelectors ? '✅' : '❌'}`);
			console.log(`   Has class selectors: ${hasClassSelectors ? '✅' : '❌'}`);
			console.log(`   Has aria-label selectors: ${hasAriaSelectors ? '✅' : '❌'}`);
			console.log(`   Has data-testid selectors: ${hasDataTestIdSelectors ? '✅' : '❌'}`);
			console.log('');
		} catch (error) {
			console.error('❌ Test 1 failed:', error.message);
		}
		
		// Test 2: Markdown without CSS selectors
		console.log('🧪 Test 2: Markdown extraction WITHOUT CSS selectors');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'markdown',
				enableDetailedResponse: false,
				includeSelectors: false
			});
			
			console.log('✅ Markdown extraction without selectors successful');
			console.log(`   Length: ${result.markdown?.length || 0} characters`);
			
			// Check that there are no CSS selectors
			const selectorMatches = result.markdown?.match(/<!--([^>]+)-->/g) || [];
			console.log(`   Found ${selectorMatches.length} CSS selectors (should be 0)`);
			
			if (selectorMatches.length > 0) {
				console.log('   ⚠️  Found unexpected selectors!');
			}
			console.log('');
		} catch (error) {
			console.error('❌ Test 2 failed:', error.message);
		}
		
		// Test 3: Navigate to a form page for input selectors
		console.log('📋 Testing with a form page...');
		await client.sendCommand('navigate', {
			tabId: tab.tabId,
			url: 'https://www.w3schools.com/html/html_forms.asp'
		});
		
		// Wait for navigation
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		// Test 3: Form elements with selectors
		console.log('🧪 Test 3: Form page with input selectors');
		try {
			const result = await client.sendCommand('get_simplified_dom', {
				tabId: tab.tabId,
				format: 'markdown',
				enableDetailedResponse: false,
				includeSelectors: true
			});
			
			console.log('✅ Form page extraction successful');
			
			// Look for various form-related selectors
			const allSelectors = result.markdown?.match(/<!--([^>]+)-->/g) || [];
			// Match format: [type: content]<!--selector-->
			const inputSelectors = result.markdown?.match(/\[(text|email|password|input|textarea|select):[^]]*?\]<!--[^>]+-->/gi) || [];
			const buttonSelectors = result.markdown?.match(/\[[^]]*?\]<!--[^>]*(button|submit|btn)[^>]*-->/gi) || [];
			
			console.log(`   Total selectors: ${allSelectors.length}`);
			console.log(`   Found ${inputSelectors.length} input-like selectors`);
			console.log(`   Found ${buttonSelectors.length} button-like selectors`);
			
			// Show some markdown content to debug
			const lines = result.markdown?.split('\n') || [];
			
			// Look for lines that might contain form elements
			const potentialFormLines = lines.filter(line => 
				line.includes('<!--') && (
					line.toLowerCase().includes('username') ||
					line.toLowerCase().includes('password') ||
					line.toLowerCase().includes('email') ||
					line.toLowerCase().includes('sign') ||
					line.toLowerCase().includes('log') ||
					line.includes('[') && line.includes(']')
				)
			);
			
			if (potentialFormLines.length > 0) {
				console.log('   Sample lines with selectors:');
				potentialFormLines.slice(0, 10).forEach(line => {
					console.log(`     ${line.trim()}`);
				});
			}
			
			// Also check the actual format of input elements in our implementation
			const inputPattern = /\[(text|email|password|input|textarea|select):[^]]*\]<!--([^>]+)-->/gi;
			const inputMatches = result.markdown?.match(inputPattern) || [];
			if (inputMatches.length > 0) {
				console.log(`   Found ${inputMatches.length} inputs with expected format`);
			}
			console.log('');
		} catch (error) {
			console.error('❌ Test 3 failed:', error.message);
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
runTests()
	.then(() => {
		process.exit(0);
	})
	.catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});