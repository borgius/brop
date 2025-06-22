#!/usr/bin/env node
/**
 * Test script for element types and form boundaries in markdown output
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
			this.ws = new WebSocket('ws://localhost:9225?name=element_types_test');

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
	console.log('🧪 Testing Element Types and Form Boundaries');
	console.log(`=${'='.repeat(60)}`);

	const client = new BROPTestClient();

	try {
		// Connect to BROP server
		await client.connect();
		console.log('');

		// Test 1: W3Schools form page (has actual forms)
		console.log('🧪 Test 1: Real form page with actual <form> elements');
		console.log('📋 Creating tab with W3Schools form example...');
		
		const tab1 = await client.sendCommand('create_tab', {
			url: 'https://www.w3schools.com/html/html_forms.asp',
			active: true
		});
		console.log(`✅ Created tab ${tab1.tabId}: ${tab1.title}`);
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		// Extract with selectors
		console.log('\n📄 Extracting markdown with element types...\n');
		const result1 = await client.sendCommand('get_simplified_dom', {
			tabId: tab1.tabId,
			format: 'markdown',
			includeSelectors: true
		});

		// Analyze element types
		const elementTypes = new Set();
		const typeMatches = result1.markdown?.match(/<!--([^:]+):[^>]+-->/g) || [];
		typeMatches.forEach(match => {
			const type = match.match(/<!--([^:]+):/)?.[1];
			if (type) elementTypes.add(type);
		});

		console.log('📊 Element Types Found:');
		console.log(`   Total unique types: ${elementTypes.size}`);
		console.log(`   Types: ${Array.from(elementTypes).sort().join(', ')}`);

		// Check for form boundaries
		const formStarts = (result1.markdown?.match(/<!-- form-start/g) || []).length;
		const formEnds = (result1.markdown?.match(/<!-- form-end/g) || []).length;
		
		console.log('\n📋 Form Boundaries:');
		console.log(`   Form starts: ${formStarts}`);
		console.log(`   Form ends: ${formEnds}`);
		console.log(`   Forms properly closed: ${formStarts === formEnds ? '✅ Yes' : '❌ No'}`);

		// Show sample form structure
		const formPattern = /<!-- form-start[^>]*-->[\s\S]*?<!-- form-end -->/g;
		const forms = result1.markdown?.match(formPattern) || [];
		
		if (forms.length > 0) {
			console.log('\n📝 First Form Structure:');
			const firstForm = forms[0];
			const lines = firstForm.split('\n').slice(0, 10);
			lines.forEach(line => {
				if (line.trim()) {
					console.log(`   ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
				}
			});
			if (firstForm.split('\n').length > 10) {
				console.log('   ...');
			}
		}

		// Test 2: Local test file
		console.log('\n\n🧪 Test 2: Local test file with form elements');
		
		const testFilePath = join(dirname(__dirname), 'tests/test-selector-page.html');
		const testFileUrl = `file://${testFilePath}`;
		
		const tab2 = await client.sendCommand('create_tab', {
			url: testFileUrl,
			active: true
		});
		console.log(`✅ Created tab ${tab2.tabId}: ${tab2.title}`);
		
		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		// Extract with selectors
		const result2 = await client.sendCommand('get_simplified_dom', {
			tabId: tab2.tabId,
			format: 'markdown',
			includeSelectors: true
		});

		// Analyze element types in test file
		console.log('\n📊 Element Type Analysis:');
		
		// Count each type
		const typeCounts = {};
		const typeMatches2 = result2.markdown?.match(/<!--([^:]+):[^>]+-->/g) || [];
		typeMatches2.forEach(match => {
			const type = match.match(/<!--([^:]+):/)?.[1];
			if (type) {
				typeCounts[type] = (typeCounts[type] || 0) + 1;
			}
		});

		Object.entries(typeCounts).sort(([a], [b]) => a.localeCompare(b)).forEach(([type, count]) => {
			console.log(`   ${type}: ${count}`);
		});

		// Show examples of each element type
		console.log('\n📝 Element Type Examples:');
		const examples = {};
		const lines = result2.markdown?.split('\n') || [];
		lines.forEach(line => {
			const match = line.match(/\[([^\]]+)\]<!--([^:]+):([^>]+)-->/);
			if (match) {
				const [, content, type, selector] = match;
				if (!examples[type]) {
					examples[type] = { content, selector, line: line.substring(0, 80) };
				}
			}
		});

		Object.entries(examples).sort(([a], [b]) => a.localeCompare(b)).forEach(([type, example]) => {
			console.log(`   ${type}: ${example.line}${example.line.length === 80 ? '...' : ''}`);
		});

		// Clean up
		console.log('\n🧹 Cleaning up...');
		await client.sendCommand('close_tab', { tabId: tab1.tabId });
		await client.sendCommand('close_tab', { tabId: tab2.tabId });
		console.log('✅ Test tabs closed');

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