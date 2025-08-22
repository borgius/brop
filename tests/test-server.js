#!/usr/bin/env node
/**
 * HTTP Test Server for Element Detection Framework Tests
 * 
 * This module provides a simple HTTP server to serve test HTML files
 * instead of using data: URLs which Chrome doesn't allow content script injection.
 */

import { createServer } from "node:http";
import { join, extname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TestServer {
	constructor(port = 0) {
		this.port = port;
		this.server = null;
		this.actualPort = null;
		this.htmlFilesDir = join(__dirname, "html-files");
	}

	async ensureHtmlFilesDir() {
		if (!existsSync(this.htmlFilesDir)) {
			await mkdir(this.htmlFilesDir, { recursive: true });
		}
	}

	async writeHtmlFile(filename, content) {
		await this.ensureHtmlFilesDir();
		const filePath = join(this.htmlFilesDir, filename);
		await writeFile(filePath, content, "utf8");
		return filePath;
	}

	getContentType(filePath) {
		const ext = extname(filePath).toLowerCase();
		const mimeTypes = {
			'.html': 'text/html',
			'.css': 'text/css',
			'.js': 'application/javascript',
			'.json': 'application/json',
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.gif': 'image/gif',
			'.svg': 'image/svg+xml',
		};
		return mimeTypes[ext] || 'text/plain';
	}

	async start() {
		await this.ensureHtmlFilesDir();
		
		return new Promise((resolve, reject) => {
			this.server = createServer(async (req, res) => {
				try {
					// Parse URL and remove query parameters
					const url = new URL(req.url, `http://localhost:${this.actualPort}`);
					let pathname = url.pathname;
					
					// Default to index.html for root
					if (pathname === '/') {
						pathname = '/index.html';
					}
					
					// Remove leading slash
					const filename = pathname.substring(1);
					const filePath = join(this.htmlFilesDir, filename);
					
					// Security check - ensure file is within html-files directory
					const resolvedPath = join(this.htmlFilesDir, filename);
					if (!resolvedPath.startsWith(this.htmlFilesDir)) {
						res.writeHead(403, { 'Content-Type': 'text/plain' });
						res.end('Forbidden');
						return;
					}

					if (existsSync(resolvedPath)) {
						const content = await readFile(resolvedPath);
						const contentType = this.getContentType(resolvedPath);
						
						res.writeHead(200, {
							'Content-Type': contentType,
							'Content-Length': content.length,
							'Cache-Control': 'no-cache',
							'Access-Control-Allow-Origin': '*'
						});
						res.end(content);
					} else {
						res.writeHead(404, { 'Content-Type': 'text/plain' });
						res.end('File not found');
					}
				} catch (error) {
					console.error('Server error:', error);
					res.writeHead(500, { 'Content-Type': 'text/plain' });
					res.end('Internal server error');
				}
			});

			this.server.listen(this.port, () => {
				this.actualPort = this.server.address().port;
				console.log(`✅ Test server started on http://localhost:${this.actualPort}`);
				resolve(this.actualPort);
			});

			this.server.on('error', (error) => {
				console.error('❌ Server error:', error);
				reject(error);
			});
		});
	}

	async stop() {
		if (this.server) {
			return new Promise((resolve) => {
				this.server.close(() => {
					console.log(`✅ Test server stopped`);
					resolve();
				});
			});
		}
	}

	getUrl(filename) {
		if (!this.actualPort) {
			throw new Error('Server not started');
		}
		return `http://localhost:${this.actualPort}/${filename}`;
	}
}

// Test HTML content generators
export function generateFrameworkTestHTML() {
	return `<!DOCTYPE html>
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
</html>`;
}

export function generateLargeDOMHTML(elementCount = 1000) {
	let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Large DOM Stress Test</title>
    <style>
        .stress-element { 
            width: 50px; 
            height: 20px; 
            margin: 1px; 
            display: inline-block;
            cursor: pointer;
            transition: all 0.1s;
        }
        .hidden { display: none; }
        .complex-element {
            border: 1px solid #ccc;
            background: linear-gradient(45deg, #f0f0f0, #e0e0e0);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transform: rotate(1deg);
        }
    </style>
</head>
<body>
    <h1>Large DOM Stress Test (${elementCount} elements)</h1>
`;

	// Generate various types of elements
	for (let i = 0; i < elementCount; i++) {
		const elementTypes = [
			`<button id="btn-${i}" class="stress-element" onclick="test(${i})">Button ${i}</button>`,
			`<input id="input-${i}" type="text" placeholder="Input ${i}" class="stress-element">`,
			`<div id="div-${i}" class="stress-element complex-element" role="button" tabindex="0" aria-label="Div ${i}">Div ${i}</div>`,
			`<a id="link-${i}" href="#${i}" class="stress-element">Link ${i}</a>`,
			`<span id="span-${i}" class="stress-element ${i % 10 === 0 ? 'hidden' : ''}" onclick="span(${i})">Span ${i}</span>`,
			`<select id="select-${i}" class="stress-element"><option>Option ${i}</option></select>`,
			`<textarea id="textarea-${i}" placeholder="Textarea ${i}" class="stress-element"></textarea>`,
			`<div id="aria-${i}" role="checkbox" aria-checked="false" class="stress-element">Checkbox ${i}</div>`,
			`<i id="icon-${i}" class="fa-icon stress-element" aria-hidden="true">Icon ${i}</i>`,
			`<canvas id="canvas-${i}" width="50" height="20" class="stress-element"></canvas>`
		];
		
		html += elementTypes[i % elementTypes.length] + '\n';
		
		// Add some structural elements
		if (i % 100 === 0) {
			html += `<section id="section-${i}"><h2>Section ${i}</h2>`;
		}
		if (i % 100 === 99) {
			html += `</section>`;
		}
	}

	html += `
    <script>
        function test(id) { console.log('Test ' + id); }
        function span(id) { console.log('Span ' + id); }
        
        // Add some dynamic event listeners
        for (let i = 0; i < ${Math.min(elementCount, 100)}; i++) {
            const el = document.getElementById('btn-' + i);
            if (el) {
                el.addEventListener('mouseover', function() {
                    console.log('Hover ' + i);
                });
            }
        }
    </script>
</body>
</html>
`;

	return html;
}

export function generateMalformedHTML() {
	return `
<!DOCTYPE html>
<html>
<head>
    <title>Malformed HTML Test</title>
</head>
<body>
    <!-- Unclosed tags -->
    <div id="unclosed-div">
        <span id="unclosed-span">
            <button id="button-in-unclosed">Button
        
    <!-- Nested interactive elements -->
    <button id="outer-button">
        <button id="nested-button">Nested Button</button>
        <a href="#" id="nested-link">Nested Link</a>
    </button>
    
    <!-- Invalid attributes -->
    <div onclick="invalid function()" id="invalid-onclick">Invalid OnClick</div>
    <input type="invalid-type" id="invalid-input-type">
    <div role="invalid-role" id="invalid-role">Invalid Role</div>
    
    <!-- Extreme nesting -->
    <div><div><div><div><div><div><div><div><div><div>
    <button id="deeply-nested-button">Deep Button</button>
    </div></div></div></div></div></div></div></div></div></div>
    
    <!-- Elements with special characters -->
    <button id="special-chars-!@#$%^&*()" onclick="alert('special')">Special Chars</button>
    <div id="unicode-元素" role="button">Unicode Element</div>
    
    <!-- Circular references in attributes -->
    <div id="circular1" aria-labelledby="circular2">
        <div id="circular2" aria-labelledby="circular1">Circular Reference</div>
    </div>
    
    <!-- Empty and whitespace-only elements -->
    <button id="empty-button"></button>
    <div id="whitespace-div">   </div>
    <span id="tabs-and-newlines">	
    	</span>
    
    <!-- Elements with extreme styling -->
    <div id="extreme-transform" style="transform: rotate(360deg) scale(1000) translate(99999px, 99999px);">Extreme Transform</div>
    <div id="extreme-zindex" style="z-index: 999999999;">Extreme Z-Index</div>
    
    <!-- SVG and namespaced elements -->
    <svg id="svg-element">
        <circle id="svg-circle" cx="50" cy="50" r="40" onclick="svgClick()"/>
        <g id="svg-group">
            <rect id="svg-rect" x="10" y="10" width="30" height="30"/>
        </g>
    </svg>
    
    <!-- Shadow DOM simulation -->
    <div id="shadow-host">
        <template id="shadow-template">
            <button id="shadow-button">Shadow Button</button>
        </template>
    </div>
    
    <!-- Custom elements -->
    <custom-element id="custom-1" role="button">Custom Element</custom-element>
    <unknown-tag id="unknown-tag" onclick="unknown()">Unknown Tag</unknown-tag>
    
    <script>
        function svgClick() { console.log('SVG clicked'); }
        function unknown() { console.log('Unknown clicked'); }
        
        // Simulate some dynamic DOM manipulation
        setTimeout(() => {
            const div = document.createElement('div');
            div.id = 'dynamic-element';
            div.onclick = () => console.log('Dynamic click');
            document.body.appendChild(div);
        }, 100);
        
        // Test shadow DOM if supported
        try {
            const host = document.getElementById('shadow-host');
            const shadow = host.attachShadow({mode: 'open'});
            shadow.innerHTML = '<button id="real-shadow-button">Real Shadow Button</button>';
        } catch (e) {
            console.log('Shadow DOM not supported');
        }
    </script>
</body>
</html>
`;
}

export function generateIframeTestHTML() {
	return `
<!DOCTYPE html>
<html>
<head>
    <title>Iframe Test</title>
</head>
<body>
    <h1>Iframe Testing</h1>
    
    <!-- Same-origin iframe -->
    <iframe id="same-origin-iframe" srcdoc="<button id='iframe-button'>Iframe Button</button>" width="300" height="200"></iframe>
    
    <!-- Cross-origin iframe (will likely fail) -->
    <iframe id="cross-origin-iframe" src="https://example.com" width="300" height="200"></iframe>
    
    <!-- Data URL iframe -->
    <iframe id="data-iframe" src="data:text/html,<button onclick='alert(\"iframe\")'>Data Iframe Button</button>" width="300" height="100"></iframe>
    
    <!-- Nested iframes -->
    <iframe id="nested-iframe-parent" srcdoc="
        <div>Nested Iframe Level 1</div>
        <iframe id='nested-iframe-child' srcdoc='<button>Nested Level 2 Button</button>' width='200' height='100'></iframe>
    " width="400" height="200"></iframe>
    
    <!-- Elements inside and outside iframe -->
    <button id="outside-iframe-button">Outside Iframe Button</button>
    
    <script>
        // Test iframe access
        setTimeout(() => {
            try {
                const iframe = document.getElementById('same-origin-iframe');
                const iframeDoc = iframe.contentDocument;
                const btn = iframeDoc.getElementById('iframe-button');
                console.log('Iframe button found:', !!btn);
            } catch (e) {
                console.log('Iframe access failed:', e.message);
            }
        }, 1000);
    </script>
</body>
</html>
`;
}

export function generateSimpleTestHTML() {
	return `<html><body><button>Test</button></body></html>`;
}

export function generateMemoryTestHTML() {
	return `<html><body>${'<button>Button</button>'.repeat(100)}</body></html>`;
}

export default TestServer;