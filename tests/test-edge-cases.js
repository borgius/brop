#!/usr/bin/env node
/**
 * Test edge cases for evaluate_js
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
			this.ws = new WebSocket('ws://localhost:9225?name=edge_case_test');

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

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function runEdgeCaseTests() {
	console.log('🧪 Edge Case Tests for evaluate_js');
	console.log('='.repeat(60));

	const client = new BROPTestClient();

	try {
		await client.connect();

		// Create test tab
		const testFilePath = join(dirname(__dirname), 'tests/test-selector-page.html');
		const testFileUrl = `file://${testFilePath}`;
		
		const tab = await client.sendCommand('create_tab', {
			url: testFileUrl,
			active: true
		});
		console.log(`✅ Created tab ${tab.tabId}\n`);
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Test 1: Syntax error
		console.log('\n🧪 Test 1: Syntax error');
		console.log('Code: "this is not valid javascript"');
		try {
			const result = await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'this is not valid javascript'
			});
			console.log('Unexpected success:', JSON.stringify(result, null, 2));
		} catch (error) {
			console.log('✅ Correctly caught error:', error.message);
		}

		// Test 2: Infinite loop with short timeout
		console.log('\n🧪 Test 2: Infinite loop with timeout');
		console.log('Code: "while(true) {}"');
		console.log('Timeout: 1000ms');
		try {
			const startTime = Date.now();
			const result = await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'while(true) {}',
				timeout: 1000
			});
			const duration = Date.now() - startTime;
			console.log('Unexpected success after', duration, 'ms:', JSON.stringify(result, null, 2));
		} catch (error) {
			console.log('✅ Correctly caught timeout:', error.message);
		}

		// Test 3: Return non-serializable object
		console.log('\n🧪 Test 3: Non-serializable object (window)');
		console.log('Code: "window"');
		try {
			const result = await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'window',
				returnByValue: true
			});
			console.log('Result:', JSON.stringify(result, null, 2));
		} catch (error) {
			console.log('Error:', error.message);
		}

		// Test 4: Return by reference
		console.log('\n🧪 Test 4: Return by reference (document)');
		console.log('Code: "document"');
		console.log('returnByValue: false');
		try {
			const result = await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'document',
				returnByValue: false
			});
			console.log('Result:', JSON.stringify(result, null, 2));
		} catch (error) {
			console.log('Error:', error.message);
		}

		// Test 5: Code that throws an error
		console.log('\n🧪 Test 5: Code that throws an error');
		console.log('Code: "throw new Error(\'Test error\')"');
		try {
			const result = await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'throw new Error("Test error")'
			});
			console.log('Unexpected success:', JSON.stringify(result, null, 2));
		} catch (error) {
			console.log('✅ Correctly caught thrown error:', error.message);
		}

		// Test 6: undefined result
		console.log('\n🧪 Test 6: Undefined result');
		console.log('Code: "undefined"');
		try {
			const result = await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'undefined'
			});
			console.log('Result:', JSON.stringify(result, null, 2));
		} catch (error) {
			console.log('Error:', error.message);
		}

		// Clean up
		await client.sendCommand('close_tab', { tabId: tab.tabId });
		console.log('\n✅ Test completed');

	} catch (error) {
		console.error('\n❌ Test suite failed:', error.message);
	} finally {
		client.disconnect();
	}
}

// Run tests
runEdgeCaseTests()
	.then(() => process.exit(0))
	.catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});