#!/usr/bin/env node

/**
 * Test content script injection specifically with data: URLs
 */

import WebSocket from 'ws';

const TEST_HTML = `<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body>
<h1>Test Page for Element Detection</h1>
<button id="test-button">Test Button</button>
<input type="text" id="test-input" placeholder="Test input">
<a href="#" id="test-link">Test Link</a>
</body></html>`;

async function testDataUrlInjection() {
    console.log('🧪 Testing Data URL Content Script Injection');
    console.log('==============================================\n');
    
    const ws = new WebSocket('ws://localhost:9225');
    
    return new Promise((resolve, reject) => {
        let tabId;
        const createTabId = 'create_tab_test';
        const detectId = 'detect_test';
        
        ws.on('open', () => {
            console.log('✅ Connected to BROP server');
            
            // Create a data URL tab (like the test does)
            const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(TEST_HTML)}`;
            
            const createTabCommand = {
                id: createTabId,
                method: 'create_tab',
                params: {
                    url: dataUrl,
                    active: true
                }
            };
            
            console.log('📤 Creating data: URL tab...');
            ws.send(JSON.stringify(createTabCommand));
        });
        
        ws.on('message', (data) => {
            const response = JSON.parse(data.toString());
            console.log('📥 Response:', response);
            
            if (response.id === createTabId && response.result?.tabId) {
                tabId = response.result.tabId;
                console.log(`✅ Tab created: ${tabId}`);
                
                // Wait for page to load (like the test does)
                setTimeout(() => {
                    // Now try element detection (should trigger injection)
                    const detectionCommand = {
                        id: detectId,
                        method: 'detect_interactive_elements',
                        params: {
                            tabId: tabId,
                            maxElements: 10,
                            includeHidden: false
                        }
                    };
                    
                    console.log('📤 Sending detection command (should trigger injection)...');
                    ws.send(JSON.stringify(detectionCommand));
                }, 3000);
                
            } else if (response.id === detectId) {
                if (response.success) {
                    console.log('🎉 SUCCESS! Content script injection worked!');
                    console.log(`📊 Elements detected: ${response.result?.total_detected || 0}`);
                    console.log(`🔍 Detection layers: ${response.result?.detection_layers || 0}`);
                    
                    if (response.result?.elements?.length > 0) {
                        console.log('📝 Sample elements:');
                        response.result.elements.slice(0, 3).forEach((el, i) => {
                            console.log(`   ${i + 1}. ${el.selector}: ${el.confidence} (${el.confidenceScore})`);
                        });
                    }
                } else {
                    console.error('❌ Detection failed:', response.error);
                    
                    // Try to get more detailed error info
                    if (response.error?.includes('Could not establish connection')) {
                        console.log('💡 This means content script injection failed');
                        console.log('   Possible causes:');
                        console.log('   - content.js file not found in extension');
                        console.log('   - permissions issue');
                        console.log('   - Chrome security restrictions on data: URLs');
                    }
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
testDataUrlInjection()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err.message);
        process.exit(1);
    });