#!/usr/bin/env node

/**
 * Manual test script for Element Detection Framework
 * Run this to test the detection without full test suite
 */

import WebSocket from 'ws';

async function testDetection() {
    console.log('🧪 Manual Element Detection Test');
    console.log('================================\n');
    
    const ws = new WebSocket('ws://localhost:9225');
    
    return new Promise((resolve, reject) => {
        ws.on('open', () => {
            console.log('✅ Connected to BROP server');
            
            // Send detection command
            const command = {
                id: Date.now(),
                method: 'detect_interactive_elements',
                params: {
                    minConfidence: 'MEDIUM',
                    maxElements: 10,
                    includeHidden: false,
                    tabId: 'CURRENT'  // Use current tab
                }
            };
            
            console.log('📤 Sending detection command:', JSON.stringify(command, null, 2));
            ws.send(JSON.stringify(command));
        });
        
        ws.on('message', (data) => {
            const response = JSON.parse(data.toString());
            console.log('\n📥 Response received:');
            console.log('================================');
            
            if (response.error) {
                console.error('❌ Error:', response.error);
            } else if (response.result) {
                console.log('✅ Detection successful!');
                console.log(`📊 Total elements detected: ${response.result.total_detected || 0}`);
                console.log(`🔍 Detection layers used: ${response.result.detection_layers || 0}`);
                
                if (response.result.elements && response.result.elements.length > 0) {
                    console.log('\n🎯 Sample detected elements:');
                    response.result.elements.slice(0, 3).forEach((el, i) => {
                        console.log(`\n  ${i + 1}. ${el.selector || 'Unknown'}`);
                        console.log(`     Confidence: ${el.confidence} (score: ${el.confidenceScore})`);
                        console.log(`     Reasons: ${el.detectionReasons.slice(0, 3).join(', ')}`);
                    });
                }
            }
            
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
        }, 10000);
    });
}

// Run the test
testDetection()
    .then(() => {
        console.log('\n✅ Test completed successfully');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Test failed:', err.message);
        console.log('\n💡 Make sure:');
        console.log('   1. Chrome extension is loaded (chrome://extensions)');
        console.log('   2. Bridge server is running (npm run bridge)');
        console.log('   3. Navigate to any webpage in Chrome');
        process.exit(1);
    });