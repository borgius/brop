#!/usr/bin/env node

/**
 * Debug script to check if detect_interactive_elements handler is properly registered
 */

import WebSocket from 'ws';

async function debugHandlers() {
    console.log('🔍 Debug: Checking Handler Registration');
    console.log('=====================================\n');
    
    const ws = new WebSocket('ws://localhost:9225');
    
    return new Promise((resolve, reject) => {
        ws.on('open', () => {
            console.log('✅ Connected to BROP server');
            
            // First, let's test a known working command to verify connection
            const testCommand = {
                id: Date.now(),
                method: 'list_tabs',
                params: {}
            };
            
            console.log('📤 Testing known command (list_tabs)...');
            ws.send(JSON.stringify(testCommand));
        });
        
        let responseCount = 0;
        
        ws.on('message', (data) => {
            const response = JSON.parse(data.toString());
            responseCount++;
            
            if (responseCount === 1) {
                console.log('📥 list_tabs response:', response.success ? '✅ SUCCESS' : '❌ FAILED');
                
                if (response.success) {
                    console.log('🔗 Extension connection is working');
                    
                    // Now test the detect_interactive_elements command
                    console.log('\n📤 Testing detect_interactive_elements command...');
                    const detectCommand = {
                        id: Date.now() + 1,
                        method: 'detect_interactive_elements',
                        params: {
                            tabId: 'CURRENT',
                            maxElements: 1
                        }
                    };
                    
                    ws.send(JSON.stringify(detectCommand));
                } else {
                    console.log('❌ Extension connection failed:', response.error);
                    ws.close();
                    reject(new Error('Extension connection failed'));
                }
            } else if (responseCount === 2) {
                console.log('📥 detect_interactive_elements response:');
                console.log('Success:', response.success ? '✅' : '❌');
                
                if (response.error) {
                    console.log('Error:', response.error);
                    
                    if (response.error.includes('Unsupported BROP command')) {
                        console.log('\n🔍 DIAGNOSIS: Handler is NOT registered in the extension');
                        console.log('💡 SOLUTIONS:');
                        console.log('   1. Reload the Chrome extension');
                        console.log('   2. Check if extension service worker restarted properly');
                        console.log('   3. Verify message handler registration in brop_server.js');
                    }
                } else {
                    console.log('✅ Command executed successfully!');
                    console.log('Result summary:', response.result ? Object.keys(response.result) : 'No result');
                }
                
                ws.close();
                resolve();
            }
        });
        
        ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            reject(err);
        });
        
        setTimeout(() => {
            console.error('❌ Timeout: No response received');
            ws.close();
            reject(new Error('Timeout'));
        }, 10000);
    });
}

// Run the debug
debugHandlers()
    .then(() => {
        console.log('\n✅ Debug completed');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Debug failed:', err.message);
        process.exit(1);
    });