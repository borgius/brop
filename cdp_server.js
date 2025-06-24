// CDP Server - Chrome DevTools Protocol Implementation
// This class handles all CDP commands using Chrome Extension APIs

class CDPServer {
	constructor() {
		this.pendingRequests = new Map(); // messageId -> { bridgeMessageId, connectionId }
		this.isConnected = true; // Always connected since we're inside Chrome
		this.attachedTabs = new Set();
		this.debuggerSessions = new Map(); // tabId -> sessionInfo
		this.connectionToTab = new Map(); // connectionId -> tabId
		this.tabToConnection = new Map(); // tabId -> connectionId

		// Generate a stable browser target ID
		this.browserTargetId = this.generateBrowserTargetId();

		// Default browser context ID (represents the main browser profile)
		this.defaultBrowserContextId = this.generateBrowserContextId();

		// Track created browser contexts
		this.browserContexts = new Map();
		this.browserContexts.set(this.defaultBrowserContextId, { isDefault: true });

		this.setupCDPEventForwarding();
		console.log("🎭 CDP Server initialized using Chrome Extension APIs");
	}

	generateBrowserTargetId() {
		// Generate a UUID-like browser target ID
		const array = new Uint8Array(16);
		crypto.getRandomValues(array);
		const hex = Array.from(array, (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
	}

	generateBrowserContextId() {
		// Generate a browser context ID in uppercase hex format like native Chrome
		const array = new Uint8Array(16);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) => byte.toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase();
	}

	setupCDPEventForwarding() {
		// Forward CDP events from debugger to bridge
		chrome.debugger.onEvent.addListener((source, method, params) => {
			console.log(
				`🎭 CDP Event: ${method} from tab ${source.tabId}, frame ${source.frameId || "main"}`,
			);

			// Forward the event with proper targetId (frameId)
			if (this.onEventCallback) {
				const connectionId = this.tabToConnection.get(source.tabId);

				// Look up the targetId from our session mapping
				const sessionInfo = this.debuggerSessions.get(source.tabId);
				const targetId = sessionInfo
					? sessionInfo.targetId
					: source.tabId.toString();

				console.log(
					`🎭 Event ${method} - using targetId: ${targetId} for tab ${source.tabId}`,
				);

				this.onEventCallback({
					type: "cdp_event",
					method: method,
					params: params,
					tabId: source.tabId,
					targetId: targetId,
					connectionId: connectionId,
				});
			}
		});

		// Handle debugger detach events
		chrome.debugger.onDetach.addListener((source, reason) => {
			console.log(
				`🎭 CDP Debugger detached from tab ${source.tabId}: ${reason}`,
			);
			this.attachedTabs.delete(source.tabId);
			this.debuggerSessions.delete(source.tabId);
		});

		// Clean up debugger sessions when tabs are closed
		chrome.tabs.onRemoved.addListener((tabId) => {
			if (this.attachedTabs.has(tabId)) {
				console.log(`🎭 Cleaning up CDP session for closed tab ${tabId}`);
				chrome.debugger.detach({ tabId }).catch(() => {
					// Ignore errors when tab is already gone
				});
				this.attachedTabs.delete(tabId);
				this.debuggerSessions.delete(tabId);
			}
		});

		console.log("🎭 CDP event forwarding set up");
	}

	// Process CDP command using Chrome Extension APIs
	async processCDPCommand(message, sendResponseCallback) {
		const { id, method, params, sessionId, connectionId } = message;

		console.log("🎭 CDP Server processing command:", {
			method: method,
			id: id,
			connectionId: connectionId,
			sessionId: sessionId,
			params: params,
		});

		if (!method) {
			console.error("🎭 ERROR: CDP method is undefined!", message);
			sendResponseCallback({
				type: "response",
				id: id,
				error: { code: -32600, message: "Invalid CDP command: missing method" },
			});
			return;
		}

		try {
			// Check domain to determine target type
			const domain = method.split(".")[0];
			const isBrowserDomain = domain === "Browser";
			const isTargetDomain = domain === "Target";

			console.log(
				`🎭 Method: ${method}, Domain: ${domain}, isBrowserDomain: ${isBrowserDomain}, isTargetDomain: ${isTargetDomain}`,
			);

			if (isBrowserDomain || isTargetDomain) {
				// Browser/Target domain - use Chrome extension APIs
				console.log(`🎭 Browser/Target domain command: ${method}`);
				const result = await this.handleBrowserTargetCommand(
					method,
					params || {},
					connectionId,
				);

				sendResponseCallback({
					type: "response",
					id: id,
					result: result,
				});
			} else {
				// Non-browser domain - use tab target
				const tabId = this.getTabIdFromParams(params, sessionId);

				if (tabId) {
					// Track connection to tab mapping
					if (connectionId) {
						this.connectionToTab.set(connectionId, tabId);
						this.tabToConnection.set(tabId, connectionId);
					}

					// Use specified tab
					if (!this.attachedTabs.has(tabId)) {
						console.log(`🎭 Attaching debugger to tab ${tabId}`);
						try {
							await chrome.debugger.attach({ tabId }, "1.3");
							this.attachedTabs.add(tabId);
							console.log(`✅ Successfully attached to tab ${tabId}`);
						} catch (error) {
							if (
								error.message.includes("Another debugger is already attached")
							) {
								console.log(
									`🎭 Tab ${tabId} already has debugger attached - using existing connection`,
								);
								this.attachedTabs.add(tabId);
							} else {
								console.error(
									`🎭 Failed to attach to tab ${tabId}:`,
									error.message,
								);
								throw error;
							}
						}

						// Create session mapping for event routing
						if (!this.debuggerSessions.has(tabId)) {
							const sessionId = `session_${tabId}_${Date.now()}`;
							const targetId = tabId.toString();
							this.debuggerSessions.set(tabId, {
								sessionId,
								targetId,
								browserContextId: this.defaultBrowserContextId,
							});
							console.log(
								`🎭 Created session mapping: ${sessionId} -> ${targetId}`,
							);
						}
					}

					const result = await chrome.debugger.sendCommand(
						{ tabId },
						method,
						params || {},
					);

					console.log(`✅ Tab command ${method} completed`);
					sendResponseCallback({
						type: "response",
						id: id,
						result: result,
					});
				} else {
					// Find any available tab
					const tabs = await chrome.tabs.query({});
					const targetTab = tabs.find(
						(tab) =>
							tab.url &&
							!tab.url.startsWith("chrome-extension://") &&
							!tab.url.startsWith("chrome:"),
					);

					if (!targetTab) {
						throw new Error(`No suitable tab found for command ${method}`);
					}

					if (!this.attachedTabs.has(targetTab.id)) {
						console.log(`🎭 Attaching debugger to tab ${targetTab.id}`);
						try {
							await chrome.debugger.attach({ tabId: targetTab.id }, "1.3");
							this.attachedTabs.add(targetTab.id);
							console.log(`✅ Successfully attached to tab ${targetTab.id}`);
						} catch (error) {
							if (
								error.message.includes("Another debugger is already attached")
							) {
								console.log(
									`🎭 Tab ${targetTab.id} already has debugger attached - using existing connection`,
								);
								this.attachedTabs.add(targetTab.id);
							} else {
								console.error(
									`🎭 Failed to attach to tab ${targetTab.id}:`,
									error.message,
								);
								throw error;
							}
						}

						// Create session mapping for event routing
						if (!this.debuggerSessions.has(targetTab.id)) {
							const sessionId = `session_${targetTab.id}_${Date.now()}`;
							const targetId = targetTab.id.toString();
							this.debuggerSessions.set(targetTab.id, {
								sessionId,
								targetId,
								browserContextId: this.defaultBrowserContextId,
							});
							console.log(
								`🎭 Created session mapping: ${sessionId} -> ${targetId}`,
							);
						}
					}

					const result = await chrome.debugger.sendCommand(
						{ tabId: targetTab.id },
						method,
						params || {},
					);

					console.log(`✅ Tab command ${method} completed`);
					sendResponseCallback({
						type: "response",
						id: id,
						result: result,
					});
				}
			}
		} catch (error) {
			console.error(`🎭 CDP Server error forwarding ${method}:`, error);
			console.error("🎭 Error stack:", error.stack);

			try {
				sendResponseCallback({
					type: "response",
					id: id,
					error: {
						code: -32603,
						message: `CDP command failed: ${error.message}`,
					},
				});
			} catch (callbackError) {
				console.error("🎭 Error in callback:", callbackError);
			}
		}
	}

	getTabIdFromParams(params, sessionId) {
		// Try to get tab ID from sessionId first
		if (sessionId) {
			for (const [tabId, session] of this.debuggerSessions) {
				if (session.sessionId === sessionId) {
					return tabId;
				}
			}
		}

		// Try to get tab ID from targetId in params
		if (params?.targetId) {
			return this.getTabIdFromTarget(params.targetId);
		}

		// No tab ID found
		return null;
	}

	getTabIdFromTarget(targetId) {
		// Extract tab ID from target ID format: "tab_123456"
		if (targetId?.startsWith("tab_")) {
			const tabId = Number.parseInt(targetId.replace("tab_", ""));
			return Number.isNaN(tabId) ? null : tabId;
		}
		return null;
	}

	// Handle Browser and Target domain commands using Chrome extension APIs
	async handleBrowserTargetCommand(method, params, connectionId) {
		switch (method) {
			// Browser domain
			case "Browser.getVersion":
				return await this.browserGetVersion();

			case "Browser.close":
				return await this.browserClose();

			case "Browser.setDownloadBehavior":
				return await this.browserSetDownloadBehavior(params);

			case "Browser.grantPermissions":
				return await this.browserGrantPermissions(params);

			case "Browser.getWindowForTarget":
				return await this.browserGetWindowForTarget(params);

			case "Browser.setWindowBounds":
				return await this.browserSetWindowBounds(params);

			// Target domain
			case "Target.getTargets":
				return await this.targetGetTargets();

			case "Target.createTarget":
				return await this.targetCreateTarget(params, connectionId);

			case "Target.closeTarget":
				return await this.targetCloseTarget(params);

			case "Target.activateTarget":
				return await this.targetActivateTarget(params);

			case "Target.attachToTarget":
				return await this.targetAttachToTarget(params);

			case "Target.detachFromTarget":
				return await this.targetDetachFromTarget(params);

			case "Target.sendMessageToTarget":
				return await this.targetSendMessageToTarget(params);

			case "Target.setAutoAttach":
				return await this.targetSetAutoAttach(params);

			case "Target.setDiscoverTargets":
				return await this.targetSetDiscoverTargets(params);

			case "Target.getTargetInfo":
				return await this.targetGetTargetInfo(params);

			case "Target.createBrowserContext":
				return await this.targetCreateBrowserContext(params);

			default:
				throw new Error(`Unsupported Browser/Target command: ${method}`);
		}
	}

	// Browser.getVersion implementation
	async browserGetVersion() {
		// Get user agent (contains Chrome version)
		const userAgent = navigator.userAgent;

		// Extract Chrome version from user agent
		const chromeMatch = userAgent.match(/Chrome\/([0-9.]+)/);
		const chromeVersion = chromeMatch ? chromeMatch[1] : "138.0.7204.15";

		return {
			protocolVersion: "1.3",
			product: `Chrome/${chromeVersion}`,
			revision: "@9f1120d029eadbc8ecc5c3d9b298c16d08aabf9f", // Hardcoded revision
			userAgent: userAgent,
			jsVersion: "13.8.258.9", // Hardcoded jsVersion
		};
	}

	// Browser.close implementation
	async browserClose() {
		const windows = await chrome.windows.getAll({ populate: false });
		for (const window of windows) {
			await chrome.windows.remove(window.id);
		}
		return {};
	}

	// Browser.setDownloadBehavior implementation
	async browserSetDownloadBehavior(params) {
		// In Chrome extension context, we can't control download behavior directly
		// Return success to keep Playwright happy
		console.log(
			"🎭 Browser.setDownloadBehavior called (stubbed in extension context)",
		);
		return {};
	}

	// Browser.grantPermissions implementation
	async browserGrantPermissions(params) {
		// In Chrome extension context, permissions are handled differently
		// Return success to keep Playwright happy
		console.log(
			"🎭 Browser.grantPermissions called (stubbed in extension context)",
		);
		return {};
	}

	// Browser.getWindowForTarget implementation
	async browserGetWindowForTarget(params) {
		// Get the actual current window
		const window = await chrome.windows.getCurrent();

		return {
			windowId: window.id,
			bounds: {
				left: window.left || 0,
				top: window.top || 0,
				width: window.width || 1280,
				height: window.height || 720,
				windowState: window.state || "normal",
			},
		};
	}

	// Browser.setWindowBounds implementation
	async browserSetWindowBounds(params) {
		const { windowId, bounds } = params;

		// Update the window bounds
		const updateInfo = {};
		if (bounds.left !== undefined) updateInfo.left = bounds.left;
		if (bounds.top !== undefined) updateInfo.top = bounds.top;
		if (bounds.width !== undefined) updateInfo.width = bounds.width;
		if (bounds.height !== undefined) updateInfo.height = bounds.height;
		if (bounds.windowState !== undefined) updateInfo.state = bounds.windowState;

		await chrome.windows.update(windowId, updateInfo);

		return {};
	}

	// Target.getTargets implementation
	async targetGetTargets() {
		const targets = await new Promise((resolve) => {
			chrome.debugger.getTargets((targets) => {
				resolve(targets);
			});
		});

		const targetInfos = targets.map((target) => ({
			targetId: target.id,
			type: target.type,
			title: target.title || "",
			url: target.url || "",
			attached: target.attached || false,
			canAccessOpener: false,
		}));

		return { targetInfos };
	}

	// Target.createTarget implementation
	async targetCreateTarget(params, connectionId) {
		const url = params.url || "about:blank";
		const width = params.width;
		const height = params.height;
		const newWindow = params.newWindow;
		const browserContextId =
			params.browserContextId || this.defaultBrowserContextId;

		let tab;
		if (newWindow) {
			const createData = { url };
			if (width && height) {
				createData.width = width;
				createData.height = height;
			}
			const window = await chrome.windows.create(createData);
			tab = window.tabs[0];
		} else {
			tab = await chrome.tabs.create({ url });
		}

		// Track connection to tab mapping
		if (connectionId) {
			this.connectionToTab.set(connectionId, tab.id);
			this.tabToConnection.set(tab.id, connectionId);
			console.log(`🎭 Mapped connection ${connectionId} to tab ${tab.id}`);
		}

		// Attach debugger first
		try {
			await chrome.debugger.attach({ tabId: tab.id }, "1.3");
			this.attachedTabs.add(tab.id);
		} catch (error) {
			if (!error.message.includes("Another debugger is already attached")) {
				throw error;
			}
		}

		// Send Page.getFrameTree with a very large ID to get the real frame ID
		const largeRequestId = 1000000 + Math.floor(Math.random() * 1000000);

		// Create a promise to wait for the response
		const frameTreePromise = new Promise((resolve) => {
			this.pendingFrameTreeRequests =
				this.pendingFrameTreeRequests || new Map();
			this.pendingFrameTreeRequests.set(largeRequestId, {
				resolve,
				tabId: tab.id,
				connectionId,
			});
		});

		// Send Page.getFrameTree to get the real frame ID
		await chrome.debugger.sendCommand(
			{ tabId: tab.id },
			"Page.getFrameTree",
			{},
			(result) => {
				if (chrome.runtime.lastError) {
					console.error("Failed to get frame tree:", chrome.runtime.lastError);
					return;
				}

				// Process the result immediately
				const frameId = result.frameTree.frame.id;
				const sessionId = this.generateSessionId();

				console.log(
					`🎭 Got frame ID ${frameId} for tab ${tab.id}, generating Target.attachedToTarget`,
				);

				// Store the session mapping
				this.debuggerSessions.set(tab.id, {
					sessionId,
					targetId: frameId,
					browserContextId: browserContextId,
				});

				// Send Target.attachedToTarget event
				if (this.onEventCallback) {
					this.onEventCallback({
						type: "cdp_event",
						method: "Target.attachedToTarget",
						params: {
							sessionId: sessionId,
							targetInfo: {
								targetId: frameId,
								type: "page",
								title: "",
								url: url,
								attached: true,
								canAccessOpener: false,
								browserContextId: browserContextId,
							},
							waitingForDebugger: true,
						},
						connectionId: connectionId,
					});
				}

				// Resolve with frame ID
				if (this.pendingFrameTreeRequests?.has(largeRequestId)) {
					const pending = this.pendingFrameTreeRequests.get(largeRequestId);
					this.pendingFrameTreeRequests.delete(largeRequestId);
					pending.resolve(frameId);
				}
			},
		);

		// Wait for frame ID
		const frameId = await frameTreePromise;

		console.log(`🎭 Created target: frameId ${frameId} (tab ${tab.id})`);

		return { targetId: frameId };
	}

	generateSessionId() {
		// Generate a session ID in the same format as CDP
		const array = new Uint8Array(16);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) => byte.toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase();
	}

