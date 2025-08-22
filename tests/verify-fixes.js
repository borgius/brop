#!/usr/bin/env node

/**
 * Verify that all fixes have been applied to the source files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Verifying Element Detection Framework Fixes\n');

// Check content.js for SVG className fixes
console.log('📄 Checking content.js for SVG className fixes...');
const contentPath = path.join(__dirname, '..', 'content.js');
const contentCode = fs.readFileSync(contentPath, 'utf8');

const svgFixes = [
    'typeof element.className === \'string\'',
    'element.className?.baseVal',
    '// Handle SVG elements'
];

let contentFixed = true;
svgFixes.forEach(fix => {
    if (contentCode.includes(fix)) {
        console.log('  ✅ Found SVG fix:', fix.substring(0, 40) + '...');
    } else {
        console.log('  ❌ Missing SVG fix:', fix);
        contentFixed = false;
    }
});

// Check test files for HTTP server usage
console.log('\n📄 Checking test files for HTTP server usage...');
const coreTestPath = path.join(__dirname, 'test-element-detection-framework.js');
const coreTestCode = fs.readFileSync(coreTestPath, 'utf8');

if (coreTestCode.includes('server.writeHtmlFile') && coreTestCode.includes('server.getUrl')) {
    console.log('  ✅ Core tests using HTTP server');
} else {
    console.log('  ❌ Core tests still using data: URLs');
}

// Check brop_server.js for handler registration
console.log('\n📄 Checking brop_server.js for handler registration...');
const bropServerPath = path.join(__dirname, '..', 'brop_server.js');
const bropServerCode = fs.readFileSync(bropServerPath, 'utf8');

if (bropServerCode.includes('"detect_interactive_elements"') && 
    bropServerCode.includes('handleDetectInteractiveElements')) {
    console.log('  ✅ Handler registered in brop_server.js');
} else {
    console.log('  ❌ Handler not found in brop_server.js');
}

// Summary
console.log('\n📊 Summary:');
console.log('================================');
if (contentFixed) {
    console.log('✅ All code fixes are in place');
    console.log('\n⚠️  IMPORTANT: The Chrome extension needs to be reloaded to apply these fixes:');
    console.log('   1. Go to chrome://extensions/');
    console.log('   2. Find "Browser Remote Operations Protocol"');
    console.log('   3. Click the refresh/reload button');
    console.log('   4. Re-run the tests');
} else {
    console.log('❌ Some fixes are missing - check the output above');
}