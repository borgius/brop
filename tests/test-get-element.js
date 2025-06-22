#!/usr/bin/env node
/**
 * Test script for get_element command
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
			this.ws = new WebSocket('ws://localhost:9225?name=get_element_test');

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
	console.log('🧪 Testing get_element Command');
	console.log(`=${'='.repeat(60)}`);

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log('');

		// Create tab with local test file
		const testFilePath = join(dirname(__dirname), 'tests/test-selector-page.html');
		const testFileUrl = `file://${testFilePath}`;

		console.log('📋 Creating test tab with local HTML file...');
		const tab = await client.sendCommand('create_tab', {
			url: testFileUrl,
			active: true
		});
		console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
		console.log('');

		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Test 1: Find single element by ID
		console.log('🧪 Test 1: Find single element by ID');
		try {
			const result = await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: '#submit-button'
			});

			console.log('✅ Found element:');
			console.log(`   Tag: ${result.element.tagName}`);
			console.log(`   ID: ${result.element.id}`);
			console.log(`   Text: ${result.element.textContent}`);
			console.log(`   Visible: ${result.element.isVisible}`);
			console.log(`   Clickable: ${result.element.isClickable}`);
			console.log(`   Position: ${result.element.boundingBox.x}, ${result.element.boundingBox.y}`);
			console.log(`   Size: ${result.element.boundingBox.width}x${result.element.boundingBox.height}`);
		} catch (error) {
			console.error('❌ Test 1 failed:', error.message);
		}

		// Test 2: Find input element by name
		console.log('\n🧪 Test 2: Find input element by name attribute');
		try {
			const result = await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: '[name="email"]'
			});

			console.log('✅ Found input element:');
			console.log(`   Tag: ${result.element.tagName}`);
			console.log(`   Type: ${result.element.type}`);
			console.log(`   Name: ${result.element.name}`);
			console.log(`   Placeholder: ${result.element.placeholder}`);
			console.log(`   Value: ${result.element.value || '(empty)'}`);
			console.log(`   Required: ${result.element.required}`);
		} catch (error) {
			console.error('❌ Test 2 failed:', error.message);
		}

		// Test 3: Find multiple elements
		console.log('\n🧪 Test 3: Find multiple button elements');
		try {
			const result = await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: 'button',
				multiple: true
			});

			console.log(`✅ Found ${result.found} button elements:`);
			for (const [index, element] of result.elements.entries()) {
				console.log(`   Button ${index + 1}:`);
				console.log(`     ID: ${element.id || '(none)'}`);
				console.log(`     Text: ${element.textContent}`);
				console.log(`     Classes: ${element.classList.join(', ') || '(none)'}`);
			}
		} catch (error) {
			console.error('❌ Test 3 failed:', error.message);
		}

		// Test 4: Find element with ARIA properties
		console.log('\n🧪 Test 4: Find element with ARIA properties');
		try {
			const result = await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: '[aria-label="Save changes"]'
			});

			console.log('✅ Found ARIA element:');
			console.log(`   Tag: ${result.element.tagName}`);
			console.log(`   ARIA Label: ${result.element.ariaLabel}`);
			console.log(`   Role: ${result.element.role || '(none)'}`);
			console.log(`   Text: ${result.element.textContent}`);
		} catch (error) {
			console.error('❌ Test 4 failed:', error.message);
		}

		// Test 5: Find select element and check options
		console.log('\n🧪 Test 5: Find select element with options');
		try {
			const result = await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: 'select[name="country"]'
			});

			console.log('✅ Found select element:');
			console.log(`   Name: ${result.element.name}`);
			console.log(`   Options: ${result.element.options?.length || 0}`);
			if (result.element.options) {
				for (const option of result.element.options) {
					console.log(`     - ${option.text} (value: ${option.value})${option.selected ? ' [selected]' : ''}`);
				}
			}
		} catch (error) {
			console.error('❌ Test 5 failed:', error.message);
		}

		// Test 6: Test error handling - non-existent element
		console.log('\n🧪 Test 6: Error handling - non-existent element');
		try {
			await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: '#non-existent-element'
			});
			console.log('❌ Should have thrown an error');
		} catch (error) {
			console.log('✅ Correctly caught error:', error.message);
		}

		// Test 7: Get element with data attributes
		console.log('\n🧪 Test 7: Element with data attributes');
		try {
			const result = await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: '[data-testid="cancel-btn"]'
			});

			console.log('✅ Found element with data attributes:');
			console.log(`   Tag: ${result.element.tagName}`);
			console.log(`   Data attributes:`, result.element.dataAttributes);
			console.log(`   Text: ${result.element.textContent}`);
		} catch (error) {
			console.error('❌ Test 7 failed:', error.message);
		}

		// Test 8: Check computed styles
		console.log('\n🧪 Test 8: Check computed styles');
		try {
			const result = await client.sendCommand('get_element', {
				tabId: tab.tabId,
				selector: '.btn-primary'
			});

			console.log('✅ Element computed styles:');
			console.log(`   Display: ${result.element.computedStyle.display}`);
			console.log(`   Color: ${result.element.computedStyle.color}`);
			console.log(`   Background: ${result.element.computedStyle.backgroundColor}`);
			console.log(`   Font Size: ${result.element.computedStyle.fontSize}`);
			console.log(`   Cursor: ${result.element.computedStyle.cursor}`);
		} catch (error) {
			console.error('❌ Test 8 failed:', error.message);
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
runTests()
	.then(() => process.exit(0))
	.catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});