	// Target.closeTarget implementation
	async targetCloseTarget(params) {
		const targetId = params.targetId;
		const tabId = Number.parseInt(targetId, 10);
		await chrome.tabs.remove(tabId);
		return { success: true };
	}

	// Target.activateTarget implementation
	async targetActivateTarget(params) {
		const targetId = params.targetId;
		const tabId = Number.parseInt(targetId, 10);

		// Get tab info to find its window
		const tab = await chrome.tabs.get(tabId);

		// Activate the tab
		await chrome.tabs.update(tabId, { active: true });

		// Focus the window
		await chrome.windows.update(tab.windowId, { focused: true });

		return {};
	}

	// Target.attachToTarget implementation
	async targetAttachToTarget(params) {
		const targetId = params.targetId;
		const tabId = Number.parseInt(targetId, 10);
		// const flatten = params.flatten !== false;

		await new Promise((resolve, reject) => {
			chrome.debugger.attach({ tabId }, "1.3", () => {
				if (chrome.runtime.lastError) {
					const error = chrome.runtime.lastError.message;
					if (error.includes("Another debugger is already attached")) {
						console.log(
							`🎭 Target.attachToTarget: Tab ${tabId} already has debugger - using existing connection`,
						);
						this.attachedTabs.add(tabId);
						resolve();
					} else {
						reject(new Error(error));
					}
				} else {
					this.attachedTabs.add(tabId);
					console.log(
						`✅ Target.attachToTarget: Successfully attached to tab ${tabId}`,
					);
					resolve();
				}
			});
		});

		// Generate a session ID
		const sessionId = `session_${targetId}_${Date.now()}`;
		this.debuggerSessions.set(tabId, {
			sessionId,
			targetId,
			browserContextId: this.defaultBrowserContextId,
		});

		return { sessionId };
	}

