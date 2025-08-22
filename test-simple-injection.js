#!/usr/bin/env node

/**
 * Very simple test to verify content script injection
 */

import WebSocket from 'ws';

async function testSimpleInjection() {
    console.log('🧪 Testing Simple Content Script Injection');
    console.log('==========================================\n');
    
    const ws = new WebSocket('ws://localhost:9225');
    
    return new Promise((resolve, reject) => {
        ws.on('open', () => {
            console.log('✅ Connected to BROP server');
            
            // Send detection command to trigger injection
            const command = {
                id: Date.now(),
                method: 'detect_interactive_elements',
                params: {
                    tabId: 654819780,  // Use the tab ID from the test
                    maxElements: 1
                }
            };
            
            console.log('📤 Sending detection command:', JSON.stringify(command, null, 2));
            ws.send(JSON.stringify(command));
        });
        
        ws.on('message', (data) => {
            const response = JSON.parse(data.toString());
            console.log('\n📥 Response received:');
            console.log('================================');
            console.log(JSON.stringify(response, null, 2));
            
            ws.close();
            resolve();
        });
        
        ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            reject(err);
        });
        
        setTimeout(() => {
            console.error('❌ Timeout: No response received');
            ws.close();
            reject(new Error('Timeout'));
        }, 15000);
    });
}

// Run the test
testSimpleInjection()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err.message);
        process.exit(1);
    });