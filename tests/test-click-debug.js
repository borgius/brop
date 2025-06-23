#!/usr/bin/env node
/**
 * Debug test for click method implementation
 */

import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:9225?name=click_debug');

ws.on('open', () => {
	console.log('Connected to BROP server');
	
	// First check if extension is connected
	const checkMsg = {
		id: 'check_1',
		method: 'get_extension_version',
		params: {}
	};
	
	console.log('Sending:', checkMsg);
	ws.send(JSON.stringify(checkMsg));
});

ws.on('message', (data) => {
	const response = JSON.parse(data.toString());
	console.log('Response:', response);
	
	if (response.id === 'check_1' && response.success) {
		// Extension is connected, now test click
		console.log('\nExtension connected, testing click method...');
		
		const clickMsg = {
			id: 'click_1',
			method: 'click',
			params: {
				tabId: 999999, // Invalid tab ID to test error handling
				selector: '#test'
			}
		};
		
		console.log('Sending:', clickMsg);
		ws.send(JSON.stringify(clickMsg));
	} else if (response.id === 'click_1') {
		console.log('\nClick method response received');
		ws.close();
		process.exit(0);
	}
});

ws.on('error', (error) => {
	console.error('WebSocket error:', error);
	process.exit(1);
});