	// Target.detachFromTarget implementation
	async targetDetachFromTarget(params) {
		const sessionId = params.sessionId;

		// Find tab by session ID
		let tabId = null;
		for (const [tid, session] of this.debuggerSessions.entries()) {
			if (session.sessionId === sessionId) {
				tabId = tid;
				break;
			}
		}

		if (tabId) {
			await chrome.debugger.detach({ tabId });
			this.attachedTabs.delete(tabId);
			this.debuggerSessions.delete(tabId);
		}

		return {};
	}

	// Target.sendMessageToTarget implementation
	async targetSendMessageToTarget(params) {
		const sessionId = params.sessionId;
		const message = JSON.parse(params.message);

		// Find tab by session ID
		let tabId = null;
		for (const [tid, session] of this.debuggerSessions.entries()) {
			if (session.sessionId === sessionId) {
				tabId = tid;
				break;
			}
		}

		if (!tabId) {
			throw new Error(`Session not found: ${sessionId}`);
		}

		const result = await new Promise((resolve, reject) => {
			chrome.debugger.sendCommand(
				{ tabId },
				message.method,
				message.params || {},
				(result) => {
					if (chrome.runtime.lastError) {
						reject(new Error(chrome.runtime.lastError.message));
					} else {
						resolve(result);
					}
				},
			);
		});

		return result;
	}

