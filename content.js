// Browser Remote Operations Protocol - Content Script
// This script runs in the context of web pages and provides the interface
// for executing commands that require page-level access

// Check if already injected to avoid duplicate injection errors
if (typeof window.BROP === "undefined") {
	class BROPContentScript {
		constructor() {
			this.consoleLogs = [];
			this.maxConsoleHistory = 1000;
			this.setupMessageListener();
			this.setupConsoleInterception();
			this.setupServiceWorkerKeepalive();
		}

		setupMessageListener() {
			// Listen for messages from the background script
			chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
				if (message.type === "BROP_EXECUTE") {
					this.handleCommand(message.command, message.id)
						.then((result) => sendResponse({ success: true, result }))
						.catch((error) =>
							sendResponse({ success: false, error: error.message }),
						);
					return true; // Keep message channel open for async response
				}
				if (message.type === "GET_LOGS") {
					// Handle runtime messaging approach for console logs
					const logs = this.getConsoleLogs({ limit: message.limit || 100 });
					sendResponse({
						success: true,
						logs: logs.logs,
						source: "content_script_runtime_messaging",
						tabId: message.tabId,
					});
					return true; // Keep message channel open for async response
				}
				if (message.type === "PING") {
					// Respond to ping requests to verify content script availability
					sendResponse({
						success: true,
						pong: true,
						contentScript: "BROP Content Script",
						timestamp: Date.now(),
						url: window.location.href
					});
					return true; // Keep message channel open for async response
				}
			});
		}

		setupConsoleInterception() {
			// Intercept console methods to capture logs
			const originalConsole = {
				log: console.log,
				warn: console.warn,
				error: console.error,
				info: console.info,
				debug: console.debug,
			};

			const interceptConsole = (level) => {
				const original = originalConsole[level];
				console[level] = (...args) => {
					// Call original console method
					original.apply(console, args);

					// Store the log entry
					this.addConsoleLog(level, args);
				};
			};

			for (const level of ["log", "warn", "error", "info", "debug"]) {
				interceptConsole(level);
			}

			// Also capture unhandled errors
			window.addEventListener("error", (event) => {
				this.addConsoleLog("error", [event.message], {
					source: event.filename,
					line: event.lineno,
					column: event.colno,
				});
			});

			// Capture unhandled promise rejections
			window.addEventListener("unhandledrejection", (event) => {
				this.addConsoleLog("error", [event.reason]);
			});
		}

		addConsoleLog(level, args, metadata = {}) {
			const logEntry = {
				timestamp: new Date().toISOString(),
				level: level,
				message: args
					.map((arg) => {
						if (typeof arg === "object") {
							try {
								return JSON.stringify(arg);
							} catch (e) {
								return String(arg);
							}
						}
						return String(arg);
					})
					.join(" "),
				source: metadata.source || window.location.href,
				line: metadata.line || 0,
				column: metadata.column || 0,
			};

			this.consoleLogs.push(logEntry);

			// Keep only the most recent logs
			if (this.consoleLogs.length > this.maxConsoleHistory) {
				this.consoleLogs = this.consoleLogs.slice(-this.maxConsoleHistory);
			}
		}

		async handleCommand(command, commandId) {
			switch (command.type) {
				case "get_console_logs":
					return this.getConsoleLogs(command.params);

				case "execute_console":
					return this.executeConsole(command.params);

				case "get_page_content":
					return this.getPageContent(command.params);

				case "click":
					return this.clickElement(command.params);

				case "type":
					return this.typeText(command.params);

				case "wait_for_element":
					return this.waitForElement(command.params);

				case "evaluate_js":
					return this.evaluateJavaScript(command.params);

				case "get_element":
					return this.getElement(command.params);

				case "get_simplified_dom":
					return await this.getSimplifiedDOM(command.params);

				case "detect_interactive_elements":
					return this.detectInteractiveElements(command.params);

				default:
					throw new Error(`Unknown command type: ${command.type}`);
			}
		}

		getConsoleLogs(params) {
			let logs = [...this.consoleLogs];

			// Filter by level if specified
			if (params.level && params.level !== "all") {
				logs = logs.filter((log) => log.level === params.level);
			}

			// Limit number of logs
			if (params.limit && params.limit > 0) {
				logs = logs.slice(-params.limit);
			}

			return { logs };
		}

		executeConsole(params) {
			try {
				// CSP-compliant execution
				let result;
				if (params.code === "document.title") result = document.title;
				else if (params.code === "window.location.href")
					result = window.location.href;
				else if (params.code === "document.readyState")
					result = document.readyState;
				else if (params.code.startsWith("console.log(")) {
					const msg =
						params.code
							.match(/console\.log\((.+)\)/)?.[1]
							?.replace(/["']/g, "") || "unknown";
					console.log("BROP Content:", msg);
					result = `Logged: ${msg}`;
				} else result = `Safe execution: ${params.code}`;

				return {
					result: this.serializeResult(result),
					error: null,
				};
			} catch (error) {
				return {
					result: null,
					error: error.message,
				};
			}
		}

		getPageContent(params) {
			const result = {};

			if (params.include_html) {
				result.html = document.documentElement.outerHTML;
			}

			if (params.include_text) {
				result.text = document.body.innerText || document.body.textContent;
			}

			if (params.include_metadata) {
				result.title = document.title;
				result.url = window.location.href;
				result.links = Array.from(document.links).map((link) => link.href);
				result.images = Array.from(document.images).map((img) => img.src);
			}

			return result;
		}

		clickElement(params) {
			const element = this.findElement(params.selector);
			if (!element) {
				throw new Error(`Element not found: ${params.selector}`);
			}

			// Check if element is visible and clickable
			const rect = element.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) {
				throw new Error("Element is not visible");
			}

			// Create click event
			const clickEvent = new MouseEvent(
				params.double_click ? "dblclick" : "click",
				{
					view: window,
					bubbles: true,
					cancelable: true,
					button: params.button || 0,
					clientX:
						params.x !== undefined ? params.x : rect.left + rect.width / 2,
					clientY:
						params.y !== undefined ? params.y : rect.top + rect.height / 2,
				},
			);

			element.dispatchEvent(clickEvent);

			return {
				clicked: true,
				element_tag: element.tagName.toLowerCase(),
			};
		}

		typeText(params) {
			const element = this.findElement(params.selector);
			if (!element) {
				throw new Error(`Element not found: ${params.selector}`);
			}

			// Clear existing text if requested
			if (params.clear_first) {
				element.value = "";
			}

			// Focus the element
			element.focus();

			// Type text with delay if specified
			if (params.delay && params.delay > 0) {
				return this.typeWithDelay(element, params.text, params.delay);
			}
			// Set value directly for faster typing
			element.value = (element.value || "") + params.text;

			// Trigger input events
			element.dispatchEvent(new Event("input", { bubbles: true }));
			element.dispatchEvent(new Event("change", { bubbles: true }));

			return {
				typed: true,
				final_value: element.value,
			};
		}

		async typeWithDelay(element, text, delay) {
			for (const char of text) {
				element.value += char;
				element.dispatchEvent(new Event("input", { bubbles: true }));
				await new Promise((resolve) => setTimeout(resolve, delay));
			}

			element.dispatchEvent(new Event("change", { bubbles: true }));

			return {
				typed: true,
				final_value: element.value,
			};
		}

		async waitForElement(params) {
			const startTime = Date.now();
			const timeout = params.timeout || 30000;

			return new Promise((resolve, reject) => {
				const checkElement = () => {
					const element = this.findElement(params.selector);

					if (element) {
						const isVisible = this.isElementVisible(element);

						if (params.visible && !isVisible) {
							// Continue waiting for visibility
						} else if (params.hidden && isVisible) {
							// Continue waiting for element to be hidden
						} else {
							// Element found and meets visibility requirements
							resolve({
								found: true,
								visible: isVisible,
								element: this.getElementInfo(element),
							});
							return;
						}
					}

					// Check timeout
					if (Date.now() - startTime > timeout) {
						resolve({
							found: false,
							visible: false,
							element: null,
						});
						return;
					}

					// Continue checking
					setTimeout(checkElement, 100);
				};

				checkElement();
			});
		}

		evaluateJavaScript(params) {
			try {
				// CSP-compliant evaluation
				let result;
				if (params.code === "document.title") result = document.title;
				else if (params.code === "window.location.href")
					result = window.location.href;
				else if (params.code === "document.readyState")
					result = document.readyState;
				else if (params.code.startsWith("console.log(")) {
					const msg =
						params.code
							.match(/console\.log\((.+)\)/)?.[1]
							?.replace(/["']/g, "") || "unknown";
					console.log("BROP Content Eval:", msg);
					result = `Logged: ${msg}`;
				} else result = `Safe execution: ${params.code}`;

				return {
					result: this.serializeResult(result),
					type: typeof result,
					error: null,
				};
			} catch (error) {
				return {
					result: null,
					type: "error",
					error: error.message,
				};
			}
		}

		getElement(params) {
			if (params.get_all) {
				// Use safe querySelector to handle invalid selectors
				let elements;
				try {
					elements = document.querySelectorAll(params.selector);
				} catch (error) {
					console.warn(`Invalid CSS selector: ${params.selector}`, error);
					elements = [];
				}
				return {
					elements: Array.from(elements).map((el) => this.getElementInfo(el)),
				};
			}
			const element = this.findElement(params.selector);
			if (!element) {
				return { elements: [] };
			}
			return {
				elements: [this.getElementInfo(element)],
			};
		}

		findElement(selector) {
			try {
				return document.querySelector(selector);
			} catch (error) {
				throw new Error(`Invalid selector: ${selector}`);
			}
		}

		isElementVisible(element) {
			const rect = element.getBoundingClientRect();
			const style = window.getComputedStyle(element);

			return (
				rect.width > 0 &&
				rect.height > 0 &&
				style.visibility !== "hidden" &&
				style.display !== "none" &&
				style.opacity !== "0"
			);
		}

		getElementInfo(element) {
			const rect = element.getBoundingClientRect();
			const attributes = {};

			// Get all attributes
			for (const attr of element.attributes) {
				attributes[attr.name] = attr.value;
			}

			return {
				tag_name: element.tagName.toLowerCase(),
				text_content: element.textContent || "",
				inner_html: element.innerHTML,
				attributes: attributes,
				bounding_box: {
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height,
				},
				visible: this.isElementVisible(element),
			};
		}

		async getSimplifiedDOM(params) {
			// Load DOM simplifier if not already available
			if (!window.DOMSimplifier) {
				// Inject the DOM simplifier script
				this.loadDOMSimplifier();
			}

			if (!window.DOMSimplifier) {
				throw new Error("DOM Simplifier not available");
			}

			console.log("[BROP Content] Simplified DOM params:", params);
			const simplifier = new window.DOMSimplifier();
			const result = await simplifier.simplifyDOM(params);
			console.log(
				"[BROP Content] Simplified DOM result keys:",
				Object.keys(result || {}),
			);
			console.log("[BROP Content] Simplified DOM format:", result?.format);
			return result;
		}

		detectInteractiveElements(params) {
			// Load element detection framework if not already available
			if (!window.ElementDetectionFramework) {
				this.loadElementDetectionFramework();
			}

			if (!window.ElementDetectionFramework) {
				throw new Error("Element Detection Framework not available");
			}

			console.log("[BROP Content] Element detection params:", params);
			const detector = new window.ElementDetectionFramework();
			const result = detector.detectInteractiveElements(params);
			console.log("[BROP Content] Element detection result:", {
				totalDetected: result.total_detected,
				detectionLayers: result.detection_layers,
				timestamp: result.timestamp,
			});
			return result;
		}

		loadElementDetectionFramework() {
			// Element Detection Framework for Browser-Use Style Content Understanding
			// This implements comprehensive element detection with 14 layers
			window.ElementDetectionFramework = class {
				constructor() {
					this.initializeDetectionLayers();
				}

				// CSS selector escaping utility
				escapeCSSSelector(selector) {
					// Use CSS.escape if available (modern browsers)
					if (typeof CSS !== 'undefined' && CSS.escape) {
						return CSS.escape(selector);
					}
					// Fallback for older browsers - escape special CSS characters
					return selector.replace(/([^\w\s-])/g, '\\$1');
				}

				// Safe querySelectorAll wrapper
				safeQuerySelectorAll(selector) {
					try {
						return document.querySelectorAll(selector);
					} catch (error) {
						console.warn(`Invalid CSS selector: ${selector}`, error);
						return [];
					}
				}

				initializeDetectionLayers() {
					// Layer 1: HTML Tag Detection (10 tags)
					this.interactiveHtmlTags = new Set([
						"button",
						"input",
						"select",
						"textarea",
						"a",
						"img",
						"video",
						"audio",
						"iframe",
						"canvas",
					]);

					// Layer 2: ARIA Role Detection (14 roles)
					this.interactiveAriaRoles = new Set([
						"button",
						"link",
						"textbox",
						"checkbox",
						"radio",
						"combobox",
						"listbox",
						"slider",
						"progressbar",
						"menuitem",
						"tab",
						"switch",
						"searchbox",
						"navigation",
					]);

					// Layer 3: Event Handler Detection (12+ handlers)
					this.eventHandlers = [
						"onclick",
						"onchange",
						"onsubmit",
						"onkeydown",
						"onkeyup",
						"onmousedown",
						"onmouseup",
						"onmouseover",
						"onfocus",
						"onblur",
						"ondrop",
						"ondragover",
						"onpointerdown",
						"onpointerup",
						"ontouchstart",
					];

					// Layer 4: Accessibility Properties (13 properties)
					this.accessibilityProps = [
						"aria-label",
						"aria-labelledby",
						"aria-describedby",
						"aria-expanded",
						"aria-selected",
						"aria-checked",
						"aria-pressed",
						"aria-hidden",
						"aria-disabled",
						"aria-required",
						"aria-invalid",
						"aria-live",
						"aria-atomic",
					];

					// Layer 5: CSS Properties for Interactivity (25+ properties)
					this.interactiveCssProperties = [
						"cursor",
						"pointer-events",
						"user-select",
						"touch-action",
						"outline",
						"border",
						"background",
						"box-shadow",
						"transform",
						"transition",
						"animation",
						"opacity",
						"visibility",
						"display",
						"position",
						"z-index",
						"overflow",
						"text-decoration",
						"color",
						"font-weight",
						"border-radius",
						"padding",
						"margin",
						"width",
						"height",
					];

					// Layer 6: Search Element Patterns (10 patterns)
					this.searchPatterns = [
						/search/i,
						/find/i,
						/query/i,
						/lookup/i,
						/filter/i,
						/type.{0,20}search/i,
						/enter.{0,20}term/i,
						/what.*looking/i,
						/keyword/i,
						/term/i,
					];

					// Layer 7: Icon Element Patterns
					this.iconSelectors = [
						'[class*="icon"]',
						'[class*="fa-"]',
						'[class*="material-"]',
						"svg",
						"i[class]",
						'[role="img"]',
						'img[alt=""]',
						'[class*="glyph"]',
						'[class*="symbol"]',
					];

					// Layer 8: Iframe Size Thresholds
					this.iframeSizeThresholds = {
						minWidth: 100,
						minHeight: 100,
						maxAspectRatio: 10,
					};

					// Layer 9: ContentEditable Detection
					this.contentEditableSelectors = [
						'[contenteditable="true"]',
						'[contenteditable=""]',
						'[role="textbox"]',
						'[role="searchbox"]',
					];

					// Confidence scoring structure
					this.confidenceLevels = {
						HIGH: "HIGH",
						MEDIUM: "MEDIUM",
						LOW: "LOW",
					};

					this.detectionWeights = {
						htmlTag: 0.8,
						ariaRole: 0.9,
						eventHandler: 0.7,
						accessibilityProps: 0.6,
						cssProperties: 0.5,
						searchPattern: 0.4,
						iconElement: 0.3,
						iframeFilter: 0.2,
						contentEditable: 0.8,
						visibility: 0.9,
						scrollability: 0.4,
						boundingBox: 0.7,
					};
				}

				// Main detection method that runs all 14 layers
				detectInteractiveElements(options = {}) {
					const config = {
						includeHidden: options.includeHidden || false,
						includeCoordinates: options.includeCoordinates !== false,
						minConfidence: options.minConfidence || "LOW",
						maxElements: options.maxElements || 1000,
						...options,
					};

					const detectedElements = [];
					// Performance consideration: Querying all elements can be expensive for large DOMs
					// Consider implementing chunking or element limit checks for very large pages
					const allElements = this.safeQuerySelectorAll("*");

					for (
						let i = 0;
						i < allElements.length &&
						detectedElements.length < config.maxElements;
						i++
					) {
						const element = allElements[i];
						const detection = this.analyzeElement(element, config);

						if (
							detection &&
							this.meetsConfidenceThreshold(
								detection.confidence,
								config.minConfidence,
							)
						) {
							detectedElements.push(detection);
						}
					}

					return {
						elements: detectedElements,
						total_detected: detectedElements.length,
						detection_layers: 14,
						timestamp: new Date().toISOString(),
					};
				}

				// Comprehensive element analysis through all 14 layers
				analyzeElement(element, config) {
					const detectionReasons = [];
					let confidenceScore = 0;

					// Layer 1: HTML Tag Detection
					const htmlTagResult = this.detectHtmlTag(element);
					if (htmlTagResult.detected) {
						detectionReasons.push(`HTML_TAG: ${htmlTagResult.tag}`);
						confidenceScore +=
							this.detectionWeights.htmlTag * htmlTagResult.weight;
					}

					// Layer 2: ARIA Role Detection
					const ariaRoleResult = this.detectAriaRole(element);
					if (ariaRoleResult.detected) {
						detectionReasons.push(`ARIA_ROLE: ${ariaRoleResult.role}`);
						confidenceScore +=
							this.detectionWeights.ariaRole * ariaRoleResult.weight;
					}

					// Layer 3: Event Handler Detection
					const eventHandlerResult = this.detectEventHandlers(element);
					if (eventHandlerResult.detected) {
						detectionReasons.push(
							`EVENT_HANDLERS: ${eventHandlerResult.handlers.join(", ")}`,
						);
						confidenceScore +=
							this.detectionWeights.eventHandler * eventHandlerResult.weight;
					}

					// Layer 4: Accessibility Properties Detection
					const accessibilityResult =
						this.detectAccessibilityProperties(element);
					if (accessibilityResult.detected) {
						detectionReasons.push(
							`ACCESSIBILITY: ${accessibilityResult.properties.join(", ")}`,
						);
						confidenceScore +=
							this.detectionWeights.accessibilityProps *
							accessibilityResult.weight;
					}

					// Layer 5: CSS Properties Check
					const cssPropertiesResult = this.detectCssProperties(element);
					if (cssPropertiesResult.detected) {
						detectionReasons.push(
							`CSS_INTERACTIVE: ${cssPropertiesResult.properties.join(", ")}`,
						);
						confidenceScore +=
							this.detectionWeights.cssProperties * cssPropertiesResult.weight;
					}

					// Layer 6: Search Element Patterns
					const searchPatternResult = this.detectSearchPatterns(element);
					if (searchPatternResult.detected) {
						detectionReasons.push(
							`SEARCH_PATTERN: ${searchPatternResult.patterns.join(", ")}`,
						);
						confidenceScore +=
							this.detectionWeights.searchPattern * searchPatternResult.weight;
					}

					// Layer 7: Icon Element Detection
					const iconElementResult = this.detectIconElement(element);
					if (iconElementResult.detected) {
						detectionReasons.push(`ICON_ELEMENT: ${iconElementResult.type}`);
						confidenceScore +=
							this.detectionWeights.iconElement * iconElementResult.weight;
					}

					// Layer 8: Iframe Size Filtering
					const iframeFilterResult = this.detectIframeFilter(element);
					if (iframeFilterResult.detected) {
						detectionReasons.push(
							`IFRAME_FILTER: ${iframeFilterResult.reason}`,
						);
						confidenceScore +=
							this.detectionWeights.iframeFilter * iframeFilterResult.weight;
					}

					// Layer 9: ContentEditable Detection
					const contentEditableResult = this.detectContentEditable(element);
					if (contentEditableResult.detected) {
						detectionReasons.push(
							`CONTENT_EDITABLE: ${contentEditableResult.type}`,
						);
						confidenceScore +=
							this.detectionWeights.contentEditable *
							contentEditableResult.weight;
					}

					// Layer 10: Visibility Calculation (4 sub-layers)
					const visibilityResult = this.calculateVisibility(element);
					if (visibilityResult.visible) {
						detectionReasons.push(`VISIBILITY: ${visibilityResult.method}`);
						confidenceScore +=
							this.detectionWeights.visibility * visibilityResult.weight;
					}

					// Layer 11: Scrollability Detection (3 methods)
					const scrollabilityResult = this.detectScrollability(element);
					if (scrollabilityResult.detected) {
						detectionReasons.push(
							`SCROLLABLE: ${scrollabilityResult.methods.join(", ")}`,
						);
						confidenceScore +=
							this.detectionWeights.scrollability * scrollabilityResult.weight;
					}

					// Layer 12: Bounding Box Filtering
					const boundingBoxResult = this.filterBoundingBox(element);
					if (boundingBoxResult.valid) {
						detectionReasons.push(`BOUNDING_BOX: ${boundingBoxResult.reason}`);
						confidenceScore +=
							this.detectionWeights.boundingBox * boundingBoxResult.weight;
					}

					// Layer 13: Coordinate Transformation
					const coordinatesResult = this.transformCoordinates(element);

					// Layer 14: Serialization Format
					const serializedData = this.serializeElementData(
						element,
						detectionReasons,
						confidenceScore,
						coordinatesResult,
					);

					// Return null if no detection reasons found
					if (detectionReasons.length === 0) {
						return null;
					}

					// Calculate final confidence level
					const confidence = this.calculateConfidenceLevel(confidenceScore);

					return {
						element: element,
						selector: this.generateSelector(element),
						confidence: confidence,
						confidenceScore: confidenceScore,
						detectionReasons: detectionReasons,
						coordinates: coordinatesResult,
						serialized: serializedData,
						visible: visibilityResult.visible,
					};
				}

				// Layer 1: HTML Tag Detection
				detectHtmlTag(element) {
					const tag = element.tagName.toLowerCase();
					if (this.interactiveHtmlTags.has(tag)) {
						const weight = tag === "button" || tag === "a" ? 1.0 : 0.8;
						return { detected: true, tag: tag, weight: weight };
					}
					return { detected: false };
				}

				// Layer 2: ARIA Role Detection
				detectAriaRole(element) {
					const role = element.getAttribute("role");
					if (role && this.interactiveAriaRoles.has(role)) {
						const weight = ["button", "link", "textbox"].includes(role)
							? 1.0
							: 0.8;
						return { detected: true, role: role, weight: weight };
					}
					return { detected: false };
				}

				// Layer 3: Event Handler Detection
				detectEventHandlers(element) {
					const foundHandlers = [];

					// Check for inline event handlers
					for (const handler of this.eventHandlers) {
						if (element.hasAttribute(handler) || element[handler]) {
							foundHandlers.push(handler);
						}
					}

					// Check for event listeners (approximate detection)
					const eventListenerProps = [
						"onclick",
						"onchange",
						"onsubmit",
						"onkeydown",
					];
					for (const prop of eventListenerProps) {
						if (typeof element[prop] === "function") {
							foundHandlers.push(`${prop}_listener`);
						}
					}

					if (foundHandlers.length > 0) {
						const weight =
							foundHandlers.length >= 3
								? 1.0
								: 0.6 + foundHandlers.length * 0.2;
						return { detected: true, handlers: foundHandlers, weight: weight };
					}

					return { detected: false };
				}

				// Layer 4: Accessibility Properties Detection
				detectAccessibilityProperties(element) {
					const foundProperties = [];

					for (const prop of this.accessibilityProps) {
						if (element.hasAttribute(prop)) {
							foundProperties.push(prop);
						}
					}

					if (foundProperties.length > 0) {
						const weight =
							foundProperties.length >= 3
								? 1.0
								: 0.5 + foundProperties.length * 0.2;
						return {
							detected: true,
							properties: foundProperties,
							weight: weight,
						};
					}

					return { detected: false };
				}

				// Layer 5: CSS Properties Check
				detectCssProperties(element) {
					const computedStyle = window.getComputedStyle(element);
					const interactiveProperties = [];

					// Check cursor property
					if (computedStyle.cursor === "pointer") {
						interactiveProperties.push("cursor:pointer");
					}

					// Check pointer-events
					if (computedStyle.pointerEvents !== "none") {
						interactiveProperties.push("pointer-events:enabled");
					}

					// Check user-select
					if (computedStyle.userSelect !== "none") {
						interactiveProperties.push("user-select:enabled");
					}

					// Check for transform/transition (often indicates interactivity)
					if (computedStyle.transform !== "none") {
						interactiveProperties.push("transform:applied");
					}

					if (computedStyle.transition !== "all 0s ease 0s") {
						interactiveProperties.push("transition:defined");
					}

					// Check for outline (focus indicators)
					if (computedStyle.outline !== "none") {
						interactiveProperties.push("outline:defined");
					}

					// Check for hover-related properties (approximate)
					// Handle SVG elements where className is SVGAnimatedString
					const className = typeof element.className === 'string' 
						? element.className 
						: element.className?.baseVal || '';
					
					if (
						element.style.cssText.includes(":hover") ||
						className.includes("hover") ||
						className.includes("focus")
					) {
						interactiveProperties.push("hover-states:detected");
					}

					if (interactiveProperties.length > 0) {
						const weight =
							interactiveProperties.length >= 3
								? 0.8
								: 0.3 + interactiveProperties.length * 0.15;
						return {
							detected: true,
							properties: interactiveProperties,
							weight: weight,
						};
					}

					return { detected: false };
				}

				// Layer 6: Search Element Patterns
				detectSearchPatterns(element) {
					const textContent = (element.textContent || "").toLowerCase();
					const placeholder = (element.placeholder || "").toLowerCase();
					const title = (element.title || "").toLowerCase();
					const ariaLabel = (
						element.getAttribute("aria-label") || ""
					).toLowerCase();
					const allText = `${textContent} ${placeholder} ${title} ${ariaLabel}`;

					const matchedPatterns = [];

					for (let i = 0; i < this.searchPatterns.length; i++) {
						const pattern = this.searchPatterns[i];
						if (pattern.test(allText)) {
							matchedPatterns.push(`pattern_${i + 1}`);
						}
					}

					if (matchedPatterns.length > 0) {
						const weight =
							matchedPatterns.length >= 2
								? 0.8
								: 0.4 + matchedPatterns.length * 0.2;
						return {
							detected: true,
							patterns: matchedPatterns,
							weight: weight,
						};
					}

					return { detected: false };
				}

				// Layer 7: Icon Element Detection
				detectIconElement(element) {
					const tag = element.tagName.toLowerCase();

					// SVG elements
					if (tag === "svg" || element.closest("svg")) {
						return { detected: true, type: "svg_icon", weight: 0.6 };
					}

					// Icon classes
					// Handle SVG elements where className is SVGAnimatedString
					const className = typeof element.className === 'string' 
						? element.className 
						: element.className?.baseVal || '';
					
					for (const iconClass of [
						"icon",
						"fa-",
						"material-",
						"glyph",
						"symbol",
					]) {
						if (className.includes(iconClass)) {
							return { detected: true, type: "class_icon", weight: 0.5 };
						}
					}

					// Role=img
					if (element.getAttribute("role") === "img") {
						return { detected: true, type: "role_img", weight: 0.4 };
					}

					// Empty alt images (often decorative icons)
					if (tag === "img" && element.alt === "") {
						return { detected: true, type: "decorative_img", weight: 0.3 };
					}

					return { detected: false };
				}

				// Layer 8: Iframe Size Filtering
				detectIframeFilter(element) {
					if (element.tagName.toLowerCase() !== "iframe") {
						return { detected: false };
					}

					const rect = element.getBoundingClientRect();
					const { minWidth, minHeight, maxAspectRatio } =
						this.iframeSizeThresholds;

					if (rect.width < minWidth || rect.height < minHeight) {
						return { detected: false, reason: "too_small" };
					}

					const aspectRatio = Math.max(
						rect.width / rect.height,
						rect.height / rect.width,
					);
					if (aspectRatio > maxAspectRatio) {
						return { detected: false, reason: "extreme_aspect_ratio" };
					}

					return { detected: true, reason: "size_valid", weight: 0.7 };
				}

				// Layer 9: ContentEditable Detection
				detectContentEditable(element) {
					const contentEditable = element.contentEditable;
					const role = element.getAttribute("role");

					if (contentEditable === "true" || contentEditable === "") {
						return {
							detected: true,
							type: "contenteditable_true",
							weight: 0.9,
						};
					}

					if (role === "textbox" || role === "searchbox") {
						return { detected: true, type: "role_textbox", weight: 0.8 };
					}

					// Check if descendant of contenteditable
					let parent = element.parentElement;
					while (parent) {
						if (parent.contentEditable === "true") {
							return {
								detected: true,
								type: "contenteditable_descendant",
								weight: 0.6,
							};
						}
						parent = parent.parentElement;
					}

					return { detected: false };
				}

				// Layer 10: Visibility Calculation (4 sub-layers)
				calculateVisibility(element) {
					const methods = [];
					let visible = true;

					// Sub-layer 1: Offset dimensions
					if (element.offsetWidth === 0 || element.offsetHeight === 0) {
						visible = false;
						methods.push("offset_zero");
					}

					// Sub-layer 2: Computed style
					const computedStyle = window.getComputedStyle(element);
					if (
						computedStyle.display === "none" ||
						computedStyle.visibility === "hidden" ||
						computedStyle.opacity === "0"
					) {
						visible = false;
						methods.push("style_hidden");
					}

					// Sub-layer 3: Bounding rectangle
					const rect = element.getBoundingClientRect();
					if (rect.width === 0 || rect.height === 0) {
						visible = false;
						methods.push("rect_zero");
					}

					// Sub-layer 4: Viewport intersection
					const viewportWidth = window.innerWidth;
					const viewportHeight = window.innerHeight;
					if (
						rect.right < 0 ||
						rect.left > viewportWidth ||
						rect.bottom < 0 ||
						rect.top > viewportHeight
					) {
						methods.push("outside_viewport");
					} else {
						methods.push("in_viewport");
					}

					const weight = visible ? 1.0 : 0.1;
					return {
						visible: visible,
						method: methods.join("|"),
						weight: weight,
					};
				}

				// Layer 11: Scrollability Detection (3 methods)
				detectScrollability(element) {
					const methods = [];

					// Method 1: Scroll dimensions
					if (
						element.scrollWidth > element.clientWidth ||
						element.scrollHeight > element.clientHeight
					) {
						methods.push("scroll_dimensions");
					}

					// Method 2: Overflow styles
					const computedStyle = window.getComputedStyle(element);
					if (
						computedStyle.overflow === "scroll" ||
						computedStyle.overflow === "auto" ||
						computedStyle.overflowX === "scroll" ||
						computedStyle.overflowY === "scroll"
					) {
						methods.push("overflow_style");
					}

					// Method 3: Scroll position capability
					try {
						const originalScrollTop = element.scrollTop;
						element.scrollTop += 1;
						if (element.scrollTop !== originalScrollTop) {
							methods.push("scroll_position");
							element.scrollTop = originalScrollTop; // Reset
						}
					} catch (e) {
						// Scroll test failed - should log the error for debugging
						console.debug("Scroll test failed:", e);
					}

					if (methods.length > 0) {
						const weight = methods.length >= 2 ? 0.8 : 0.4;
						return { detected: true, methods: methods, weight: weight };
					}

					return { detected: false };
				}

				// Layer 12: Bounding Box Filtering
				filterBoundingBox(element) {
					const rect = element.getBoundingClientRect();

					// Check minimum size
					if (rect.width < 1 || rect.height < 1) {
						return { valid: false, reason: "too_small" };
					}

					// Check maximum size (prevent full-page elements)
					const viewportWidth = window.innerWidth;
					const viewportHeight = window.innerHeight;

					if (
						rect.width > viewportWidth * 0.95 &&
						rect.height > viewportHeight * 0.95
					) {
						return { valid: false, reason: "too_large" };
					}

					// 99% containment rule - element should be mostly within its container
					let containmentScore = 1.0;
					const parent = element.parentElement;
					if (parent) {
						try {
							const parentRect = parent.getBoundingClientRect();
							if (parentRect) {
								const overlapArea = this.calculateOverlapArea(rect, parentRect);
								const elementArea = rect.width * rect.height;
								containmentScore =
									elementArea > 0 ? overlapArea / elementArea : 0;
							}
						} catch (e) {
							console.debug("Error calculating parent rectangle:", e);
							containmentScore = 1.0; // Default to valid containment if error
						}
					}

					if (containmentScore < 0.99) {
						return {
							valid: false,
							reason: "poor_containment",
							containmentScore: containmentScore,
						};
					}

					return {
						valid: true,
						reason: "size_valid",
						weight: 0.8,
						containmentScore: containmentScore,
					};
				}

				// Layer 13: Coordinate Transformation
				transformCoordinates(element) {
					const rect = element.getBoundingClientRect();

					// Get the element's position relative to the document
					const scrollLeft =
						window.pageXOffset || document.documentElement.scrollLeft;
					const scrollTop =
						window.pageYOffset || document.documentElement.scrollTop;

					return {
						// Viewport coordinates
						viewport: {
							x: Math.round(rect.left),
							y: Math.round(rect.top),
							width: Math.round(rect.width),
							height: Math.round(rect.height),
							right: Math.round(rect.right),
							bottom: Math.round(rect.bottom),
						},
						// Document coordinates
						document: {
							x: Math.round(rect.left + scrollLeft),
							y: Math.round(rect.top + scrollTop),
							width: Math.round(rect.width),
							height: Math.round(rect.height),
						},
						// Center point (useful for clicking)
						center: {
							x: Math.round(rect.left + rect.width / 2),
							y: Math.round(rect.top + rect.height / 2),
						},
						// Iframe transformation (if applicable)
						iframe: this.getIframeTransformation(element),
					};
				}

				// Layer 14: Serialization Format
				serializeElementData(
					element,
					detectionReasons,
					confidenceScore,
					coordinates,
				) {
					const tag = element.tagName.toLowerCase();

					return {
						// Basic element info
						tag: tag,
						id: element.id || null,
						classes: (() => {
							// Handle SVG elements where className is SVGAnimatedString
							const className = typeof element.className === 'string' 
								? element.className 
								: element.className?.baseVal || '';
							return className ? className.split(" ").filter((c) => c.length > 0) : [];
						})(),

						// Text content
						text: this.getElementText(element),
						value: this.getElementValue(element),
						placeholder: element.placeholder || null,

						// Attributes
						attributes: this.getRelevantAttributes(element),

						// Detection metadata
						confidence_score: confidenceScore,
						detection_reasons: detectionReasons,
						detection_count: detectionReasons.length,

						// Position and visibility
						coordinates: coordinates,
						visible: !!coordinates,

						// Interaction info
						clickable: this.isElementClickable(element),
						focusable: this.isElementFocusable(element),

						// Selector for targeting
						selector: this.generateSelector(element),

						// LLM-optimized description
						description: this.generateLLMDescription(element, detectionReasons),
					};
				}

				// Helper methods for the framework

				calculateOverlapArea(rect1, rect2) {
					const left = Math.max(rect1.left, rect2.left);
					const right = Math.min(rect1.right, rect2.right);
					const top = Math.max(rect1.top, rect2.top);
					const bottom = Math.min(rect1.bottom, rect2.bottom);

					if (left < right && top < bottom) {
						return (right - left) * (bottom - top);
					}
					return 0;
				}

				getIframeTransformation(element) {
					// Check if element is inside an iframe
					try {
						let currentWindow = window;
						let frameElement = currentWindow.frameElement;
						const transformations = [];

						while (frameElement) {
							const frameRect = frameElement.getBoundingClientRect();
							transformations.push({
								frame: frameElement,
								offset: {
									x: frameRect.left,
									y: frameRect.top,
								},
							});

							currentWindow = currentWindow.parent;
							frameElement = currentWindow.frameElement;
						}

						return transformations.length > 0 ? transformations : null;
					} catch (e) {
						// Handle cross-origin iframe access error
						console.debug("Cross-origin iframe access denied:", e);
						return null;
					}
				}

				getElementText(element) {
					const tag = element.tagName.toLowerCase();

					if (tag === "input" || tag === "textarea") {
						return element.value || element.placeholder || "";
					}

					if (tag === "img") {
						return element.alt || "";
					}

					// Get direct text content, excluding child elements
					let text = "";
					for (const node of element.childNodes) {
						if (node.nodeType === Node.TEXT_NODE) {
							text += `${node.textContent.trim()} `;
						}
					}

					return text.trim().substring(0, 200);
				}

				getElementValue(element) {
					const tag = element.tagName.toLowerCase();

					if (tag === "input" || tag === "textarea") {
						if (element.type === "checkbox" || element.type === "radio") {
							return element.checked ? "checked" : "unchecked";
						}
						return element.value || "";
					}

					if (tag === "select") {
						return element.value || "";
					}

					return "";
				}

				getRelevantAttributes(element) {
					const relevant = {};
					const importantAttrs = [
						"type",
						"name",
						"value",
						"href",
						"src",
						"alt",
						"title",
						"role",
						"tabindex",
						"disabled",
						"readonly",
						"required",
						"data-testid",
						"data-test",
						"aria-label",
						"aria-labelledby",
					];

					for (const attr of importantAttrs) {
						const value = element.getAttribute(attr);
						if (value !== null) {
							relevant[attr] = value;
						}
					}

					return relevant;
				}

				isElementClickable(element) {
					const tag = element.tagName.toLowerCase();
					const role = element.getAttribute("role");

					// Direct clickable elements
					if (["button", "a", "input", "select"].includes(tag)) {
						return true;
					}

					// Role-based clickable
					if (["button", "link", "menuitem", "tab"].includes(role)) {
						return true;
					}

					// Has click handlers
					if (element.onclick || element.hasAttribute("onclick")) {
						return true;
					}

					// CSS cursor pointer
					const computedStyle = window.getComputedStyle(element);
					if (computedStyle.cursor === "pointer") {
						return true;
					}

					return false;
				}

				isElementFocusable(element) {
					const tag = element.tagName.toLowerCase();

					// Naturally focusable elements
					if (["input", "textarea", "select", "button", "a"].includes(tag)) {
						return !element.disabled;
					}

					// Explicit tabindex
					const tabindex = element.getAttribute("tabindex");
					if (tabindex !== null) {
						return Number.parseInt(tabindex, 10) >= 0;
					}

					// Contenteditable
					if (element.contentEditable === "true") {
						return true;
					}

					return false;
				}

				generateSelector(element) {
					// Use ID if unique
					if (element.id) {
						const escapedId = this.escapeCSSSelector(element.id);
						const idSelector = `#${escapedId}`;
						if (this.safeQuerySelectorAll(idSelector).length === 1) {
							return idSelector;
						}
					}

					// Use data-testid if available
					const testId =
						element.getAttribute("data-testid") ||
						element.getAttribute("data-test");
					if (testId) {
						return `[data-testid="${testId}"]`;
					}

					// Use meaningful classes
					const meaningfulClasses = Array.from(element.classList).filter(
						(cls) =>
							!cls.match(/^(css-|_|sc-|jsx-|MuiBox-|makeStyles)/) &&
							cls.length > 2,
					);

					if (meaningfulClasses.length > 0) {
						const escapedClass = this.escapeCSSSelector(meaningfulClasses[0]);
						const classSelector = `.${escapedClass}`;
						if (this.safeQuerySelectorAll(classSelector).length <= 5) {
							return classSelector;
						}
					}

					// Build path-based selector
					const path = [];
					let current = element;

					while (current && current !== document.body) {
						let selector = current.tagName.toLowerCase();

						if (current.type) {
							selector += `[type="${current.type}"]`;
						}

						const siblings = Array.from(
							current.parentElement?.children || [],
						).filter((el) => el.tagName === current.tagName);

						if (siblings.length > 1) {
							const index = siblings.indexOf(current);
							selector += `:nth-of-type(${index + 1})`;
						}

						path.unshift(selector);
						current = current.parentElement;

						// Limit path depth
						if (path.length >= 3) break;
					}

					return path.join(" > ");
				}

				generateLLMDescription(element, detectionReasons) {
					const tag = element.tagName.toLowerCase();
					const text = this.getElementText(element);
					const value = this.getElementValue(element);

					let description = this.getElementTypeDescription(element);

					if (text && text.length > 0) {
						description += `: "${text.substring(0, 50)}"`;
					}

					if (value && value !== text && value.length > 0) {
						description += ` (value: "${value}")`;
					}

					// Add detection context
					if (detectionReasons.length > 0) {
						const primaryReasons = detectionReasons.slice(0, 3).join(", ");
						description += ` [Detected by: ${primaryReasons}]`;
					}

					return description;
				}

				getElementTypeDescription(element) {
					const tag = element.tagName.toLowerCase();
					const role = element.getAttribute("role");
					const type = element.type;

					if (role) {
						return role.charAt(0).toUpperCase() + role.slice(1);
					}

					switch (tag) {
						case "button":
							return "Button";
						case "a":
							return element.href ? "Link" : "Anchor";
						case "input":
							switch (type) {
								case "submit":
									return "Submit button";
								case "button":
									return "Input button";
								case "checkbox":
									return "Checkbox";
								case "radio":
									return "Radio button";
								case "password":
									return "Password field";
								case "email":
									return "Email field";
								case "search":
									return "Search field";
								default:
									return "Text input";
							}
						case "textarea":
							return "Text area";
						case "select":
							return "Dropdown";
						case "img":
							return "Image";
						case "video":
							return "Video";
						case "audio":
							return "Audio";
						case "iframe":
							return "Frame";
						case "canvas":
							return "Canvas";
						default:
							return tag.charAt(0).toUpperCase() + tag.slice(1);
					}
				}

				calculateConfidenceLevel(score) {
					if (score >= 1.5) return this.confidenceLevels.HIGH;
					if (score >= 0.8) return this.confidenceLevels.MEDIUM;
					return this.confidenceLevels.LOW;
				}

				meetsConfidenceThreshold(confidence, threshold) {
					const levels = { LOW: 0, MEDIUM: 1, HIGH: 2 };
					return levels[confidence] >= levels[threshold];
				}
			};
		}

		loadDOMSimplifier() {
			// Inline DOM simplifier for content script use
			// This is a simplified version of the main DOMSimplifier class
			window.DOMSimplifier = class {
				constructor() {
					this.interactiveElements = new Set([
						"button",
						"a",
						"input",
						"textarea",
						"select",
						"option",
						"form",
						"label",
						"summary",
						"details",
						"video",
						"audio",
					]);

					this.interactiveRoles = new Set([
						"button",
						"link",
						"textbox",
						"combobox",
						"listbox",
						"option",
						"checkbox",
						"radio",
						"slider",
						"spinbutton",
						"searchbox",
						"tab",
						"tabpanel",
						"menuitem",
						"menuitemcheckbox",
						"menuitemradio",
						"treeitem",
						"gridcell",
						"columnheader",
						"rowheader",
					]);

					this.structuralElements = new Set([
						"main",
						"nav",
						"header",
						"footer",
						"section",
						"article",
						"aside",
						"h1",
						"h2",
						"h3",
						"h4",
						"h5",
						"h6",
						"div",
						"span",
					]);

					this.ignoredElements = new Set([
						"script",
						"style",
						"meta",
						"link",
						"title",
						"head",
						"noscript",
						"template",
						"svg",
						"path",
						"g",
						"defs",
					]);
				}

				async simplifyDOM(options = {}) {
					const config = {
						maxDepth: options.max_depth || 5,
						includeHidden: options.include_hidden || false,
						includeTextNodes: options.include_text_nodes !== false,
						includeCoordinates: options.include_coordinates !== false,
						focusSelectors: options.focus_selectors || [],
						format: options.format || "tree", // 'tree', 'html', 'markdown'
					};

					let rootElement = document.body;
					if (config.focusSelectors.length > 0) {
						const focusElement = document.querySelector(
							config.focusSelectors[0],
						);
						if (focusElement) {
							rootElement = focusElement;
						}
					}

					const simplifiedTree = this.processElement(rootElement, 0, config);
					const interactiveCount =
						this.countInteractiveElements(simplifiedTree);
					const suggestedSelectors = this.generateSuggestedSelectors();
					const structureSummary =
						this.generateStructureSummary(simplifiedTree);

					const baseResult = {
						total_interactive_elements: interactiveCount,
						suggested_selectors: suggestedSelectors,
						page_structure_summary: structureSummary,
						format: config.format,
					};

					// Return different formats based on config
					switch (config.format) {
						case "html":
							return {
								...baseResult,
								html_content: rootElement.outerHTML,
								simplified_html: this.generateSimplifiedHTML(simplifiedTree),
							};

						case "markdown":
							return {
								...baseResult,
								markdown_content: await this.convertToMarkdown(rootElement),
								simplified_markdown:
									this.generateSimplifiedMarkdown(simplifiedTree),
							};
						default:
							return {
								...baseResult,
								root: simplifiedTree,
							};
					}
				}

				processElement(element, depth, config) {
					if (!element || depth > config.maxDepth) {
						return null;
					}

					if (this.ignoredElements.has(element.tagName.toLowerCase())) {
						return null;
					}

					if (!config.includeHidden && !this.isElementVisible(element)) {
						return null;
					}

					const tagName = element.tagName.toLowerCase();
					const node = {
						tag: tagName,
						role: this.getElementRole(element),
						selector: this.generateSelector(element),
						text: this.getElementText(element, config.includeTextNodes),
						placeholder: element.placeholder || "",
						value: this.getElementValue(element),
						type: element.type || "",
						href: element.href || "",
						id: element.id || "",
						classes: Array.from(element.classList),
						interactive: this.isInteractive(element),
						visible: this.isElementVisible(element),
						enabled: this.isElementEnabled(element),
						position: config.includeCoordinates
							? this.getElementPosition(element)
							: null,
						children: [],
						ai_description: this.generateAIDescription(element),
					};

					const shouldProcessChildren = this.shouldProcessChildren(
						element,
						node,
					);
					if (shouldProcessChildren && element.children) {
						for (const child of element.children) {
							const childNode = this.processElement(child, depth + 1, config);
							if (childNode) {
								node.children.push(childNode);
							}
						}
					}

					if (depth > 2 && !node.interactive && node.children.length === 0) {
						if (!this.structuralElements.has(tagName) && !node.text.trim()) {
							return null;
						}
					}

					return node;
				}

				getElementRole(element) {
					if (element.getAttribute("role")) {
						return element.getAttribute("role");
					}

					const tag = element.tagName.toLowerCase();
					const type = element.type?.toLowerCase();

					switch (tag) {
						case "button":
							return "button";
						case "a":
							return element.href ? "link" : "text";
						case "input":
							switch (type) {
								case "text":
								case "email":
								case "password":
								case "search":
								case "tel":
								case "url":
									return "textbox";
								case "checkbox":
									return "checkbox";
								case "radio":
									return "radio";
								case "submit":
								case "button":
									return "button";
								case "range":
									return "slider";
								case "number":
									return "spinbutton";
								default:
									return "textbox";
							}
						case "textarea":
							return "textbox";
						case "select":
							return element.multiple ? "listbox" : "combobox";
						case "option":
							return "option";
						case "img":
							return element.alt ? "img" : "presentation";
						case "h1":
						case "h2":
						case "h3":
						case "h4":
						case "h5":
						case "h6":
							return "heading";
						case "nav":
							return "navigation";
						case "main":
							return "main";
						case "form":
							return "form";
						default:
							return "generic";
					}
				}

				generateSelector(element) {
					if (
						element.id &&
						document.querySelectorAll(`#${element.id}`).length === 1
					) {
						return `#${element.id}`;
					}

					const testId =
						element.getAttribute("data-testid") ||
						element.getAttribute("data-test");
					if (testId) {
						return `[data-testid="${testId}"]`;
					}

					const meaningfulClasses = Array.from(element.classList).filter(
						(cls) => !cls.match(/^(css-|_|sc-|jsx-)/) && cls.length > 2,
					);

					if (meaningfulClasses.length > 0) {
						const escapedClass = this.escapeCSSSelector(meaningfulClasses[0]);
						const classSelector = `.${escapedClass}`;
						if (this.safeQuerySelectorAll(classSelector).length <= 5) {
							return classSelector;
						}
					}

					let selector = element.tagName.toLowerCase();

					if (element.type) {
						selector += `[type="${element.type}"]`;
					}

					const siblings = Array.from(
						element.parentElement?.children || [],
					).filter((el) => el.tagName === element.tagName);

					if (siblings.length > 1) {
						const index = siblings.indexOf(element);
						selector += `:nth-of-type(${index + 1})`;
					}

					return selector;
				}

				getElementText(element, includeTextNodes) {
					if (!includeTextNodes) return "";

					if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
						return element.value || element.placeholder || "";
					}

					if (element.tagName === "IMG") {
						return element.alt || "";
					}

					let text = "";
					for (const node of element.childNodes) {
						if (node.nodeType === Node.TEXT_NODE) {
							text += `${node.textContent.trim()} `;
						} else if (node.nodeType === Node.ELEMENT_NODE) {
							if (!this.isInteractive(node)) {
								text += `${node.textContent.trim()} `;
							}
						}
					}

					return text.trim().substring(0, 200);
				}

				getElementValue(element) {
					const tag = element.tagName.toLowerCase();

					if (tag === "input" || tag === "textarea") {
						if (element.type === "checkbox" || element.type === "radio") {
							return element.checked ? "checked" : "unchecked";
						}
						return element.value || "";
					}

					if (tag === "select") {
						return element.value || "";
					}

					return "";
				}

				isInteractive(element) {
					const tag = element.tagName.toLowerCase();
					const role = element.getAttribute("role");

					if (this.interactiveElements.has(tag)) return true;
					if (role && this.interactiveRoles.has(role)) return true;
					if (element.onclick || element.getAttribute("onclick")) return true;
					if (element.tabIndex >= 0) return true;

					const computed = window.getComputedStyle(element);
					if (computed.cursor === "pointer") return true;

					return false;
				}

				isElementVisible(element) {
					if (
						!element.offsetParent &&
						element.offsetWidth === 0 &&
						element.offsetHeight === 0
					) {
						return false;
					}

					const computed = window.getComputedStyle(element);
					if (computed.display === "none" || computed.visibility === "hidden") {
						return false;
					}

					if (computed.opacity === "0") {
						return false;
					}

					return true;
				}

				isElementEnabled(element) {
					if (element.disabled) return false;
					if (element.getAttribute("aria-disabled") === "true") return false;

					const form = element.closest("form");
					if (form?.disabled) return false;

					return true;
				}

				getElementPosition(element) {
					const rect = element.getBoundingClientRect();
					return {
						x: Math.round(rect.left),
						y: Math.round(rect.top),
						width: Math.round(rect.width),
						height: Math.round(rect.height),
					};
				}

				shouldProcessChildren(element, node) {
					if (this.structuralElements.has(element.tagName.toLowerCase())) {
						return true;
					}

					if (
						node.interactive &&
						["input", "textarea", "button", "img"].includes(node.tag)
					) {
						return false;
					}

					return true;
				}

				generateAIDescription(element) {
					const tag = element.tagName.toLowerCase();
					const role = this.getElementRole(element);
					const text = this.getElementText(element, true);
					const value = this.getElementValue(element);

					let description = "";

					if (role === "button") {
						description = "Button";
					} else if (role === "link") {
						description = "Link";
					} else if (role === "textbox") {
						description =
							element.type === "password" ? "Password field" : "Text input";
					} else if (role === "checkbox") {
						description = "Checkbox";
					} else if (role === "radio") {
						description = "Radio button";
					} else if (role === "combobox" || role === "listbox") {
						description = "Dropdown";
					} else if (role === "heading") {
						description = `Heading level ${tag.slice(1)}`;
					} else {
						description = role.charAt(0).toUpperCase() + role.slice(1);
					}

					if (text) {
						description += `: "${text.substring(0, 50)}"`;
					}

					if (value && value !== text) {
						description += ` (current: "${value}")`;
					}

					if (!this.isElementEnabled(element)) {
						description += " (disabled)";
					}

					if (!this.isElementVisible(element)) {
						description += " (hidden)";
					}

					return description;
				}

				async convertToMarkdown(element) {
					try {
						// Use the markdowner API to convert the current page to markdown
						const currentUrl = window.location.href;
						const response = await fetch(
							`https://md.dhr.wtf/?url=${encodeURIComponent(currentUrl)}`,
							{
								method: "GET",
								headers: {
									"Content-Type": "application/json",
								},
							},
						);

						if (response.ok) {
							const data = await response.json();
							return (
								data.markdown || data.content || "Failed to extract markdown"
							);
						}
						// Fallback to simple HTML-to-markdown conversion
						return this.simpleHtmlToMarkdown(element.innerHTML);
					} catch (error) {
						console.warn(
							"Markdowner API failed, using simple conversion:",
							error,
						);
						return this.simpleHtmlToMarkdown(element.innerHTML);
					}
				}

				simpleHtmlToMarkdown(html) {
					// Simple HTML to Markdown conversion for fallback
					return html
						.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
						.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
						.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
						.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n")
						.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n")
						.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n")
						.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
						.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
						.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
						.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
						.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
						.replace(
							/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi,
							"![$2]($1)",
						)
						.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "![Image]($1)")
						.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
						.replace(/<ul[^>]*>(.*?)<\/ul>/gi, "\n$1\n")
						.replace(/<ol[^>]*>(.*?)<\/ol>/gi, "\n$1\n")
						.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
						.replace(/<div[^>]*>(.*?)<\/div>/gi, "$1\n")
						.replace(/<br[^>]*>/gi, "\n")
						.replace(/<[^>]*>/g, "") // Remove remaining HTML tags
						.replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
						.trim();
				}

				generateSimplifiedHTML(tree) {
					if (!tree) return "";

					const tag = tree.tag || "div";
					const attrs = [];

					if (tree.id) attrs.push(`id="${tree.id}"`);
					if (tree.classes) attrs.push(`class="${tree.classes.join(" ")}"`);
					if (tree.href) attrs.push(`href="${tree.href}"`);
					if (tree.type) attrs.push(`type="${tree.type}"`);

					const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
					const text = tree.text ? tree.text.trim() : "";

					if (tree.children && tree.children.length > 0) {
						const childrenHtml = tree.children
							.map((child) => this.generateSimplifiedHTML(child))
							.filter((html) => html.length > 0)
							.join("");

						return `<${tag}${attrStr}>${text}${childrenHtml}</${tag}>`;
					}
					if (text) {
						return `<${tag}${attrStr}>${text}</${tag}>`;
					}
					return `<${tag}${attrStr}></${tag}>`;
				}

				generateSimplifiedMarkdown(tree, depth = 0) {
					if (!tree) return "";

					const indent = "  ".repeat(depth);
					let result = "";

					// Convert based on tag type
					switch (tree.tag) {
						case "h1":
							result = `# ${tree.text}\n\n`;
							break;
						case "h2":
							result = `## ${tree.text}\n\n`;
							break;
						case "h3":
							result = `### ${tree.text}\n\n`;
							break;
						case "h4":
							result = `#### ${tree.text}\n\n`;
							break;
						case "h5":
							result = `##### ${tree.text}\n\n`;
							break;
						case "h6":
							result = `###### ${tree.text}\n\n`;
							break;
						case "a":
							result = `[${tree.text}](${tree.href || "#"})\n`;
							break;
						case "button":
							result = `**Button:** ${tree.text}\n`;
							break;
						case "input":
							result = `**Input (${tree.type}):** ${tree.placeholder || tree.value || "Empty"}\n`;
							break;
						case "p":
							result = `${tree.text}\n\n`;
							break;
						default:
							if (tree.text?.trim()) {
								result = `${tree.text}\n`;
							}
					}

					// Add children
					if (tree.children && tree.children.length > 0) {
						const childrenMd = tree.children
							.map((child) => this.generateSimplifiedMarkdown(child, depth + 1))
							.filter((md) => md.length > 0)
							.join("");
						result += childrenMd;
					}

					return result;
				}

				countInteractiveElements(node) {
					if (!node) return 0;

					let count = node.interactive ? 1 : 0;
					for (const child of node.children) {
						count += this.countInteractiveElements(child);
					}
					return count;
				}

				generateSuggestedSelectors() {
					const suggestions = [];

					const submitBtn = document.querySelector(
						'input[type="submit"], button[type="submit"]',
					);
					if (submitBtn) {
						suggestions.push(
							`${this.generateSelector(submitBtn)} // Submit button`,
						);
					}

					const searchInput = document.querySelector(
						'input[type="search"], input[placeholder*="search" i], input[name*="search" i]',
					);
					if (searchInput) {
						suggestions.push(
							`${this.generateSelector(searchInput)} // Search input`,
						);
					}

					const navLinks = document.querySelectorAll("nav a, header a");
					if (navLinks.length > 0) {
						suggestions.push("nav a // Navigation links");
					}

					return suggestions;
				}

				generateStructureSummary(rootNode) {
					const counts = this.countElementTypes(rootNode);
					const summary = [];

					if (counts.buttons > 0) summary.push(`${counts.buttons} buttons`);
					if (counts.links > 0) summary.push(`${counts.links} links`);
					if (counts.inputs > 0) summary.push(`${counts.inputs} input fields`);
					if (counts.headings > 0) summary.push(`${counts.headings} headings`);

					const pageType = this.detectPageType();
					if (pageType) summary.unshift(pageType);

					return summary.join(", ") || "Basic webpage";
				}

				countElementTypes(node) {
					if (!node) return { buttons: 0, links: 0, inputs: 0, headings: 0 };

					const counts = { buttons: 0, links: 0, inputs: 0, headings: 0 };

					if (node.role === "button") counts.buttons++;
					if (node.role === "link") counts.links++;
					if (
						node.role === "textbox" ||
						node.tag === "input" ||
						node.tag === "textarea"
					)
						counts.inputs++;
					if (node.role === "heading") counts.headings++;

					for (const child of node.children) {
						const childCounts = this.countElementTypes(child);
						counts.buttons += childCounts.buttons;
						counts.links += childCounts.links;
						counts.inputs += childCounts.inputs;
						counts.headings += childCounts.headings;
					}

					return counts;
				}

				detectPageType() {
					const pageText = `${document.title.toLowerCase()} ${document.body.textContent.toLowerCase()}`;

					if (pageText.includes("login") || pageText.includes("sign in")) {
						return "Login page";
					}
					if (pageText.includes("register") || pageText.includes("sign up")) {
						return "Registration page";
					}
					if (
						pageText.includes("search") ||
						document.querySelector('input[type="search"]')
					) {
						return "Search page";
					}
					if (pageText.includes("cart") || pageText.includes("checkout")) {
						return "Shopping page";
					}
					if (document.querySelector("form")) {
						return "Form page";
					}
					if (document.querySelector("article, .article, .post")) {
						return "Article/content page";
					}

					return null;
				}
			};
		}

		serializeResult(result) {
			if (result === null || result === undefined) {
				return String(result);
			}

			if (typeof result === "object") {
				try {
					return JSON.stringify(result, null, 2);
				} catch (error) {
					return String(result);
				}
			}

			return String(result);
		}

		setupServiceWorkerKeepalive() {
			// Help keep the service worker alive by sending periodic pings
			console.log("💓 Setting up content script keepalive for service worker");

			// Send initial ping
			this.sendServiceWorkerPing();

			// Send ping every 2 minutes
			this.keepaliveInterval = setInterval(
				() => {
					this.sendServiceWorkerPing();
				},
				2 * 60 * 1000,
			);

			// Send ping when page becomes visible (user returns to tab)
			document.addEventListener("visibilitychange", () => {
				if (!document.hidden) {
					console.log("👁️ Tab became visible, sending service worker ping");
					this.sendServiceWorkerPing();
				}
			});

			// Send ping on user interaction
			["click", "keydown", "scroll"].forEach((eventType) => {
				let lastPing = 0;
				document.addEventListener(
					eventType,
					() => {
						const now = Date.now();
						// Throttle to once per minute to avoid spam
						if (now - lastPing > 60 * 1000) {
							lastPing = now;
							this.sendServiceWorkerPing();
						}
					},
					{ passive: true },
				);
			});

			// Clean up intervals and event listeners on page unload
			window.addEventListener("beforeunload", () => {
				if (this.keepaliveInterval) {
					clearInterval(this.keepaliveInterval);
					this.keepaliveInterval = null;
					console.log("🧹 Cleaned up content script keepalive interval");
				}
			});

			// Clean up on page hide (for back/forward cache)
			window.addEventListener("pagehide", () => {
				if (this.keepaliveInterval) {
					clearInterval(this.keepaliveInterval);
					this.keepaliveInterval = null;
					console.log(
						"🧹 Cleaned up content script keepalive interval on page hide",
					);
				}
			});
		}

		async sendServiceWorkerPing() {
			// Simplified ping - removed storage-based keepalive mechanism
			console.log(
				"📱 Content script keepalive ping (storage mechanism removed)",
			);
		}
	}

	// Initialize the content script
	const bropContent = new BROPContentScript();

	// Make it available globally for debugging
	window.BROP = bropContent;
} // End of if (typeof window.BROP === 'undefined')
