#!/usr/bin/env node
/**
 * Demo script to showcase human-like typing
 */

import WebSocket from 'ws';

console.log('🎭 Human-Like Typing Demo');
console.log('========================\n');
console.log('This demo shows the difference between regular and human-like typing.\n');

class BROPTestClient {
	constructor() {
		this.ws = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
	}

	async connect() {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket('ws://localhost:9225?name=typing_demo');

			this.ws.on('open', () => {
				resolve();
			});

			this.ws.on('error', (error) => {
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
		const id = `demo_${++this.messageId}`;
		const message = { id, method, params };

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.ws.send(JSON.stringify(message));

			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 60000); // 60 second timeout for demo
		});
	}

	disconnect() {
		if (this.ws) {
			this.ws.close();
		}
	}
}

async function runDemo() {
	const client = new BROPTestClient();

	try {
		console.log('🔌 Connecting to BROP server...');
		await client.connect();
		console.log('✅ Connected\n');

		// Create a demo page
		console.log('📋 Creating demo page...');
		const tab = await client.sendCommand('create_tab', {
			url: 'data:text/html,<html><body style="font-family: Arial, sans-serif; padding: 40px;"><h1>Human-Like Typing Demo</h1><div style="margin: 20px 0;"><label>Regular Typing:</label><br><input id="regular" type="text" style="width: 400px; padding: 10px; font-size: 16px;" placeholder="Watch regular typing here..."></div><div style="margin: 20px 0;"><label>Human-Like Typing:</label><br><input id="human" type="text" style="width: 400px; padding: 10px; font-size: 16px;" placeholder="Watch human-like typing here..."></div><div style="margin-top: 30px; padding: 20px; background: #f0f0f0; border-radius: 5px;"><h3>Notice the differences:</h3><ul><li>Variable typing speed</li><li>Occasional typos that get corrected</li><li>Natural pauses</li><li>More realistic feel</li></ul></div></body></html>',
			active: true
		});
		console.log('✅ Demo page created\n');

		// Wait for page to load
		await new Promise(resolve => setTimeout(resolve, 2000));

		const demoText = 'Hello, this is a demonstration of typing behavior!';

		// Demo 1: Regular typing
		console.log('🤖 Demo 1: Regular typing (consistent speed)');
		console.log('   Watch the first input field...\n');
		
		const regularStart = Date.now();
		await client.sendCommand('type', {
			tabId: tab.tabId,
			selector: '#regular',
			text: demoText,
			delay: 50,
			humanLike: false
		});
		const regularDuration = Date.now() - regularStart;
		console.log(`   ✅ Completed in ${regularDuration}ms\n`);

		// Pause between demos
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Demo 2: Human-like typing
		console.log('🧑 Demo 2: Human-like typing (natural variation)');
		console.log('   Watch the second input field...');
		console.log('   (Look for variable speed and occasional corrections)\n');
		
		const humanStart = Date.now();
		const result = await client.sendCommand('type', {
			tabId: tab.tabId,
			selector: '#human',
			text: demoText,
			delay: 70,
			humanLike: true,
			typoChance: 0.06
		});
		const humanDuration = Date.now() - humanStart;
		
		console.log(`   ✅ Completed in ${humanDuration}ms`);
		console.log(`   Corrections made: ${result.corrections}`);
		console.log(`   Time difference: +${humanDuration - regularDuration}ms (due to variations and corrections)\n`);

		// Keep tab open for observation
		console.log('📌 Demo complete! The tab will stay open for 30 seconds.');
		console.log('   You can interact with the page to see the results.\n');
		
		await new Promise(resolve => setTimeout(resolve, 30000));

		// Clean up
		console.log('🧹 Cleaning up...');
		await client.sendCommand('close_tab', { tabId: tab.tabId });
		console.log('✅ Demo tab closed');

	} catch (error) {
		console.error('\n❌ Demo failed:', error.message);
		console.log('\nMake sure:');
		console.log('1. The Chrome extension is reloaded');
		console.log('2. The bridge server is running (pnpm run dev)');
	} finally {
		client.disconnect();
		console.log('\nDemo finished');
	}
}

// Run demo
runDemo()
	.then(() => process.exit(0))
	.catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});