	// Target.setAutoAttach implementation
	async targetSetAutoAttach(params) {
		const autoAttach = params.autoAttach;
		const waitForDebuggerOnStart = params.waitForDebuggerOnStart || false;
		const flatten = params.flatten !== false;

		// Store auto-attach settings for future tabs
		this.autoAttachSettings = { autoAttach, waitForDebuggerOnStart, flatten };

		console.log(
			`🎭 Target.setAutoAttach configured: autoAttach=${autoAttach} (extension context - stored for future tabs)`,
		);

		// In Chrome extension context, we can't directly control auto-attach
		// but we can simulate the behavior by storing the settings
		// Return success to keep Playwright happy
		return {};
	}

	// Target.setDiscoverTargets implementation
	async targetSetDiscoverTargets(params) {
		// This command is not allowed in extension context
		// Return empty result instead of error for compatibility
		console.log(
			"🎭 Target.setDiscoverTargets not allowed in extension context",
		);
		return {};
	}

	// Target.getTargetInfo implementation
	async targetGetTargetInfo(params) {
		const targetId = params?.targetId;

		// If no targetId provided or it's the browser target
		if (!targetId || targetId === this.browserTargetId) {
			return {
				targetInfo: {
					targetId: this.browserTargetId,
					type: "browser",
					title: "",
					url: "",
					attached: true,
					canAccessOpener: false,
				},
			};
		}

		// Try to parse as a tab ID
		const tabId = Number.parseInt(targetId, 10);
		if (!Number.isNaN(tabId)) {
			try {
				const tab = await chrome.tabs.get(tabId);
				return {
					targetInfo: {
						targetId: targetId,
						type: "page",
						title: tab.title || "",
						url: tab.url || "",
						attached: this.attachedTabs.has(tabId),
						canAccessOpener: false,
						browserContextId:
							this.debuggerSessions.get(tabId)?.browserContextId ||
							this.defaultBrowserContextId,
					},
				};
			} catch (error) {
				console.log(`🎭 Tab ${tabId} not found: ${error.message}`);
			}
		}

		// Fallback for unknown target
		return {
			targetInfo: {
				targetId: targetId,
				type: "other",
				title: "",
				url: "",
				attached: false,
				canAccessOpener: false,
			},
		};
	}

