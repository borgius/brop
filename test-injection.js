#!/usr/bin/env node

/**
 * Simple test to verify content script injection works
 */

import WebSocket from 'ws';

async function testInjection() {
    console.log('🧪 Testing Content Script Injection');
    console.log('===================================\n');
    
    const ws = new WebSocket('ws://localhost:9225');
    
    return new Promise((resolve, reject) => {
        let tabId;
        
        ws.on('open', () => {
            console.log('✅ Connected to BROP server');
            
            // First create a tab with a real webpage
            const createTabCommand = {
                id: Date.now(),
                method: 'create_tab',
                params: {
                    url: 'https://httpbin.org/html',
                    active: true
                }
            };
            
            console.log('📤 Creating tab with real webpage...');
            ws.send(JSON.stringify(createTabCommand));
        });
        
        ws.on('message', (data) => {
            const response = JSON.parse(data.toString());
            console.log('\n📥 Response received:', response);
            
            if (response.method === 'create_tab' && response.result?.tabId) {
                tabId = response.result.tabId;
                console.log(`✅ Tab created: ${tabId}`);
                
                // Wait a moment for the page to load
                setTimeout(() => {
                    // Now try element detection
                    const detectionCommand = {
                        id: Date.now() + 1,
                        method: 'detect_interactive_elements',
                        params: {
                            tabId: tabId,
                            maxElements: 5
                        }
                    };
                    
                    console.log('📤 Sending detection command...');
                    ws.send(JSON.stringify(detectionCommand));
                }, 3000);
                
            } else if (response.method === 'detect_interactive_elements') {
                if (response.error) {
                    console.error('❌ Detection error:', response.error);
                } else {
                    console.log('✅ Detection successful!');
                    console.log(`📊 Elements detected: ${response.result?.total_detected || 0}`);
                }
                
                // Clean up
                if (tabId) {
                    const closeCommand = {
                        id: Date.now() + 2,
                        method: 'close_tab',
                        params: { tabId: tabId }
                    };
                    ws.send(JSON.stringify(closeCommand));
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
        }, 30000);
    });
}

// Run the test
testInjection()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err.message);
        process.exit(1);
    });