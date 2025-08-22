#!/usr/bin/env node
/**
 * Test script for Element Detection Framework
 * 
 * This test validates the 14-layer element detection system implemented in content.js
 * It tests all detection layers, confidence scoring, and edge cases.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import TestServer, { generateFrameworkTestHTML } from "./test-server.js";

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
			this.ws = new WebSocket("ws://localhost:9225?name=element_detection_test");

			this.ws.on("open", () => {
				console.log("✅ Connected to BROP server");
				resolve();
			});

			this.ws.on("error", (error) => {
				console.error("❌ WebSocket error:", error.message);
				reject(error);
			});

			this.ws.on("message", (data) => {
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
					console.error("Error parsing response:", error);
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
					reject(new Error("Request timeout"));
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

// Test HTML content that contains various elements for testing all detection layers
const TEST_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Element Detection Framework Test Page</title>
    <style>
        .hidden { display: none; }
        .pointer-cursor { cursor: pointer; }
        .interactive { 
            transition: all 0.3s ease;
            border: 1px solid #ccc;
            padding: 10px;
        }
        .interactive:hover {
            background-color: #f5f5f5;
            transform: scale(1.05);
        }
        .large-container {
            width: 2000px;
            height: 2000px;
            overflow: auto;
        }
        .scrollable {
            height: 100px;
            overflow-y: scroll;
        }
        .scrollable-content {
            height: 200px;
            background: linear-gradient(to bottom, red, blue);
        }
    </style>
</head>
<body>
    <!-- Layer 1: HTML Tag Detection Test -->
    <h1>Element Detection Framework Test</h1>
    
    <!-- Standard interactive elements -->
    <button id="test-button" onclick="alert('clicked')">Test Button</button>
    <input type="text" id="text-input" placeholder="Enter text here" name="testInput">
    <input type="email" id="email-input" placeholder="email@example.com" required>
    <input type="password" id="password-input" placeholder="Password">
    <input type="checkbox" id="checkbox-input" name="agreement">
    <input type="radio" id="radio-input" name="choice" value="option1">
    <select id="select-dropdown" name="country">
        <option value="us">United States</option>
        <option value="ca">Canada</option>
        <option value="uk">United Kingdom</option>
    </select>
    <textarea id="textarea-input" placeholder="Enter your message"></textarea>
    <a href="https://example.com" id="test-link">Test Link</a>
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23ddd'/%3E%3C/svg%3E" alt="Test Image" id="test-image">
    <video id="test-video" width="200" height="100" controls>
        <source src="test.mp4" type="video/mp4">
    </video>
    <audio id="test-audio" controls>
        <source src="test.mp3" type="audio/mpeg">
    </audio>
    <iframe id="test-iframe" src="about:blank" width="300" height="200"></iframe>
    <canvas id="test-canvas" width="200" height="100"></canvas>

    <!-- Layer 2: ARIA Role Detection Test -->
    <div role="button" id="aria-button" tabindex="0">ARIA Button</div>
    <div role="link" id="aria-link" tabindex="0">ARIA Link</div>
    <div role="textbox" id="aria-textbox" contenteditable="true">ARIA Textbox</div>
    <div role="checkbox" id="aria-checkbox" tabindex="0" aria-checked="false">ARIA Checkbox</div>
    <div role="radio" id="aria-radio" tabindex="0" aria-checked="false">ARIA Radio</div>
    <div role="combobox" id="aria-combobox" tabindex="0">ARIA Combobox</div>
    <div role="listbox" id="aria-listbox" tabindex="0">ARIA Listbox</div>
    <div role="slider" id="aria-slider" tabindex="0" aria-valuenow="5" aria-valuemin="0" aria-valuemax="10">ARIA Slider</div>
    <div role="progressbar" id="aria-progressbar" aria-valuenow="30" aria-valuemin="0" aria-valuemax="100">ARIA Progress</div>
    <div role="menuitem" id="aria-menuitem" tabindex="0">ARIA Menu Item</div>
    <div role="tab" id="aria-tab" tabindex="0">ARIA Tab</div>
    <div role="switch" id="aria-switch" tabindex="0" aria-checked="false">ARIA Switch</div>
    <div role="searchbox" id="aria-searchbox" contenteditable="true">ARIA Search</div>
    <nav role="navigation" id="aria-navigation">ARIA Navigation</nav>

    <!-- Layer 3: Event Handler Detection Test -->
    <div onclick="handleClick()" id="onclick-element">OnClick Element</div>
    <div onchange="handleChange()" id="onchange-element">OnChange Element</div>
    <form onsubmit="handleSubmit()" id="onsubmit-element">
        <input type="submit" value="Submit Form">
    </form>
    <div onkeydown="handleKeydown()" id="onkeydown-element" tabindex="0">OnKeydown Element</div>
    <div onkeyup="handleKeyup()" id="onkeyup-element" tabindex="0">OnKeyup Element</div>
    <div onmousedown="handleMousedown()" id="onmousedown-element">OnMousedown Element</div>
    <div onmouseup="handleMouseup()" id="onmouseup-element">OnMouseup Element</div>
    <div onmouseover="handleMouseover()" id="onmouseover-element">OnMouseover Element</div>
    <div onfocus="handleFocus()" id="onfocus-element" tabindex="0">OnFocus Element</div>
    <div onblur="handleBlur()" id="onblur-element" tabindex="0">OnBlur Element</div>
    <div ondrop="handleDrop()" id="ondrop-element">OnDrop Element</div>
    <div ondragover="handleDragover()" id="ondragover-element">OnDragover Element</div>
    <div onpointerdown="handlePointerdown()" id="onpointerdown-element">OnPointerdown Element</div>
    <div onpointerup="handlePointerup()" id="onpointerup-element">OnPointerup Element</div>
    <div ontouchstart="handleTouchstart()" id="ontouchstart-element">OnTouchstart Element</div>

    <!-- Layer 4: Accessibility Properties Test -->
    <div aria-label="Custom Button Label" id="aria-label-element">Element with ARIA Label</div>
    <div aria-labelledby="label-id" id="aria-labelledby-element">Element with ARIA Labelledby</div>
    <span id="label-id">Label Text</span>
    <div aria-describedby="desc-id" id="aria-describedby-element">Element with ARIA Describedby</div>
    <span id="desc-id">Description Text</span>
    <div aria-expanded="false" id="aria-expanded-element">Element with ARIA Expanded</div>
    <div aria-selected="true" id="aria-selected-element">Element with ARIA Selected</div>
    <div aria-checked="true" id="aria-checked-element">Element with ARIA Checked</div>
    <div aria-pressed="false" id="aria-pressed-element">Element with ARIA Pressed</div>
    <div aria-hidden="false" id="aria-hidden-element">Element with ARIA Hidden</div>
    <div aria-disabled="false" id="aria-disabled-element">Element with ARIA Disabled</div>
    <div aria-required="true" id="aria-required-element">Element with ARIA Required</div>
    <div aria-invalid="false" id="aria-invalid-element">Element with ARIA Invalid</div>
    <div aria-live="polite" id="aria-live-element">Element with ARIA Live</div>
    <div aria-atomic="true" id="aria-atomic-element">Element with ARIA Atomic</div>

    <!-- Layer 5: CSS Properties Test -->
    <div class="pointer-cursor" id="cursor-pointer-element">Cursor Pointer Element</div>
    <div class="interactive" id="interactive-element">Interactive CSS Element</div>
    <div style="user-select: none; pointer-events: auto;" id="css-properties-element">CSS Properties Element</div>
    <div style="transform: translateX(10px); transition: all 0.3s;" id="transform-element">Transform Element</div>
    <div style="outline: 2px solid blue;" id="outline-element">Outline Element</div>

    <!-- Layer 6: Search Element Patterns Test -->
    <input type="search" placeholder="Search products" id="search-input">
    <input placeholder="Find something" id="find-input">
    <input placeholder="Query database" id="query-input">
    <input placeholder="Lookup user" id="lookup-input">
    <input placeholder="Filter results" id="filter-input">
    <input placeholder="Type to search for items" id="type-search-input">
    <input placeholder="Enter search term" id="enter-term-input">
    <input placeholder="What are you looking for?" id="what-looking-input">
    <input placeholder="Enter keyword" id="keyword-input">
    <input placeholder="Search term" id="term-input">

    <!-- Layer 7: Icon Element Detection Test -->
    <i class="fa-search icon" id="fa-icon">FontAwesome Icon</i>
    <i class="material-icons" id="material-icon">search</i>
    <span class="icon-user" id="icon-class">Icon Class</span>
    <svg id="svg-icon" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="#ddd"/>
    </svg>
    <i class="custom-icon" id="i-icon">Custom Icon</i>
    <div role="img" id="role-img-element">Role Img Element</div>
    <img src="" alt="" id="empty-alt-img">
    <span class="glyph-star" id="glyph-element">Glyph Element</span>
    <span class="symbol-home" id="symbol-element">Symbol Element</span>

    <!-- Layer 8: Iframe Size Test -->
    <iframe id="small-iframe" width="50" height="50" src="about:blank"></iframe>
    <iframe id="valid-iframe" width="300" height="200" src="about:blank"></iframe>
    <iframe id="extreme-aspect-iframe" width="1000" height="50" src="about:blank"></iframe>

    <!-- Layer 9: ContentEditable Test -->
    <div contenteditable="true" id="contenteditable-true">Editable Content</div>
    <div contenteditable="" id="contenteditable-empty">Editable Content Empty</div>
    <div role="textbox" id="role-textbox-element">Role Textbox</div>
    <div role="searchbox" id="role-searchbox-element">Role Searchbox</div>
    <div id="contenteditable-parent" contenteditable="true">
        <span id="contenteditable-child">Child of Editable</span>
    </div>

    <!-- Layer 10: Visibility Test -->
    <div id="visible-element">Visible Element</div>
    <div id="hidden-element" class="hidden">Hidden Element</div>
    <div id="zero-width-element" style="width: 0; height: 0;">Zero Size Element</div>
    <div id="transparent-element" style="opacity: 0;">Transparent Element</div>
    <div id="visibility-hidden-element" style="visibility: hidden;">Visibility Hidden Element</div>
    <div id="offscreen-element" style="position: absolute; left: -9999px;">Offscreen Element</div>

    <!-- Layer 11: Scrollability Test -->
    <div class="scrollable" id="scrollable-element">
        <div class="scrollable-content">Scrollable Content</div>
    </div>
    <div style="overflow: scroll; width: 200px; height: 100px;" id="overflow-scroll-element">
        <div style="width: 400px; height: 200px;">Overflow Content</div>
    </div>
    <div style="overflow: auto; width: 200px; height: 100px;" id="overflow-auto-element">
        <div style="width: 400px; height: 200px;">Auto Overflow Content</div>
    </div>

    <!-- Layer 12: Bounding Box Test -->
    <div id="normal-size-element" style="width: 100px; height: 50px;">Normal Size</div>
    <div id="tiny-element" style="width: 0.5px; height: 0.5px;">Tiny Element</div>
    <div class="large-container" id="large-element">Very Large Element</div>

    <!-- Edge Cases and Error Testing -->
    <div id="null-element">Element for Null Testing</div>
    <div id="undefined-element">Element for Undefined Testing</div>
    <script>
        // Simulate some dynamic event handlers
        document.getElementById('test-button').addEventListener('click', function() {
            console.log('Button clicked');
        });
        
        // Functions for testing event handlers
        function handleClick() { console.log('click'); }
        function handleChange() { console.log('change'); }
        function handleSubmit() { console.log('submit'); }
        function handleKeydown() { console.log('keydown'); }
        function handleKeyup() { console.log('keyup'); }
        function handleMousedown() { console.log('mousedown'); }
        function handleMouseup() { console.log('mouseup'); }
        function handleMouseover() { console.log('mouseover'); }
        function handleFocus() { console.log('focus'); }
        function handleBlur() { console.log('blur'); }
        function handleDrop() { console.log('drop'); }
        function handleDragover() { console.log('dragover'); }
        function handlePointerdown() { console.log('pointerdown'); }
        function handlePointerup() { console.log('pointerup'); }
        function handleTouchstart() { console.log('touchstart'); }
    </script>
</body>
</html>
`;

async function createTestPage(client, server) {
	// Write test HTML to server and get URL
	await server.writeHtmlFile('framework-test.html', TEST_HTML);
	const testUrl = server.getUrl('framework-test.html');
	
	console.log("📋 Creating test tab with comprehensive test HTML...");
	const tab = await client.sendCommand("create_tab", {
		url: testUrl,
		active: true,
	});
	console.log(`✅ Created tab ${tab.tabId}: ${tab.title}`);
	
	// Wait for page to load
	await new Promise((resolve) => setTimeout(resolve, 2000));
	
	return tab;
}

function analyzeDetectionResults(result) {
	const analysis = {
		totalElements: result.total_detected,
		layers: result.detection_layers,
		confidenceLevels: { HIGH: 0, MEDIUM: 0, LOW: 0 },
		detectionReasons: {},
		layerCoverage: new Set(),
		elementTypes: new Set(),
		errors: []
	};

	if (!result.elements || !Array.isArray(result.elements)) {
		analysis.errors.push("No elements array in result");
		return analysis;
	}

	result.elements.forEach(element => {
		// Count confidence levels
		if (element.confidence) {
			analysis.confidenceLevels[element.confidence]++;
		}

		// Analyze detection reasons
		if (element.detectionReasons) {
			element.detectionReasons.forEach(reason => {
				const layer = reason.split(':')[0];
				analysis.layerCoverage.add(layer);
				analysis.detectionReasons[layer] = (analysis.detectionReasons[layer] || 0) + 1;
			});
		}

		// Track element types
		if (element.serialized && element.serialized.tag) {
			analysis.elementTypes.add(element.serialized.tag);
		}
	});

	return analysis;
}

function validateLayerCoverage(analysis) {
	const expectedLayers = [
		'HTML_TAG',
		'ARIA_ROLE', 
		'EVENT_HANDLERS',
		'ACCESSIBILITY',
		'CSS_INTERACTIVE',
		'SEARCH_PATTERN',
		'ICON_ELEMENT',
		'IFRAME_FILTER',
		'CONTENT_EDITABLE',
		'VISIBILITY',
		'SCROLLABLE',
		'BOUNDING_BOX'
	];

	const missingLayers = expectedLayers.filter(layer => !analysis.layerCoverage.has(layer));
	const extraLayers = Array.from(analysis.layerCoverage).filter(layer => !expectedLayers.includes(layer));

	return {
		expectedLayers: expectedLayers.length,
		detectedLayers: analysis.layerCoverage.size,
		missingLayers,
		extraLayers,
		coverage: ((analysis.layerCoverage.size / expectedLayers.length) * 100).toFixed(1)
	};
}

async function runTests() {
	console.log("🧪 Testing Element Detection Framework - 14 Layer System");
	console.log(`=${"=".repeat(70)}`);

	const client = new BROPTestClient();
	const server = new TestServer();

	try {
		// Start HTTP server
		await server.start();
		
		// Connect to BROP server
		await client.connect();
		console.log("");

		// Create test page
		const tab = await createTestPage(client, server);

		// Test 1: Basic Element Detection
		console.log("🧪 Test 1: Basic Element Detection (Default Settings)");
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId
			});

			console.log("✅ Basic detection completed:");
			console.log(`   Total elements detected: ${result.total_detected}`);
			console.log(`   Detection layers: ${result.detection_layers}`);
			console.log(`   Timestamp: ${result.timestamp}`);

			const analysis = analyzeDetectionResults(result);
			console.log(`   Confidence levels: HIGH(${analysis.confidenceLevels.HIGH}) MEDIUM(${analysis.confidenceLevels.MEDIUM}) LOW(${analysis.confidenceLevels.LOW})`);
			
			const coverage = validateLayerCoverage(analysis);
			console.log(`   Layer coverage: ${coverage.coverage}% (${coverage.detectedLayers}/${coverage.expectedLayers})`);
			
			if (coverage.missingLayers.length > 0) {
				console.log(`   ⚠️  Missing layers: ${coverage.missingLayers.join(', ')}`);
			}
			if (coverage.extraLayers.length > 0) {
				console.log(`   ℹ️  Extra layers: ${coverage.extraLayers.join(', ')}`);
			}

		} catch (error) {
			console.error("❌ Test 1 failed:", error.message);
		}

		// Test 2: High Confidence Only
		console.log("\n🧪 Test 2: High Confidence Elements Only");
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				minConfidence: "HIGH"
			});

			console.log("✅ High confidence detection:");
			console.log(`   Total elements: ${result.total_detected}`);
			
			const analysis = analyzeDetectionResults(result);
			console.log(`   Confidence levels: HIGH(${analysis.confidenceLevels.HIGH}) MEDIUM(${analysis.confidenceLevels.MEDIUM}) LOW(${analysis.confidenceLevels.LOW})`);
			
			// All elements should be HIGH confidence
			if (analysis.confidenceLevels.MEDIUM > 0 || analysis.confidenceLevels.LOW > 0) {
				console.log(`   ❌ ERROR: Found non-HIGH confidence elements in HIGH-only filter`);
			} else {
				console.log(`   ✅ All elements are HIGH confidence`);
			}

		} catch (error) {
			console.error("❌ Test 2 failed:", error.message);
		}

		// Test 3: Include Hidden Elements
		console.log("\n🧪 Test 3: Include Hidden Elements");
		try {
			const visibleResult = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				includeHidden: false
			});

			const hiddenResult = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				includeHidden: true
			});

			console.log("✅ Hidden elements test:");
			console.log(`   Visible only: ${visibleResult.total_detected} elements`);
			console.log(`   Including hidden: ${hiddenResult.total_detected} elements`);
			console.log(`   Hidden elements found: ${hiddenResult.total_detected - visibleResult.total_detected}`);

			if (hiddenResult.total_detected >= visibleResult.total_detected) {
				console.log(`   ✅ Including hidden increased or maintained element count`);
			} else {
				console.log(`   ❌ ERROR: Including hidden decreased element count`);
			}

		} catch (error) {
			console.error("❌ Test 3 failed:", error.message);
		}

		// Test 4: Element Limit Testing
		console.log("\n🧪 Test 4: Element Limit Testing");
		try {
			const unlimitedResult = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				maxElements: 1000
			});

			const limitedResult = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				maxElements: 5
			});

			console.log("✅ Element limit test:");
			console.log(`   Unlimited (max 1000): ${unlimitedResult.total_detected} elements`);
			console.log(`   Limited (max 5): ${limitedResult.total_detected} elements`);

			if (limitedResult.total_detected <= 5) {
				console.log(`   ✅ Element limit respected`);
			} else {
				console.log(`   ❌ ERROR: Element limit exceeded`);
			}

		} catch (error) {
			console.error("❌ Test 4 failed:", error.message);
		}

		// Test 5: Layer-Specific Detection Analysis
		console.log("\n🧪 Test 5: Layer-Specific Detection Analysis");
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				includeCoordinates: true
			});

			const analysis = analyzeDetectionResults(result);
			console.log("✅ Layer analysis:");
			
			console.log("   Layer detection counts:");
			Object.entries(analysis.detectionReasons)
				.sort(([a], [b]) => a.localeCompare(b))
				.forEach(([layer, count]) => {
					console.log(`     ${layer}: ${count} detections`);
				});

			console.log("   Element types found:");
			console.log(`     ${Array.from(analysis.elementTypes).sort().join(', ')}`);

		} catch (error) {
			console.error("❌ Test 5 failed:", error.message);
		}

		// Test 6: Confidence Score Validation
		console.log("\n🧪 Test 6: Confidence Score Validation");
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId
			});

			console.log("✅ Confidence score validation:");
			
			// Check specific elements for expected confidence levels
			const buttonElements = result.elements.filter(el => 
				el.serialized && el.serialized.tag === 'button'
			);
			
			const highConfidenceCount = buttonElements.filter(el => el.confidence === 'HIGH').length;
			console.log(`   Button elements with HIGH confidence: ${highConfidenceCount}/${buttonElements.length}`);

			// Check score ranges
			let scoreRanges = { high: 0, medium: 0, low: 0 };
			result.elements.forEach(el => {
				if (el.confidenceScore >= 1.5) scoreRanges.high++;
				else if (el.confidenceScore >= 0.8) scoreRanges.medium++;
				else scoreRanges.low++;
			});

			console.log(`   Score distribution: HIGH(≥1.5): ${scoreRanges.high}, MEDIUM(≥0.8): ${scoreRanges.medium}, LOW(<0.8): ${scoreRanges.low}`);

		} catch (error) {
			console.error("❌ Test 6 failed:", error.message);
		}

		// Test 7: Coordinate System Testing
		console.log("\n🧪 Test 7: Coordinate System Testing");
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				includeCoordinates: true
			});

			console.log("✅ Coordinate system test:");
			
			const elementsWithCoords = result.elements.filter(el => el.coordinates);
			console.log(`   Elements with coordinates: ${elementsWithCoords.length}/${result.total_detected}`);

			if (elementsWithCoords.length > 0) {
				const firstElement = elementsWithCoords[0];
				const coords = firstElement.coordinates;
				
				console.log("   Sample coordinate data:");
				console.log(`     Viewport: x=${coords.viewport?.x}, y=${coords.viewport?.y}, w=${coords.viewport?.width}, h=${coords.viewport?.height}`);
				console.log(`     Document: x=${coords.document?.x}, y=${coords.document?.y}`);
				console.log(`     Center: x=${coords.center?.x}, y=${coords.center?.y}`);
			}

		} catch (error) {
			console.error("❌ Test 7 failed:", error.message);
		}

		// Test 8: Error Handling and Edge Cases
		console.log("\n🧪 Test 8: Error Handling and Edge Cases");
		try {
			// Test with invalid tab ID
			try {
				await client.sendCommand("detect_interactive_elements", {
					tabId: "invalid-tab-id"
				});
				console.log("❌ Should have failed with invalid tab ID");
			} catch (error) {
				console.log("✅ Correctly handled invalid tab ID");
			}

			// Test with extreme parameters
			const extremeResult = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId,
				maxElements: 0
			});
			
			console.log(`   Extreme maxElements(0): ${extremeResult.total_detected} elements detected`);

		} catch (error) {
			console.error("❌ Test 8 failed:", error.message);
		}

		// Test 9: Performance Testing
		console.log("\n🧪 Test 9: Performance Testing");
		try {
			const startTime = Date.now();
			
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId
			});
			
			const endTime = Date.now();
			const duration = endTime - startTime;

			console.log("✅ Performance test:");
			console.log(`   Detection time: ${duration}ms`);
			console.log(`   Elements per second: ${Math.round(result.total_detected / (duration / 1000))}`);
			console.log(`   Average time per element: ${Math.round(duration / result.total_detected)}ms`);

			if (duration < 5000) {
				console.log("   ✅ Performance within acceptable limits (<5s)");
			} else {
				console.log("   ⚠️  Performance slower than expected (≥5s)");
			}

		} catch (error) {
			console.error("❌ Test 9 failed:", error.message);
		}

		// Test 10: Serialization Format Validation
		console.log("\n🧪 Test 10: Serialization Format Validation");
		try {
			const result = await client.sendCommand("detect_interactive_elements", {
				tabId: tab.tabId
			});

			console.log("✅ Serialization format validation:");
			
			if (result.elements.length > 0) {
				const sampleElement = result.elements[0];
				const serialized = sampleElement.serialized;
				
				const requiredFields = ['tag', 'confidence_score', 'detection_reasons', 'coordinates', 'selector', 'description'];
				const presentFields = requiredFields.filter(field => serialized && serialized[field] !== undefined);
				
				console.log(`   Required fields present: ${presentFields.length}/${requiredFields.length}`);
				console.log(`   Present: ${presentFields.join(', ')}`);
				
				const missingFields = requiredFields.filter(field => !serialized || serialized[field] === undefined);
				if (missingFields.length > 0) {
					console.log(`   Missing: ${missingFields.join(', ')}`);
				}

				// Validate selector format
				if (serialized.selector) {
					console.log(`   Sample selector: "${serialized.selector}"`);
				}

				// Validate description format
				if (serialized.description) {
					console.log(`   Sample description: "${serialized.description.substring(0, 50)}..."`);
				}
			}

		} catch (error) {
			console.error("❌ Test 10 failed:", error.message);
		}

		// Clean up
		console.log("\n🧹 Cleaning up...");
		await client.sendCommand("close_tab", { tabId: tab.tabId });
		console.log("✅ Test tab closed");

	} catch (error) {
		console.error("\n❌ Test suite failed:", error.message);
	} finally {
		client.disconnect();
		await server.stop();
		console.log("\n✅ Element Detection Framework testing completed");
	}
}

// Run tests
console.log("");
runTests()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});