	// Target.createBrowserContext implementation
	async targetCreateBrowserContext(params) {
		// In Chrome extension context, we can't create isolated browser contexts
		// Generate a proper browser context ID and track it
		const browserContextId = this.generateBrowserContextId();

		this.browserContexts.set(browserContextId, {
			created: Date.now(),
			isDefault: false,
		});

		console.log(
			`🎭 Target.createBrowserContext: Created context ${browserContextId} (extension context limitation)`,
		);

		return {
			browserContextId: browserContextId,
		};
	}

	// Set callback for event forwarding
	setEventCallback(callback) {
		this.onEventCallback = callback;
	}

	// Update session mapping when Bridge assigns a sessionId
	updateSessionMapping(targetId, sessionId, browserContextId) {
		const tabId = Number.parseInt(targetId, 10);
		if (!Number.isNaN(tabId)) {
			this.debuggerSessions.set(tabId, {
				sessionId,
				targetId,
				browserContextId: browserContextId || this.defaultBrowserContextId,
			});
			console.log(
				`🎭 Updated session mapping: tab ${tabId} -> session ${sessionId}`,
			);
		}
	}

	// Get connection status
	getStatus() {
		return {
			connected: this.isConnected,
			attachedTabs: this.attachedTabs.size,
			debuggerSessions: this.debuggerSessions.size,
		};
	}

	// Close connection and cleanup
	close() {
		// Detach from all tabs
		for (const tabId of this.attachedTabs) {
			chrome.debugger.detach({ tabId }).catch(() => {
				// Ignore errors during cleanup
			});
		}

		this.attachedTabs.clear();
		this.debuggerSessions.clear();
		this.isConnected = false;
	}
}

// Export for use in background scripts
if (typeof module !== "undefined" && module.exports) {
	module.exports = CDPServer;
} else {
	self.CDPServer = CDPServer;
}
