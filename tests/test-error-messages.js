#!/usr/bin/env node
/**
 * Test error message accuracy for evaluate_js
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
			this.ws = new WebSocket('ws://localhost:9225?name=error_msg_test');

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

async function testErrorMessages() {
	console.log('🧪 Testing evaluate_js Error Messages');
	console.log('='.repeat(60));

	const client = new BROPTestClient();

	try {
		await client.connect();

		// Test with HTTP URL for accurate error messages
		console.log('\n📋 Creating tab with HTTP URL for accurate error testing...');
		const tab = await client.sendCommand('create_tab', {
			url: 'https://example.com',
			active: true
		});
		console.log(`✅ Created tab ${tab.tabId}`);
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 3000));

		// Test 1: Syntax error
		console.log('\n🧪 Test 1: Syntax error');
		console.log('Code: "this is not valid javascript"');
		try {
			await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'this is not valid javascript'
			});
			console.log('❌ Should have thrown an error');
		} catch (error) {
			console.log('✅ Caught error:', error.message);
		}

		// Test 2: Reference error
		console.log('\n🧪 Test 2: Reference error');
		console.log('Code: "nonExistentVariable"');
		try {
			await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'nonExistentVariable'
			});
			console.log('❌ Should have thrown an error');
		} catch (error) {
			console.log('✅ Caught error:', error.message);
		}

		// Test 3: Type error
		console.log('\n🧪 Test 3: Type error');
		console.log('Code: "null.property"');
		try {
			await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'null.property'
			});
			console.log('❌ Should have thrown an error');
		} catch (error) {
			console.log('✅ Caught error:', error.message);
		}

		// Test 4: Thrown error
		console.log('\n🧪 Test 4: Thrown error');
		console.log('Code: "throw new Error(\'Custom error message\')"');
		try {
			await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: "throw new Error('Custom error message')"
			});
			console.log('❌ Should have thrown an error');
		} catch (error) {
			console.log('✅ Caught error:', error.message);
		}

		// Test 5: Timeout (if supported)
		console.log('\n🧪 Test 5: Timeout test');
		console.log('Code: "while(true) {}" with 1s timeout');
		const startTime = Date.now();
		try {
			await client.sendCommand('evaluate_js', {
				tabId: tab.tabId,
				code: 'while(true) {}',
				timeout: 1000
			});
			console.log('❌ Should have timed out');
		} catch (error) {
			const duration = Date.now() - startTime;
			console.log(`✅ Caught error after ${duration}ms:`, error.message);
		}

		// Clean up
		console.log('\n🧹 Cleaning up...');
		await client.sendCommand('close_tab', { tabId: tab.tabId });
		console.log('✅ Test completed');

	} catch (error) {
		console.error('\n❌ Test suite failed:', error.message);
	} finally {
		client.disconnect();
	}
}

// Run tests
testErrorMessages()
	.then(() => process.exit(0))
	.catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});