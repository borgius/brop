// BROP Server - Browser Remote Operations Protocol Implementation
// This class contains all BROP command handlers and can be used by different background scripts

class BROPServer {
	constructor() {
		this.enabled = true;
		this.callLogs = [];
		this.maxLogEntries = 1000;

		// Error collection system
		this.extensionErrors = [];
		this.maxErrorEntries = 100;

		// CDP debugger session management
		this.attachedTabs = new Set();
		this.debuggerSessions = new Map(); // tabId -> sessionInfo
		this.autoAttachEnabled = false;

		this.messageHandlers = new Map();
		this.setupMessageHandlers();
		this.setupErrorHandlers();
		this.loadSettings();
	}

	setupMessageHandlers() {
		// BROP command handlers
		// TABS:
		this.messageHandlers.set("create_tab", this.handleCreateTab.bind(this));
		this.messageHandlers.set("close_tab", this.handleCloseTab.bind(this));
		this.messageHandlers.set("list_tabs", this.handleListTabs.bind(this));
		this.messageHandlers.set("activate_tab", this.handleActivateTab.bind(this));

		// System methods
		this.messageHandlers.set(
			"get_server_status",
			this.handleGetServerStatus.bind(this),
		);

		// Page console access
		this.messageHandlers.set(
			"start_console_capture",
			this.handleStartConsoleCapture.bind(this),
		);
		this.messageHandlers.set(
			"stop_console_capture",
			this.handleStopConsoleCapture.bind(this),
		);
		this.messageHandlers.set(
			"clear_console_logs",
			this.handleClearConsoleLogs.bind(this),
		);
		this.messageHandlers.set(
			"get_console_logs",
			this.handleGetConsoleLogs.bind(this),
		);
		this.messageHandlers.set(
			"execute_console",
			this.handleExecuteConsole.bind(this),
		);

		// extract page information
		this.messageHandlers.set(
			"get_simplified_dom",
			this.handleGetSimplifiedDOM.bind(this),
		);
		this.messageHandlers.set("get_element", this.handleGetElement.bind(this));
		this.messageHandlers.set(
			"get_screenshot",
			this.handleGetScreenshot.bind(this),
		);
		this.messageHandlers.set(
			"get_page_content",
			this.handleGetPageContent.bind(this),
		);

		// page interaction
		this.messageHandlers.set("navigate", this.handleNavigate.bind(this));
		this.messageHandlers.set("click", this.handleClick.bind(this));
		this.messageHandlers.set("type", this.handleType.bind(this));
		this.messageHandlers.set(
			"wait_for_element",
			this.handleWaitForElement.bind(this),
		);
		this.messageHandlers.set("evaluate_js", this.handleEvaluateJS.bind(this));
		this.messageHandlers.set("fill_form", this.handleFillForm.bind(this));

		// Chrome Extension  management
		this.messageHandlers.set(
			"get_extension_errors",
			this.handleGetExtensionErrors.bind(this),
		);
		this.messageHandlers.set(
			"clear_extension_errors",
			this.handleClearExtensionErrors.bind(this),
		);
		this.messageHandlers.set(
			"reload_extension",
			this.handleReloadExtension.bind(this),
		);
		this.messageHandlers.set(
			"get_extension_version",
			this.handleGetExtensionVersion.bind(this),
		);
	}

	setupErrorHandlers() {
		// Enhanced error capture system

		// 1. Capture uncaught errors in the extension
		self.addEventListener("error", (event) => {
			this.logError(
				"Uncaught Error",
				event.error?.message || event.message,
				event.error?.stack,
				{
					filename: event.filename,
					lineno: event.lineno,
					colno: event.colno,
				},
			);
		});

		// 2. Capture unhandled promise rejections
		self.addEventListener("unhandledrejection", (event) => {
			this.logError(
				"Unhandled Promise Rejection",
				event.reason?.message || String(event.reason),
				event.reason?.stack,
			);
		});

		// 3. Capture Chrome runtime errors
		if (chrome.runtime.onStartup) {
			chrome.runtime.onStartup.addListener(() => {
				if (chrome.runtime.lastError) {
					this.logError(
						"Runtime Startup Error",
						chrome.runtime.lastError.message,
					);
				}
			});
		}

		// 6. Monitor for Chrome API errors
		this.setupChromeAPIErrorMonitoring();
	}

	setupChromeAPIErrorMonitoring() {
		// Wrap Chrome API calls to catch errors
		const originalTabsUpdate = chrome.tabs.update;
		chrome.tabs.update = async (...args) => {
			try {
				return await originalTabsUpdate.apply(chrome.tabs, args);
			} catch (error) {
				this.logError(
					"Chrome Tabs API Error",
					`tabs.update failed: ${error.message}`,
					error.stack,
					{
						api: "chrome.tabs.update",
						args: args,
					},
				);
				throw error;
			}
		};
	}

	logError(type, message, stack = null, context = {}) {
		const errorEntry = {
			id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: Date.now(),
			type: type,
			message: message,
			stack: stack,
			url: globalThis.location?.href || "Extension Background",
			userAgent: navigator.userAgent,
			context: context,
		};

		this.extensionErrors.unshift(errorEntry);

		// Keep only recent errors
		if (this.extensionErrors.length > this.maxErrorEntries) {
			this.extensionErrors = this.extensionErrors.slice(
				0,
				this.maxErrorEntries,
			);
		}

		// Also log to console for debugging
		console.error(
			`[BROP Error] ${type}: ${message}`,
			stack ? `\nStack: ${stack}` : "",
		);

		this.saveSettings();
	}

	async loadSettings() {
		try {
			const result = await chrome.storage.local.get([
				"brop_enabled",
				"brop_logs",
				"brop_errors",
			]);
			this.enabled = result.brop_enabled !== false;
			this.callLogs = result.brop_logs || [];
			this.extensionErrors = result.brop_errors || [];
			console.log(
				`BROP server loaded: ${this.enabled ? "enabled" : "disabled"}`,
			);
		} catch (error) {
			console.error("Error loading BROP settings:", error);
		}
	}

	async saveSettings() {
		try {
			await chrome.storage.local.set({
				brop_enabled: this.enabled,
				brop_logs: this.callLogs.slice(-this.maxLogEntries),
				brop_errors: this.extensionErrors.slice(-this.maxErrorEntries),
			});
		} catch (error) {
			console.error("Error saving BROP settings:", error);
		}
	}

	// Main BROP command processor
	async processBROPCommand(message) {
		const { id, method, params } = message;

		console.log("🔧 BROP Server processing command:", {
			method: method,
			methodType: typeof method,
			hasParams: !!params,
		});

		if (!method) {
			throw new Error("Invalid command: missing method");
		}

		// Check if service is enabled
		if (!this.enabled) {
			console.log(`BROP command ignored (service disabled): ${method}`);
			throw new Error("BROP service is disabled");
		}

		const handler = this.messageHandlers.get(method);
		if (!handler) {
			throw new Error(`Unsupported BROP command: ${method}`);
		}

		const startTime = Date.now();
		try {
			const result = await handler(params || {});
			const duration = Date.now() - startTime;

			// Log successful BROP command
			this.logCall(method, "BROP", params, result, null, duration);

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			console.error(`BROP command error (${method}):`, error);
			this.logError(
				"BROP Command Error",
				`${method}: ${error.message}`,
				error.stack,
			);

			// Log failed BROP command
			this.logCall(method, "BROP", params, null, error.message, duration);

			throw error;
		}
	}

	// BROP Method Implementations
	async handleStartConsoleCapture(params) {
		const { tabId } = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		console.log(
			`🔧 Starting console capture for tab ${targetTab.id} - "${targetTab.title}"`,
		);

		// Check if we already have a session for this tab
		let session = this.debuggerSessions.get(tabId);

		if (session?.attached) {
			// Clear existing logs to start fresh
			session.consoleLogs = [];
			session.captureStartTime = Date.now();
			console.log(
				`🔧 Cleared existing logs for tab ${tabId}, starting fresh capture`,
			);

			return {
				success: true,
				message: "Console capture restarted",
				tabId: tabId,
				tab_title: targetTab.title,
				tab_url: targetTab.url,
				capture_started: session.captureStartTime,
			};
		}

		try {
			// Check if debugger is already attached
			const targets = await chrome.debugger.getTargets();
			const target = targets.find((t) => t.tabId === tabId);

			if (target?.attached) {
				throw new Error("Debugger already attached by another process");
			}

			// Attach debugger to the tab
			await chrome.debugger.attach({ tabId: tabId }, "1.3");
			console.log(`🔧 Debugger attached to tab ${tabId}`);

			// Enable Runtime domain to receive console messages
			await chrome.debugger.sendCommand({ tabId: tabId }, "Runtime.enable", {});

			// Enable Log domain for additional console capture
			await chrome.debugger.sendCommand({ tabId: tabId }, "Log.enable", {});

			// Enable Page domain to track navigation
			await chrome.debugger.sendCommand({ tabId: tabId }, "Page.enable", {});

			console.log("🔧 Runtime, Log, and Page domains enabled");

			// Create session
			session = {
				tabId: tabId,
				attached: true,
				consoleLogs: [],
				captureStartTime: Date.now(),
				eventListener: null,
			};

			// Set up persistent event listener for this session
			session.eventListener = (source, method, params) => {
				if (source.tabId !== tabId) return;

				// Handle console API calls
				if (method === "Runtime.consoleAPICalled") {
					const logEntry = {
						level: params.type,
						message: params.args
							.map((arg) => {
								if (arg.type === "string") return arg.value;
								if (arg.type === "number") return String(arg.value);
								if (arg.type === "boolean") return String(arg.value);
								if (arg.type === "object" && arg.preview) {
									return (
										arg.preview.description || arg.description || "[Object]"
									);
								}
								if (arg.type === "undefined") return "undefined";
								if (arg.type === "function") return "[Function]";
								return arg.description || String(arg.value || "[Unknown]");
							})
							.join(" "),
						timestamp: params.timestamp || Date.now(),
						source: params.stackTrace?.callFrames?.[0]?.url || "console",
						line: params.stackTrace?.callFrames?.[0]?.lineNumber || 0,
						column: params.stackTrace?.callFrames?.[0]?.columnNumber || 0,
					};

					session.consoleLogs.push(logEntry);
					console.log(
						`🔧 Captured console.${logEntry.level}: ${logEntry.message.substring(0, 100)}...`,
					);

					// Keep only recent logs
					if (session.consoleLogs.length > 1000) {
						session.consoleLogs = session.consoleLogs.slice(-1000);
					}
				}

				// Also handle Log domain entries
				if (method === "Log.entryAdded") {
					const entry = params.entry;
					const logEntry = {
						level: entry.level,
						message: entry.text,
						timestamp: entry.timestamp || Date.now(),
						source: entry.source || "log",
						line: entry.lineNumber || 0,
						column: 0,
					};

					session.consoleLogs.push(logEntry);
					console.log(
						`🔧 Captured log entry: ${logEntry.message.substring(0, 100)}...`,
					);

					// Keep only recent logs
					if (session.consoleLogs.length > 1000) {
						session.consoleLogs = session.consoleLogs.slice(-1000);
					}
				}

				// Handle page navigation (clears console)
				if (
					method === "Page.navigatedWithinDocument" ||
					method === "Page.frameNavigated"
				) {
					if (params.frame && params.frame.parentId === undefined) {
						console.log(
							`🔧 Page navigated, clearing console logs for tab ${tabId}`,
						);
						session.consoleLogs = [];
					}
				}
			};

			// Register the event listener
			chrome.debugger.onEvent.addListener(session.eventListener);

			// Store the session
			this.debuggerSessions.set(tabId, session);

			// Trigger a test log to confirm capture is working
			try {
				await chrome.debugger.sendCommand(
					{ tabId: tabId },
					"Runtime.evaluate",
					{
						expression: `console.log('[BROP] Console capture started at ${new Date().toISOString()}');`,
						returnByValue: true,
					},
				);
			} catch (evalError) {
				console.log(`🔧 Could not inject test log: ${evalError.message}`);
			}

			return {
				success: true,
				message: "Console capture started",
				tabId: tabId,
				tab_title: targetTab.title,
				tab_url: targetTab.url,
				capture_started: session.captureStartTime,
			};
		} catch (error) {
			console.error("🔧 Failed to start console capture:", error);

			// Clean up on error
			if (session?.eventListener) {
				chrome.debugger.onEvent.removeListener(session.eventListener);
			}
			this.debuggerSessions.delete(tabId);

			// Try to detach debugger
			try {
				await chrome.debugger.detach({ tabId: tabId });
			} catch (detachError) {
				// Ignore detach errors
			}

			throw new Error(`Failed to start console capture: ${error.message}`);
		}
	}

	async handleStopConsoleCapture(params) {
		const { tabId } = params;

		if (!tabId) {
			throw new Error("tabId is required");
		}

		const session = this.debuggerSessions.get(tabId);

		if (!session) {
			return {
				success: false,
				message: "No active console capture session for this tab",
			};
		}

		try {
			// Remove event listener
			if (session.eventListener) {
				chrome.debugger.onEvent.removeListener(session.eventListener);
			}

			// Detach debugger
			await chrome.debugger.detach({ tabId: tabId });

			// Get final log count
			const logCount = session.consoleLogs.length;

			// Remove session
			this.debuggerSessions.delete(tabId);

			console.log(
				`🔧 Stopped console capture for tab ${tabId}, captured ${logCount} logs`,
			);

			return {
				success: true,
				message: "Console capture stopped",
				tabId: tabId,
				logs_captured: logCount,
				capture_duration: Date.now() - session.captureStartTime,
			};
		} catch (error) {
			// Remove session even if detach fails
			this.debuggerSessions.delete(tabId);

			return {
				success: false,
				message: `Error stopping capture: ${error.message}`,
			};
		}
	}

	async handleClearConsoleLogs(params) {
		const { tabId } = params;

		if (!tabId) {
			throw new Error("tabId is required");
		}

		const session = this.debuggerSessions.get(tabId);

		if (!session || !session.attached) {
			return {
				success: false,
				message: "No active console capture session for this tab",
				tabId: tabId,
			};
		}

		// Store the count before clearing
		const previousCount = session.consoleLogs.length;

		// Clear the logs
		session.consoleLogs = [];

		// Update the capture start time to now (for duration calculations)
		const previousStartTime = session.captureStartTime;
		session.captureStartTime = Date.now();

		console.log(`🔧 Cleared ${previousCount} console logs for tab ${tabId}`);

		return {
			success: true,
			message: "Console logs cleared",
			tabId: tabId,
			logs_cleared: previousCount,
			previous_capture_duration: Date.now() - previousStartTime,
			new_capture_started: session.captureStartTime,
		};
	}

	async handleGetConsoleLogs(params) {
		const { tabId } = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		// Check if we have an active capture session
		const session = this.debuggerSessions.get(tabId);

		if (!session || !session.attached) {
			console.log(`🔧 No active console capture session for tab ${tabId}`);
			return {
				logs: [],
				source: "no_active_session",
				tab_id: tabId,
				message:
					"No active console capture session. Use start_console_capture first.",
				timestamp: Date.now(),
				total_captured: 0,
			};
		}

		// Get tab info for response
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			// Tab might have been closed
			targetTab = { title: "Unknown", url: "Unknown" };
		}

		console.log(
			`🔧 Getting console logs for tab ${tabId} - "${targetTab.title}"`,
		);

		// Get logs from session
		let logs = [...session.consoleLogs];

		// Apply limit
		if (params.limit && params.limit > 0) {
			logs = logs.slice(-params.limit);
		}

		// Filter by level if specified
		if (params.level && params.level !== "all") {
			logs = logs.filter((log) => log.level === params.level);
		}

		const captureTime = Date.now() - session.captureStartTime;

		console.log(
			`🔧 Returning ${logs.length} logs from session (captured over ${captureTime}ms)`,
		);

		return {
			logs: logs,
			source: "active_debugger_session",
			tab_title: targetTab.title,
			tab_url: targetTab.url,
			tab_id: tabId,
			timestamp: Date.now(),
			total_captured: logs.length,
			total_in_session: session.consoleLogs.length,
			capture_duration: captureTime,
			capture_started: session.captureStartTime,
		};
	}

	async getRuntimeConsoleLogs(tabId, limit = 100) {
		console.log(
			`🔧 DEBUG getRuntimeConsoleLogs: Using runtime messaging for tab ${tabId}`,
		);

		if (!tabId || Number.isNaN(tabId)) {
			console.log(
				`🔧 DEBUG: Invalid tabId: ${tabId}, using extension logs fallback`,
			);
			return this.getStoredConsoleLogs(limit);
		}

		try {
			// Method 2: Try chrome.tabs.sendMessage to content script (if available)
			console.log(
				`🔧 DEBUG: Trying chrome.tabs.sendMessage to content script for tab ${tabId}...`,
			);
			try {
				// First verify the tab exists and is accessible
				const tab = await chrome.tabs.get(tabId);
				if (!tab) {
					throw new Error(`Tab ${tabId} does not exist`);
				}

				if (
					tab.url.startsWith("chrome://") ||
					tab.url.startsWith("chrome-extension://")
				) {
					throw new Error(`Cannot access chrome:// URL: ${tab.url}`);
				}

				const response = await new Promise((resolve, reject) => {
					// Add timeout to prevent hanging
					const timeout = setTimeout(() => {
						reject(new Error("Content script messaging timeout"));
					}, 2000);

					chrome.tabs.sendMessage(
						tabId,
						{
							type: "GET_LOGS",
							tabId: tabId,
							limit: limit,
						},
						(response) => {
							clearTimeout(timeout);
							if (chrome.runtime.lastError) {
								reject(new Error(chrome.runtime.lastError.message));
							} else {
								resolve(response);
							}
						},
					);
				});

				if (response?.logs) {
					console.log(
						`🔧 DEBUG: Content script messaging returned ${response.logs.length} logs`,
					);
					return response.logs;
				}
			} catch (contentScriptError) {
				console.log(
					"🔧 DEBUG: Content script messaging failed:",
					contentScriptError.message,
				);
			}

			// If content script not available, try executeScript approach
			console.log(
				"🔧 DEBUG: Content script not available, trying executeScript with console interception...",
			);

			// First, set up console interception if not already done
			await chrome.scripting.executeScript({
				target: { tabId: tabId },
				func: () => {
					// Set up console interception if not already present
					if (!window.__bropConsoleIntercepted) {
						window.__bropConsoleIntercepted = true;
						window.__bropConsoleLogs = [];

						const originals = {
							log: console.log,
							warn: console.warn,
							error: console.error,
							info: console.info,
							debug: console.debug,
						};

						["log", "warn", "error", "info", "debug"].forEach((level) => {
							console[level] = (...args) => {
								originals[level].apply(console, args);
								window.__bropConsoleLogs.push({
									level: level,
									message: args
										.map((arg) => {
											try {
												return typeof arg === "object"
													? JSON.stringify(arg)
													: String(arg);
											} catch (e) {
												return String(arg);
											}
										})
										.join(" "),
									timestamp: Date.now(),
									source: window.location.href,
									line: 0,
									column: 0,
								});

								// Keep only last 1000 logs
								if (window.__bropConsoleLogs.length > 1000) {
									window.__bropConsoleLogs =
										window.__bropConsoleLogs.slice(-1000);
								}
							};
						});

						console.log("BROP: Console interception initialized");
					}
				},
			});

			// Now get the logs
			const results = await chrome.scripting.executeScript({
				target: { tabId: tabId },
				func: (requestLimit) => {
					// Return any captured logs
					const logs = window.__bropConsoleLogs || [];
					return logs.slice(-requestLimit);
				},
				args: [limit],
			});

			const executedLogs = results[0]?.result || [];
			console.log(
				`🔧 DEBUG: executeScript returned ${executedLogs.length} logs`,
			);
			return executedLogs;
		} catch (error) {
			console.error("🔧 DEBUG: Runtime messaging failed:", error);

			// Return empty array with metadata about the attempt
			return [
				{
					level: "info",
					message: `Console log capture attempted but no logs available (${error.message})`,
					timestamp: Date.now(),
					source: "capture_attempt_metadata",
				},
			];
		}
	}

	getStoredConsoleLogs(limit = 100) {
		// Return stored extension background console logs as fallback
		return this.callLogs.slice(-limit).map((log) => ({
			level: log.success ? "info" : "error",
			message: `${log.method}: ${log.success ? "success" : log.error}`,
			timestamp: log.timestamp,
			source: "extension_background",
		}));
	}

	async getDebuggerConsoleLogs(tabId, limit = 100) {
		console.log(
			`🔧 DEBUG getDebuggerConsoleLogs: Using debugger API for tab ${tabId}`,
		);

		// Check if we have an existing session for this tab
		let session = this.debuggerSessions.get(tabId);
		let newlyAttached = false;

		try {
			if (!session) {
				// Check if debugger is already attached
				const targets = await chrome.debugger.getTargets();
				const target = targets.find((t) => t.tabId === tabId);

				if (target?.attached) {
					console.log(
						`🔧 DEBUG: Debugger already attached to tab ${tabId}, creating session`,
					);
					session = {
						tabId: tabId,
						attached: true,
						consoleLogs: [],
						eventListener: null,
					};
					this.debuggerSessions.set(tabId, session);
				} else {
					// Attach debugger to the tab
					await chrome.debugger.attach({ tabId: tabId }, "1.3");
					newlyAttached = true;
					console.log(`🔧 DEBUG: Debugger attached to tab ${tabId}`);

					// Enable Runtime domain to receive console messages
					await chrome.debugger.sendCommand(
						{ tabId: tabId },
						"Runtime.enable",
						{},
					);

					// Enable Log domain for additional console capture
					await chrome.debugger.sendCommand({ tabId: tabId }, "Log.enable", {});

					console.log("🔧 DEBUG: Runtime and Log domains enabled");

					// Create session
					session = {
						tabId: tabId,
						attached: true,
						consoleLogs: [],
						eventListener: null,
					};
					this.debuggerSessions.set(tabId, session);
				}

				// Set up persistent event listener for this session
				session.eventListener = (source, method, params) => {
					if (source.tabId !== tabId) return;

					console.log(`🔧 DEBUG: Persistent event: ${method}`);

					// Handle console API calls
					if (method === "Runtime.consoleAPICalled") {
						const logEntry = {
							level: params.type,
							message: params.args
								.map((arg) => {
									if (arg.type === "string") return arg.value;
									if (arg.type === "number") return String(arg.value);
									if (arg.type === "boolean") return String(arg.value);
									if (arg.type === "object" && arg.preview) {
										return (
											arg.preview.description || arg.description || "[Object]"
										);
									}
									if (arg.type === "undefined") return "undefined";
									if (arg.type === "function") return "[Function]";
									return arg.description || String(arg.value || "[Unknown]");
								})
								.join(" "),
							timestamp: params.timestamp || Date.now(),
							source: params.stackTrace?.callFrames?.[0]?.url || "console",
							line: params.stackTrace?.callFrames?.[0]?.lineNumber || 0,
							column: params.stackTrace?.callFrames?.[0]?.columnNumber || 0,
						};

						session.consoleLogs.push(logEntry);
						console.log(
							`🔧 DEBUG: Stored console.${logEntry.level}: ${logEntry.message}`,
						);

						// Keep only recent logs
						if (session.consoleLogs.length > 1000) {
							session.consoleLogs = session.consoleLogs.slice(-1000);
						}
					}

					// Also handle Log domain entries
					if (method === "Log.entryAdded") {
						const entry = params.entry;
						const logEntry = {
							level: entry.level,
							message: entry.text,
							timestamp: entry.timestamp || Date.now(),
							source: entry.source || "log",
							line: entry.lineNumber || 0,
							column: 0,
						};

						session.consoleLogs.push(logEntry);
						console.log(`🔧 DEBUG: Stored log entry: ${logEntry.message}`);

						// Keep only recent logs
						if (session.consoleLogs.length > 1000) {
							session.consoleLogs = session.consoleLogs.slice(-1000);
						}
					}
				};

				// Register the event listener
				chrome.debugger.onEvent.addListener(session.eventListener);
			}

			// If newly attached, trigger a test log
			if (newlyAttached) {
				try {
					const evalResult = await chrome.debugger.sendCommand(
						{ tabId: tabId },
						"Runtime.evaluate",
						{
							expression: `console.log('[BROP] Console capture active');`,
							returnByValue: true,
						},
					);
					console.log("🔧 DEBUG: Triggered test log");
				} catch (evalError) {
					console.log("🔧 DEBUG: Test log error:", evalError.message);
				}
			}

			// Wait a bit to collect any pending logs
			await new Promise((resolve) => setTimeout(resolve, 500));

			console.log(
				`🔧 DEBUG: Session has ${session.consoleLogs.length} stored logs`,
			);

			// Return the most recent logs from the session
			return session.consoleLogs.slice(-limit);
		} catch (error) {
			console.error("🔧 DEBUG: Debugger console log capture failed:", error);

			// Clean up session on error
			if (session?.eventListener) {
				chrome.debugger.onEvent.removeListener(session.eventListener);
			}
			this.debuggerSessions.delete(tabId);

			// Try to detach debugger
			try {
				await chrome.debugger.detach({ tabId: tabId });
			} catch (detachError) {
				// Ignore detach errors
			}

			throw error;
		}
	}

	async handleExecuteConsole(params) {
		const { code, tabId } = params;
		let targetTab;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		// Get the specified tab
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		console.log(
			`🔧 DEBUG handleExecuteConsole: Using tab ${targetTab.id} - "${targetTab.title}" - ${targetTab.url}`,
		);

		// Check if tab URL is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error("Cannot access a chrome:// URL");
		}

		// Ensure code is a string and serializable
		const codeString = typeof code === "string" ? code : String(code);

		const results = await chrome.scripting.executeScript({
			target: { tabId: targetTab.id },
			func: (codeToExecute) => {
				try {
					// CSP-compliant console operations
					if (codeToExecute === "document.title") return document.title;
					if (codeToExecute === "window.location.href")
						return window.location.href;
					if (codeToExecute === "document.readyState")
						return document.readyState;
					if (codeToExecute.startsWith("console.log(")) {
						const msg =
							codeToExecute
								.match(/console\.log\((.+)\)/)?.[1]
								?.replace(/["']/g, "") || "unknown";
						console.log("BROP Execute:", msg);
						return `Logged: ${msg}`;
					}
					// For other code, return safe response
					console.log("BROP Execute (safe mode):", codeToExecute);
					return `CSP-safe execution: ${codeToExecute}`;
				} catch (error) {
					console.error("BROP Execute Error:", error);
					return { error: error.message };
				}
			},
			args: [codeString],
		});

		return { result: results[0]?.result };
	}

	async handleGetScreenshot(params) {
		const { full_page = false, format = "png", tabId } = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Make sure the tab is active (visible) for screenshot
		await chrome.tabs.update(tabId, { active: true });
		await chrome.windows.update(targetTab.windowId, { focused: true });

		// Wait a moment for tab to become visible
		await new Promise((resolve) => setTimeout(resolve, 200));

		const dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, {
			format: format === "jpeg" ? "jpeg" : "png",
		});

		return {
			image_data: dataUrl.split(",")[1],
			format: format,
			tabId: tabId,
			tab_title: targetTab.title,
			tab_url: targetTab.url,
		};
	}

	async handleGetPageContent(params) {
		const { tabId } = params;
		let targetTab;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		// Get the specified tab
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		console.log(
			`🔧 DEBUG handleGetPageContent: Using tab ${targetTab.id} - "${targetTab.title}" - ${targetTab.url}`,
		);

		const results = await chrome.scripting.executeScript({
			target: { tabId: targetTab.id },
			func: () => ({
				html: document.documentElement.outerHTML,
				text: document.body.innerText,
				title: document.title,
				url: window.location.href,
			}),
		});

		return results[0]?.result || {};
	}

	async handleNavigate(params) {
		const { url, tabId, create_new_tab = false, close_tab = false } = params;

		let targetTab;

		if (close_tab && tabId) {
			// Close the specified tab
			await chrome.tabs.remove(tabId);
			return { success: true, action: "tab_closed", tabId: tabId };
		}

		if (create_new_tab) {
			// Create a new tab
			const newTab = await chrome.tabs.create({ url: url || "about:blank" });
			return {
				success: true,
				action: "tab_created",
				tabId: newTab.id,
				url: newTab.url,
				title: newTab.title,
			};
		}

		if (tabId) {
			// Use specified tab
			try {
				targetTab = await chrome.tabs.get(tabId);
			} catch (error) {
				throw new Error(`Tab ${tabId} not found: ${error.message}`);
			}
		} else {
			// Use active tab
			const [activeTab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (!activeTab) {
				throw new Error("No active tab found");
			}
			targetTab = activeTab;
		}

		// Navigate the target tab
		await chrome.tabs.update(targetTab.id, { url });

		// Get updated tab info
		const updatedTab = await chrome.tabs.get(targetTab.id);

		return {
			success: true,
			action: "navigated",
			tabId: updatedTab.id,
			url: updatedTab.url,
			title: updatedTab.title,
		};
	}

	// Additional BROP methods (stubs for now, can be implemented later)
	async handleClick(params) {
		const {
			tabId,
			selector,
			waitForNavigation = false,
			timeout = 5000,
		} = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		if (!selector) {
			throw new Error(
				"selector is required - CSS selector to identify the element to click",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		// Execute click in the tab
		const results = await chrome.scripting.executeScript({
			target: { tabId },
			func: (selector, timeout) => {
				// Helper to wait for element
				const waitForElement = (selector, timeout) => {
					return new Promise((resolve, reject) => {
						const element = document.querySelector(selector);
						if (element) {
							resolve(element);
							return;
						}

						const observer = new MutationObserver((mutations, obs) => {
							const element = document.querySelector(selector);
							if (element) {
								obs.disconnect();
								resolve(element);
							}
						});

						observer.observe(document.body, {
							childList: true,
							subtree: true,
						});

						setTimeout(() => {
							observer.disconnect();
							reject(new Error(`Element not found: ${selector}`));
						}, timeout);
					});
				};

				// Find and click element
				return (async () => {
					try {
						const element = await waitForElement(selector, timeout);

						// Check if element is visible and clickable
						const rect = element.getBoundingClientRect();
						const isVisible =
							rect.width > 0 &&
							rect.height > 0 &&
							window.getComputedStyle(element).visibility !== "hidden" &&
							window.getComputedStyle(element).display !== "none";

						if (!isVisible) {
							throw new Error(`Element is not visible: ${selector}`);
						}

						// Check if element is disabled
						if (element.disabled) {
							throw new Error(`Element is disabled: ${selector}`);
						}

						// Simulate mouse events for better compatibility
						const clickEvent = new MouseEvent("click", {
							bubbles: true,
							cancelable: true,
							view: window,
							button: 0,
							buttons: 1,
							clientX: rect.left + rect.width / 2,
							clientY: rect.top + rect.height / 2,
						});

						// Also trigger mousedown and mouseup for complete simulation
						element.dispatchEvent(
							new MouseEvent("mousedown", {
								bubbles: true,
								cancelable: true,
								view: window,
								button: 0,
								buttons: 1,
							}),
						);

						element.dispatchEvent(clickEvent);

						element.dispatchEvent(
							new MouseEvent("mouseup", {
								bubbles: true,
								cancelable: true,
								view: window,
								button: 0,
								buttons: 0,
							}),
						);

						// For links and buttons, also try native click
						if (
							element.tagName === "A" ||
							element.tagName === "BUTTON" ||
							element.tagName === "INPUT" ||
							element.role === "button"
						) {
							element.click();
						}

						return {
							success: true,
							element: {
								tagName: element.tagName,
								id: element.id || null,
								className: element.className || null,
								text: element.textContent?.substring(0, 100) || null,
								href: element.href || null,
								type: element.type || null,
							},
							boundingBox: {
								x: rect.x,
								y: rect.y,
								width: rect.width,
								height: rect.height,
							},
						};
					} catch (error) {
						return {
							success: false,
							error: error.message,
						};
					}
				})();
			},
			args: [selector, timeout],
		});

		const result = results[0]?.result;
		if (!result || !result.success) {
			throw new Error(result?.error || "Click operation failed");
		}

		// If waitForNavigation is true, wait a bit for potential navigation
		if (waitForNavigation) {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Get updated tab info
			const updatedTab = await chrome.tabs.get(tabId);
			result.navigation = {
				occurred: updatedTab.url !== targetTab.url,
				newUrl: updatedTab.url,
				oldUrl: targetTab.url,
			};
		}

		return {
			success: true,
			tabId: tabId,
			selector: selector,
			clicked: result.element,
			position: result.boundingBox,
			navigation: result.navigation || null,
		};
	}

	async handleType(params) {
		const {
			tabId,
			selector,
			text,
			delay = null, // Will be set based on humanLike
			humanLike = false,
			clear = false,
			pressEnter = false,
			typoChance = 0.02,
			timeout = 5000,
		} = params;

		// Set realistic default delays
		const defaultDelay = humanLike ? 100 : 50; // Humans type ~100-150ms per char on average
		const actualDelay = delay !== null ? delay : defaultDelay;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		if (!selector) {
			throw new Error(
				"selector is required - CSS selector to identify the element to type into",
			);
		}

		if (typeof text !== "string") {
			throw new Error("text is required and must be a string");
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		// Execute typing in the tab
		const results = await chrome.scripting.executeScript({
			target: { tabId },
			func: async (selector, text, options) => {
				const { delay, humanLike, clear, pressEnter, typoChance, timeout } =
					options;

				// Helper to wait for element
				const waitForElement = (selector, timeout) => {
					return new Promise((resolve, reject) => {
						const element = document.querySelector(selector);
						if (element) {
							resolve(element);
							return;
						}

						const observer = new MutationObserver((mutations, obs) => {
							const element = document.querySelector(selector);
							if (element) {
								obs.disconnect();
								resolve(element);
							}
						});

						observer.observe(document.body, {
							childList: true,
							subtree: true,
						});

						setTimeout(() => {
							observer.disconnect();
							reject(new Error(`Element not found: ${selector}`));
						}, timeout);
					});
				};

				// Helper to generate random delay
				const getRandomDelay = (baseDelay) => {
					if (!humanLike) return baseDelay;

					// Human typing speed varies:
					// - Average typist: 80-120ms per character
					// - Fast typist: 50-80ms per character
					// - Slow/careful: 120-200ms per character
					// We'll use a normal distribution centered around baseDelay

					// Simple approximation of normal distribution using Box-Muller
					const u1 = Math.random();
					const u2 = Math.random();
					const normal =
						Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

					// Standard deviation is ~20% of base delay
					const stdDev = baseDelay * 0.2;
					const delay = Math.round(baseDelay + normal * stdDev);

					// Clamp to reasonable bounds
					// Minimum: 40ms (very fast typing)
					// Maximum: 250ms (thoughtful/careful typing)
					return Math.max(40, Math.min(250, delay));
				};

				// Helper to introduce typos
				const shouldMakeTypo = () => humanLike && Math.random() < typoChance;

				// Common typo patterns
				const makeTypo = (char, index, text) => {
					const typoTypes = ["adjacent", "double", "skip"];
					const typoType =
						typoTypes[Math.floor(Math.random() * typoTypes.length)];

					switch (typoType) {
						case "adjacent": {
							// Type adjacent key on keyboard
							const adjacentKeys = {
								a: ["s", "q", "w"],
								b: ["v", "n", "g", "h"],
								c: ["x", "v", "d", "f"],
								d: ["s", "f", "e", "r", "c", "x"],
								e: ["w", "r", "d", "s"],
								f: ["d", "g", "r", "t", "c", "v"],
								g: ["f", "h", "t", "y", "b", "v"],
								h: ["g", "j", "y", "u", "n", "b"],
								i: ["u", "o", "k", "j"],
								j: ["h", "k", "u", "i", "m", "n"],
								k: ["j", "l", "i", "o", "m"],
								l: ["k", "o", "p"],
								m: ["n", "j", "k"],
								n: ["b", "m", "h", "j"],
								o: ["i", "p", "l", "k"],
								p: ["o", "l"],
								q: ["w", "a"],
								r: ["e", "t", "f", "d"],
								s: ["a", "d", "w", "e", "z", "x"],
								t: ["r", "y", "g", "f"],
								u: ["y", "i", "j", "h"],
								v: ["c", "b", "f", "g"],
								w: ["q", "e", "a", "s"],
								x: ["z", "c", "s", "d"],
								y: ["t", "u", "h", "g"],
								z: ["x", "s", "a"],
							};
							const lowerChar = char.toLowerCase();
							if (adjacentKeys[lowerChar]) {
								const typoChar =
									adjacentKeys[lowerChar][
										Math.floor(Math.random() * adjacentKeys[lowerChar].length)
									];
								return char === lowerChar ? typoChar : typoChar.toUpperCase();
							}
							return char;
						}

						case "double":
							// Type character twice
							return char + char;

						case "skip":
							// Skip character (will be corrected)
							return "";

						default:
							return char;
					}
				};

				// Helper to simulate keyboard event
				const simulateKeyEvent = (element, eventType, key) => {
					const event = new KeyboardEvent(eventType, {
						key: key,
						code: `Key${key.toUpperCase()}`,
						keyCode: key.charCodeAt(0),
						which: key.charCodeAt(0),
						bubbles: true,
						cancelable: true,
					});
					element.dispatchEvent(event);
				};

				// Helper to wait
				const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

				try {
					// Find and focus element
					const element = await waitForElement(selector, timeout);

					// Check if element is visible and enabled
					const rect = element.getBoundingClientRect();
					const isVisible =
						rect.width > 0 &&
						rect.height > 0 &&
						window.getComputedStyle(element).visibility !== "hidden" &&
						window.getComputedStyle(element).display !== "none";

					if (!isVisible) {
						throw new Error(`Element is not visible: ${selector}`);
					}

					if (element.disabled || element.readOnly) {
						throw new Error(`Element is disabled or read-only: ${selector}`);
					}

					// Check if it's an input element
					const isInput =
						["INPUT", "TEXTAREA"].includes(element.tagName) ||
						element.contentEditable === "true";

					if (!isInput) {
						throw new Error(`Element is not a text input: ${selector}`);
					}

					// Focus the element
					element.focus();
					simulateKeyEvent(element, "focusin", "");

					// Clear existing content if requested
					if (clear) {
						element.select ? element.select() : null;
						element.value = "";
						element.textContent = "";
						simulateKeyEvent(element, "input", "");
						element.dispatchEvent(new Event("change", { bubbles: true }));
						await wait(delay);
					}

					// Type text character by character
					let typedText = "";
					const corrections = [];

					for (let i = 0; i < text.length; i++) {
						const char = text[i];
						let charToType = char;
						let madeTypo = false;

						// Potentially make a typo
						if (shouldMakeTypo() && i > 0 && i < text.length - 1) {
							charToType = makeTypo(char, i, text);
							if (charToType !== char) {
								madeTypo = true;
								corrections.push({
									position: typedText.length + charToType.length,
									correct: char,
									typo: charToType,
								});
							}
						}

						// Type the character(s)
						for (const c of charToType) {
							simulateKeyEvent(element, "keydown", c);
							simulateKeyEvent(element, "keypress", c);

							if (element.value !== undefined) {
								element.value += c;
							} else {
								element.textContent += c;
							}
							typedText += c;

							simulateKeyEvent(element, "keyup", c);
							simulateKeyEvent(element, "input", c);

							// Random delay between characters
							if (humanLike || delay > 0) {
								let charDelay = getRandomDelay(delay);

								// Occasionally add "thinking pauses" in human mode
								if (humanLike) {
									// 5% chance of a longer pause (thinking/hesitation)
									if (Math.random() < 0.05) {
										charDelay += Math.floor(Math.random() * 300) + 200; // Add 200-500ms
									}
									// 15% chance of a short pause (word boundaries)
									else if (Math.random() < 0.15) {
										charDelay += Math.floor(Math.random() * 100) + 50; // Add 50-150ms
									}
								}

								await wait(charDelay);
							}
						}

						// If we made a typo and it was a skip, we need to add the character
						if (madeTypo && charToType === "") {
							// Simulate realizing the mistake after a brief pause
							if (humanLike) {
								await wait(getRandomDelay(delay * 3));
							}

							// Type the correct character
							simulateKeyEvent(element, "keydown", char);
							simulateKeyEvent(element, "keypress", char);

							if (element.value !== undefined) {
								element.value += char;
							} else {
								element.textContent += char;
							}
							typedText += char;

							simulateKeyEvent(element, "keyup", char);
							simulateKeyEvent(element, "input", char);
						}
					}

					// Correct typos if we made any (human-like behavior)
					if (humanLike && corrections.length > 0) {
						for (const correction of corrections.reverse()) {
							// Pause before correcting (simulating realization)
							await wait(getRandomDelay(delay * 5));

							// Move cursor to position (simplified - just backspace)
							const charsToDelete =
								typedText.length - correction.position + correction.typo.length;

							for (let i = 0; i < charsToDelete; i++) {
								simulateKeyEvent(element, "keydown", "Backspace");
								if (element.value !== undefined) {
									element.value = element.value.slice(0, -1);
								} else {
									element.textContent = element.textContent.slice(0, -1);
								}
								simulateKeyEvent(element, "keyup", "Backspace");
								simulateKeyEvent(element, "input", "Backspace");

								if (humanLike) {
									await wait(getRandomDelay(delay * 0.5));
								}
							}

							// Retype the correct text
							const reTypeText = text.substring(
								correction.position - correction.typo.length,
							);
							for (const c of reTypeText) {
								simulateKeyEvent(element, "keydown", c);
								simulateKeyEvent(element, "keypress", c);

								if (element.value !== undefined) {
									element.value += c;
								} else {
									element.textContent += c;
								}

								simulateKeyEvent(element, "keyup", c);
								simulateKeyEvent(element, "input", c);

								if (humanLike) {
									await wait(getRandomDelay(delay));
								}
							}
						}
					}

					// Trigger change event
					element.dispatchEvent(new Event("change", { bubbles: true }));

					// Press Enter if requested
					if (pressEnter) {
						await wait(delay);
						simulateKeyEvent(element, "keydown", "Enter");
						simulateKeyEvent(element, "keypress", "Enter");
						simulateKeyEvent(element, "keyup", "Enter");

						// For forms, might trigger submit
						const form = element.closest("form");
						if (form) {
							const submitEvent = new Event("submit", {
								bubbles: true,
								cancelable: true,
							});
							form.dispatchEvent(submitEvent);
						}
					}

					// Get final value
					const finalValue = element.value || element.textContent;

					return {
						success: true,
						element: {
							tagName: element.tagName,
							id: element.id || null,
							className: element.className || null,
							name: element.name || null,
							type: element.type || null,
							placeholder: element.placeholder || null,
						},
						typed: text,
						finalValue: finalValue,
						corrections: corrections.length,
						humanLike: humanLike,
					};
				} catch (error) {
					return {
						success: false,
						error: error.message,
					};
				}
			},
			args: [
				selector,
				text,
				{
					delay: actualDelay,
					humanLike,
					clear,
					pressEnter,
					typoChance,
					timeout,
				},
			],
		});

		const result = results[0]?.result;
		if (!result || !result.success) {
			throw new Error(result?.error || "Type operation failed");
		}

		return {
			success: true,
			tabId: tabId,
			selector: selector,
			typed: result.typed,
			finalValue: result.finalValue,
			element: result.element,
			corrections: result.corrections,
			humanLike: result.humanLike,
		};
	}

	async handleWaitForElement(params) {
		const {
			tabId,
			selector,
			timeout = 30000,
			visible = true,
			pollInterval = 100,
		} = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		if (!selector) {
			throw new Error(
				"selector is required - CSS selector to identify the element to wait for",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		// Execute wait in the tab
		const results = await chrome.scripting.executeScript({
			target: { tabId },
			func: async (selector, options) => {
				const { timeout, visible, pollInterval } = options;
				const startTime = Date.now();

				// Helper to check if element meets criteria
				const checkElement = (element) => {
					if (!element) return false;

					if (visible) {
						const rect = element.getBoundingClientRect();
						const isVisible =
							rect.width > 0 &&
							rect.height > 0 &&
							window.getComputedStyle(element).visibility !== "hidden" &&
							window.getComputedStyle(element).display !== "none";

						if (!isVisible) return false;
					}

					return true;
				};

				// Try to find element immediately
				const element = document.querySelector(selector);
				if (checkElement(element)) {
					return {
						success: true,
						found: true,
						waitTime: 0,
						element: {
							tagName: element.tagName,
							id: element.id || null,
							className: element.className || null,
							textContent: element.textContent?.substring(0, 100) || null,
							isVisible: true,
						},
					};
				}

				// Set up mutation observer to watch for element
				return new Promise((resolve) => {
					let resolved = false;

					// Check periodically
					const intervalId = setInterval(() => {
						const element = document.querySelector(selector);
						if (checkElement(element)) {
							resolved = true;
							clearInterval(intervalId);
							if (observer) observer.disconnect();

							resolve({
								success: true,
								found: true,
								waitTime: Date.now() - startTime,
								element: {
									tagName: element.tagName,
									id: element.id || null,
									className: element.className || null,
									textContent: element.textContent?.substring(0, 100) || null,
									isVisible: visible,
								},
							});
						}

						// Check timeout
						if (Date.now() - startTime > timeout) {
							resolved = true;
							clearInterval(intervalId);
							if (observer) observer.disconnect();

							resolve({
								success: true,
								found: false,
								waitTime: timeout,
								reason: `Element not found after ${timeout}ms`,
							});
						}
					}, pollInterval);

					// Also use MutationObserver for immediate detection
					const observer = new MutationObserver((mutations) => {
						if (resolved) return;

						const element = document.querySelector(selector);
						if (checkElement(element)) {
							resolved = true;
							clearInterval(intervalId);
							observer.disconnect();

							resolve({
								success: true,
								found: true,
								waitTime: Date.now() - startTime,
								element: {
									tagName: element.tagName,
									id: element.id || null,
									className: element.className || null,
									textContent: element.textContent?.substring(0, 100) || null,
									isVisible: visible,
								},
							});
						}
					});

					// Start observing
					observer.observe(document.body, {
						childList: true,
						subtree: true,
						attributes: true,
						attributeFilter: ["style", "class", "hidden"],
					});
				});
			},
			args: [selector, { timeout, visible, pollInterval }],
		});

		const result = results[0]?.result;
		if (!result || !result.success) {
			throw new Error(result?.reason || "Wait for element operation failed");
		}

		if (!result.found) {
			throw new Error(
				`Element not found: ${selector} (waited ${result.waitTime}ms)`,
			);
		}

		return {
			success: true,
			tabId: tabId,
			selector: selector,
			found: result.found,
			waitTime: result.waitTime,
			element: result.element,
		};
	}

	async handleEvaluateJS(params) {
		const {
			tabId,
			code,
			args = [],
			awaitPromise = true,
			returnByValue = true,
			timeout = 30000,
		} = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		if (!code || typeof code !== "string") {
			throw new Error(
				"code is required and must be a string containing JavaScript to execute",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		// Execute JavaScript in the tab
		// Due to CSP restrictions, we need to be creative about code execution
		// We'll use chrome.debugger API if available, or fall back to limited execution
		const executeWithDebugger = async () => {
			// Check if we already have an active debugger session
			const existingSession = this.debuggerSessions.get(tabId);
			let needsDetach = false;
			// If we don't have an existing session, attach debugger
			if (!existingSession || !existingSession.attached) {
				await chrome.debugger.attach({ tabId }, "1.3");
				needsDetach = true;
				// Enable runtime
				await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
			}

			try {
				// Prepare the expression
				let expression = code;
				const trimmedCode = code.trim();

				// Check if code needs to be wrapped
				const isFunction =
					trimmedCode.startsWith("(") ||
					trimmedCode.startsWith("function") ||
					trimmedCode.startsWith("async");
				const hasReturn = trimmedCode.includes("return");

				if (hasReturn && !isFunction) {
					// Wrap code with return statement in an IIFE
					expression = `(function() { ${trimmedCode} })()`;
				} else if (isFunction && (!args || args.length === 0)) {
					// It's a function definition without args - need to invoke it
					if (trimmedCode.startsWith("async") && trimmedCode.includes("=>")) {
						// Async arrow function
						expression = `(${trimmedCode})()`;
					} else if (trimmedCode.startsWith("async function")) {
						// Async regular function
						expression = `(${trimmedCode})()`;
					} else if (
						trimmedCode.startsWith("(") &&
						trimmedCode.includes("=>")
					) {
						// Regular arrow function (check if it has no params)
						const arrowMatch = trimmedCode.match(/^\(\s*\)\s*=>/);
						if (arrowMatch) {
							expression = `(${trimmedCode})()`;
						}
					} else if (trimmedCode.startsWith("function")) {
						// Regular function
						expression = `(${trimmedCode})()`;
					}
				} else if (args && args.length > 0) {
					// If args are provided, we need to wrap the code properly
					if (trimmedCode.startsWith("(") && trimmedCode.includes("=>")) {
						// Arrow function - call it with args
						expression = `(${trimmedCode})(${args.map((a) => JSON.stringify(a)).join(", ")})`;
					} else if (
						trimmedCode.startsWith("function") ||
						trimmedCode.startsWith("async function")
					) {
						// Regular function - call it with args
						expression = `(${trimmedCode})(${args.map((a) => JSON.stringify(a)).join(", ")})`;
					}
				}

				// Evaluate the expression
				const response = await chrome.debugger.sendCommand(
					{ tabId },
					"Runtime.evaluate",
					{
						expression,
						awaitPromise,
						returnByValue,
						timeout: timeout,
						allowUnsafeEvalBlockedByCSP: true,
					},
				);

				// Only detach debugger if we attached it
				if (needsDetach) {
					await chrome.debugger.detach({ tabId });
				}

				if (response.exceptionDetails) {
					// Extract the actual error message
					const errorText =
						response.exceptionDetails.text ||
						response.exceptionDetails.exception?.description ||
						"Execution failed";
					throw new Error(errorText);
				}

				// Extract result based on response structure
				let resultValue;
				if (response.result.value !== undefined) {
					resultValue = response.result.value;
				} else if (response.result.unserializableValue) {
					// Handle special values like NaN, Infinity, -0
					resultValue = response.result.unserializableValue;
				} else if (response.result.type === "undefined") {
					// Handle undefined explicitly
					resultValue = undefined;
				} else if (response.result.objectId && returnByValue) {
					// Object was returned but couldn't be serialized
					resultValue = response.result.description || "[Object]";
				} else {
					resultValue = response.result.description;
				}

				return {
					success: true,
					result: resultValue,
					type: response.result.type,
					className: response.result.className,
					isPromise: response.result.subtype === "promise",
					isSerializable: returnByValue && response.result.value !== undefined,
				};
			} catch (error) {
				// Only detach debugger if we attached it
				if (needsDetach) {
					try {
						await chrome.debugger.detach({ tabId });
					} catch (e) {
						// Ignore detach errors
					}
				}
				throw error;
			}
		};

		// Try multiple approaches
		try {
			// First attempt: Use debugger API
			const result = await executeWithDebugger();
			return {
				success: true,
				tabId: tabId,
				result: result.result,
				type: result.type,
				returnByValue: returnByValue,
				isSerializable: result.isSerializable !== false,
				isPromise: result.isPromise || false,
			};
		} catch (debuggerError) {
			// Log the debugger error for debugging
			console.warn("[evaluate_js] Debugger API failed:", debuggerError.message);

			// Check if this is a file:// URL issue
			// Some operations work with file:// URLs but others don't
			if (targetTab.url.startsWith("file://")) {
				// If the error is about specific operations that don't work with file:// URLs
				if (
					debuggerError.message.includes("Cannot attach") ||
					debuggerError.message.includes(
						"Object reference chain is too long",
					) ||
					debuggerError.message.includes("Debugger is not attached")
				) {
					throw new Error(
						"This JavaScript operation cannot be executed on file:// URLs due to Chrome security restrictions. Please use a http:// or https:// URL for full evaluate_js functionality.",
					);
				}
			}

			// For other cases, throw the original error with context
			throw new Error(`JavaScript execution failed: ${debuggerError.message}`);
		}
	}

	async handleFillForm(params) {
		const { tabId, formData, submit = false, formSelector = null } = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		if (!formData || typeof formData !== "object") {
			throw new Error(
				"formData is required and must be an object with field names/values",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		console.log(
			`🔧 DEBUG handleFillForm: Filling form in tab ${tabId} with ${Object.keys(formData).length} fields`,
		);

		try {
			const results = await chrome.scripting.executeScript({
				target: { tabId: tabId },
				func: (data, shouldSubmit, formSelectorStr) => {
					try {
						let filledFields = 0;
						let form = null;
						const errors = [];
						const filled = [];

						// Helper function to set field value
						const setFieldValue = (field, value) => {
							const tagName = field.tagName.toLowerCase();
							const type = field.type?.toLowerCase();

							// Handle different input types
							if (tagName === "input") {
								if (type === "checkbox" || type === "radio") {
									// For checkboxes and radios, interpret value as boolean
									field.checked =
										value === true ||
										value === "true" ||
										value === "1" ||
										value === "on";
								} else if (type === "file") {
									// File inputs cannot be set programmatically for security reasons
									errors.push(
										`Cannot set file input: ${field.name || field.id}`,
									);
									return false;
								} else {
									// Text, email, password, number, etc.
									field.value = String(value);
								}
							} else if (tagName === "textarea") {
								field.value = String(value);
							} else if (tagName === "select") {
								// For select elements, try to match by value or text
								const options = Array.from(field.options);
								const matchByValue = options.find(
									(opt) => opt.value === String(value),
								);
								const matchByText = options.find(
									(opt) => opt.text === String(value),
								);

								if (matchByValue) {
									field.value = matchByValue.value;
								} else if (matchByText) {
									field.value = matchByText.value;
								} else {
									errors.push(
										`No matching option for select field: ${field.name || field.id} (value: ${value})`,
									);
									return false;
								}
							} else {
								errors.push(`Unsupported field type: ${tagName}`);
								return false;
							}

							// Trigger events to ensure any JavaScript handlers are fired
							field.dispatchEvent(new Event("input", { bubbles: true }));
							field.dispatchEvent(new Event("change", { bubbles: true }));

							return true;
						};

						// Find the form if selector provided
						if (formSelectorStr) {
							form = document.querySelector(formSelectorStr);
							if (!form) {
								return {
									success: false,
									error: `Form not found with selector: ${formSelectorStr}`,
								};
							}
						}

						// Fill fields
						for (const [key, value] of Object.entries(data)) {
							let field = null;

							// Try different strategies to find the field
							// 1. By name attribute
							field = (form || document).querySelector(`[name="${key}"]`);

							// 2. By id
							if (!field) {
								field = document.getElementById(key);
							}

							// 3. By data-testid
							if (!field) {
								field = (form || document).querySelector(
									`[data-testid="${key}"]`,
								);
							}

							// 4. By placeholder (for inputs/textareas)
							if (!field) {
								field = (form || document).querySelector(
									`input[placeholder*="${key}"], textarea[placeholder*="${key}"]`,
								);
							}

							// 5. By label text (find label, then associated input)
							if (!field) {
								const labels = Array.from(
									(form || document).querySelectorAll("label"),
								);
								const matchingLabel = labels.find((label) =>
									label.textContent.toLowerCase().includes(key.toLowerCase()),
								);
								if (matchingLabel) {
									// Check if label has 'for' attribute
									if (matchingLabel.htmlFor) {
										field = document.getElementById(matchingLabel.htmlFor);
									} else {
										// Check if input is inside label
										field = matchingLabel.querySelector(
											"input, textarea, select",
										);
									}
								}
							}

							if (field) {
								if (setFieldValue(field, value)) {
									filledFields++;
									filled.push({
										key: key,
										fieldName: field.name || field.id || key,
										fieldType: field.type || field.tagName.toLowerCase(),
										value: field.value,
									});

									// Track form if not already tracked
									if (!form && field.form) {
										form = field.form;
									}
								}
							} else {
								errors.push(`Field not found: ${key}`);
							}
						}

						// Submit the form if requested
						let submitted = false;
						if (shouldSubmit && form) {
							// Find submit button
							let submitButton = form.querySelector(
								'button[type="submit"], input[type="submit"]',
							);

							// If no explicit submit button, look for any button in the form
							if (!submitButton) {
								submitButton = form.querySelector("button");
							}

							if (submitButton) {
								submitButton.click();
								submitted = true;
							} else {
								// Try to submit the form directly
								form.submit();
								submitted = true;
							}
						} else if (shouldSubmit && !form) {
							errors.push("Cannot submit: no form element found");
						}

						return {
							success: filledFields > 0,
							filledFields: filledFields,
							totalFields: Object.keys(data).length,
							filled: filled,
							errors: errors,
							submitted: submitted,
							formFound: !!form,
						};
					} catch (error) {
						return {
							success: false,
							error: `Form filling failed: ${error.message}`,
						};
					}
				},
				args: [formData, submit, formSelector],
			});

			const result = results[0]?.result;

			if (!result) {
				throw new Error("No result from form filling");
			}

			if (!result.success && result.error) {
				throw new Error(result.error);
			}

			console.log(
				`✅ Filled ${result.filledFields}/${result.totalFields} fields${result.submitted ? " and submitted form" : ""}`,
			);

			return {
				success: true,
				tabId: tabId,
				filledFields: result.filledFields,
				totalFields: result.totalFields,
				filled: result.filled,
				errors: result.errors,
				submitted: result.submitted,
				formFound: result.formFound,
			};
		} catch (error) {
			console.error("Form filling failed:", error);
			throw new Error(`Form filling error: ${error.message}`);
		}
	}

	async handleGetElement(params) {
		const { selector, tabId, multiple = false } = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		if (!selector) {
			throw new Error(
				"selector is required. Provide a CSS selector to find elements.",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		console.log(
			`🔧 DEBUG handleGetElement: Finding elements with selector "${selector}" in tab ${tabId}`,
		);

		try {
			const results = await chrome.scripting.executeScript({
				target: { tabId: tabId },
				func: (selectorStr, findMultiple) => {
					try {
						// Helper function to get element details
						const getElementDetails = (element) => {
							if (!element) return null;

							// Get bounding box
							const rect = element.getBoundingClientRect();

							// Get computed styles
							const computedStyle = window.getComputedStyle(element);

							// Check visibility
							const isVisible =
								!!(
									element.offsetWidth ||
									element.offsetHeight ||
									element.getClientRects().length
								) &&
								computedStyle.display !== "none" &&
								computedStyle.visibility !== "hidden" &&
								computedStyle.opacity !== "0";

							// Get attributes
							const attributes = {};
							for (const attr of element.attributes) {
								attributes[attr.name] = attr.value;
							}

							// Build element details
							const details = {
								// Basic properties
								tagName: element.tagName.toLowerCase(),
								id: element.id || null,
								className: element.className || null,
								classList: element.classList
									? Array.from(element.classList)
									: [],

								// Content
								textContent: element.textContent?.trim() || null,
								innerHTML: element.innerHTML,
								value: element.value || null, // For form elements

								// Attributes
								attributes: attributes,
								href: element.href || null,
								src: element.src || null,
								alt: element.alt || null,

								// State
								disabled: element.disabled || false,
								checked: element.checked || false,
								selected: element.selected || false,
								readOnly: element.readOnly || false,

								// Position and dimensions
								boundingBox: {
									x: rect.x,
									y: rect.y,
									width: rect.width,
									height: rect.height,
									top: rect.top,
									right: rect.right,
									bottom: rect.bottom,
									left: rect.left,
								},

								// Visibility and interaction
								isVisible: isVisible,
								isClickable:
									isVisible &&
									(element.tagName === "BUTTON" ||
										element.tagName === "A" ||
										element.tagName === "INPUT" ||
										element.tagName === "SELECT" ||
										element.tagName === "TEXTAREA" ||
										element.onclick !== null ||
										element.hasAttribute("role") ||
										computedStyle.cursor === "pointer"),

								// Styles
								computedStyle: {
									display: computedStyle.display,
									visibility: computedStyle.visibility,
									opacity: computedStyle.opacity,
									color: computedStyle.color,
									backgroundColor: computedStyle.backgroundColor,
									fontSize: computedStyle.fontSize,
									fontWeight: computedStyle.fontWeight,
									cursor: computedStyle.cursor,
									position: computedStyle.position,
									zIndex: computedStyle.zIndex,
								},

								// Parent/child info
								parentTagName:
									element.parentElement?.tagName.toLowerCase() || null,
								childrenCount: element.children.length,

								// Form-specific properties
								type: element.type || null,
								name: element.name || null,
								placeholder: element.placeholder || null,
								required: element.required || false,
								pattern: element.pattern || null,
								min: element.min || null,
								max: element.max || null,
								step: element.step || null,

								// ARIA properties
								role: element.getAttribute("role"),
								ariaLabel: element.getAttribute("aria-label"),
								ariaDescribedBy: element.getAttribute("aria-describedby"),
								ariaLabelledBy: element.getAttribute("aria-labelledby"),

								// Data attributes
								dataAttributes: Object.fromEntries(
									Array.from(element.attributes)
										.filter((attr) => attr.name.startsWith("data-"))
										.map((attr) => [attr.name.substring(5), attr.value]),
								),
							};

							// For select elements, get options
							if (element.tagName === "SELECT") {
								details.options = Array.from(element.options).map((opt) => ({
									value: opt.value,
									text: opt.text,
									selected: opt.selected,
								}));
							}

							return details;
						};

						// Find element(s)
						if (findMultiple) {
							const elements = document.querySelectorAll(selectorStr);
							return {
								success: true,
								found: elements.length,
								elements: Array.from(elements).map(getElementDetails),
							};
						}
						const element = document.querySelector(selectorStr);
						if (!element) {
							return {
								success: false,
								error: `No element found with selector: ${selectorStr}`,
							};
						}
						return {
							success: true,
							found: 1,
							element: getElementDetails(element),
						};
					} catch (error) {
						return {
							success: false,
							error: `Failed to find element: ${error.message}`,
						};
					}
				},
				args: [selector, multiple],
			});

			const result = results[0]?.result;

			if (!result) {
				throw new Error("No result from element search");
			}

			if (!result.success) {
				throw new Error(result.error);
			}

			console.log(
				`✅ Found ${result.found} element(s) with selector "${selector}"`,
			);

			return {
				success: true,
				selector: selector,
				tabId: tabId,
				found: result.found,
				...(multiple
					? { elements: result.elements }
					: { element: result.element }),
			};
		} catch (error) {
			console.error("Element search failed:", error);
			throw new Error(`Element search error: ${error.message}`);
		}
	}

	async handleGetSimplifiedDOM(params) {
		const {
			tabId,
			format = "markdown",
			enableDetailedResponse = false,
			includeSelectors = true,
		} = params;

		if (!tabId) {
			throw new Error(
				"tabId is required. Use list_tabs to see available tabs or create_tab to create a new one.",
			);
		}

		// Get the specified tab
		let targetTab;
		try {
			targetTab = await chrome.tabs.get(tabId);
		} catch (error) {
			throw new Error(`Tab ${tabId} not found: ${error.message}`);
		}

		// Check if tab is accessible
		if (
			targetTab.url.startsWith("chrome://") ||
			targetTab.url.startsWith("chrome-extension://")
		) {
			throw new Error(
				`Cannot access chrome:// URL: ${targetTab.url}. Use a regular webpage tab.`,
			);
		}

		console.log(
			`🔧 DEBUG handleGetSimplifiedDOM: Extracting ${format} from tab ${tabId} - "${targetTab.title}"`,
		);

		try {
			// First inject the appropriate library
			await chrome.scripting.executeScript({
				target: { tabId: tabId },
				files: format === "html" ? ["readability.js"] : ["turndown.js"],
			});

			// Now execute the extraction
			const results = await chrome.scripting.executeScript({
				target: { tabId: tabId },
				func: (options) => {
					const {
						format = "markdown",
						enableDetailedResponse = false,
						includeSelectors = true,
					} = options;

					try {
						console.log(`🔧 BROP: Starting ${format} extraction`);

						if (format === "html") {
							// HTML format: use Readability only
							if (typeof window.Readability === "undefined") {
								throw new Error("Readability library not loaded");
							}

							// Clean document clone for processing
							const documentClone = document.cloneNode(true);
							for (const item of documentClone.querySelectorAll("script")) {
								item.remove();
							}
							for (const item of documentClone.querySelectorAll("style")) {
								item.remove();
							}
							for (const item of documentClone.querySelectorAll("iframe")) {
								item.remove();
							}
							for (const item of documentClone.querySelectorAll("noscript")) {
								item.remove();
							}

							let content;
							let stats;

							if (enableDetailedResponse) {
								// Use full document content
								content = documentClone.body
									? documentClone.body.innerHTML
									: documentClone.documentElement.innerHTML;
								stats = {
									source: "full_document_html",
									processed: true,
									cleaned: true,
								};
							} else {
								// Use Readability to extract article content
								const reader = new window.Readability(documentClone, {
									charThreshold: 0,
									keepClasses: true,
									nbTopCandidates: 500,
								});

								const article = reader.parse();

								if (!article || !article.content) {
									throw new Error("No readable content found by Readability");
								}

								content = article.content;
								stats = {
									source: "readability_html",
									title: article.title,
									byline: article.byline,
									excerpt: article.excerpt,
									readTime: article.readTime || 0,
									textLength: article.textContent?.length || 0,
									processed: true,
								};
							}

							return {
								html: content,
								title: document.title,
								url: window.location.href,
								timestamp: new Date().toISOString(),
								stats: stats,
							};
						}

						// Markdown format: use Turndown
						console.log("Checking for Turndown library...");

						// The library should expose TurndownService globally
						if (!window.TurndownService) {
							throw new Error(
								"Turndown library not loaded (TurndownService not found)",
							);
						}

						// Initialize Turndown with options
						const turndownService = new window.TurndownService({
							headingStyle: "atx",
							codeBlockStyle: "fenced",
							emDelimiter: "_",
							strongDelimiter: "**",
							linkStyle: "inlined",
							preformattedCode: true,
						});

						// Add custom rules if needed
						turndownService.remove(["script", "style", "noscript"]);

						// Add CSS selector extraction and element types if enabled
						if (includeSelectors) {
							// Add custom rule for form boundaries
							turndownService.addRule("formBoundaries", {
								filter: (node) => {
									return (
										node.getAttribute &&
										(node.getAttribute("data-form-start") === "true" ||
											node.getAttribute("data-form-end") === "true")
									);
								},
								replacement: (content, node) => {
									if (node.getAttribute("data-form-start") === "true") {
										const selector = node.getAttribute("data-form-selector");
										return `\n<!-- form-start${selector ? `: ${selector}` : ""} -->\n`;
									}
									return "\n<!-- form-end -->\n";
								},
							});

							// Add CSS selector extraction for actionable elements
							turndownService.addRule("addSelectors", {
								filter: (node) => {
									// Only process actionable elements
									return (
										[
											"BUTTON",
											"A",
											"INPUT",
											"SELECT",
											"TEXTAREA",
											"LABEL",
										].includes(node.nodeName) ||
										node.onclick !== null ||
										node.hasAttribute("role") ||
										(node.style && node.style.cursor === "pointer") ||
										node.hasAttribute("tabindex")
									);
								},
								replacement: (content, node) => {
									// Get the most reliable selector for the element
									let selector = "";

									// Priority 1: ID
									if (node.id) {
										selector = `#${node.id}`;
									}
									// Priority 2: aria-label
									else if (node.getAttribute("aria-label")) {
										selector = `[aria-label="${node.getAttribute("aria-label")}"]`;
									}
									// Priority 3: data-testid
									else if (node.getAttribute("data-testid")) {
										selector = `[data-testid="${node.getAttribute("data-testid")}"]`;
									}
									// Priority 4: name attribute (for form elements)
									else if (node.name) {
										selector = `[name="${node.name}"]`;
									}
									// Priority 5: First meaningful class
									else if (node.className) {
										const classes = node.className
											.split(" ")
											.filter(
												(c) =>
													c &&
													!c.startsWith("css-") &&
													!c.match(/^[a-z0-9]{8,}$/i),
											); // Filter out CSS modules and hash classes
										if (classes.length) {
											selector = `.${classes[0]}`;
										}
									}

									// Fallback: Create a text-based selector
									if (!selector) {
										const text = node.textContent.trim().substring(0, 30);
										if (text) {
											selector = `${node.tagName.toLowerCase()}:contains("${text.replace(/"/g, '\\"')}")`;
										} else {
											// Last resort: nth-child selector
											const parent = node.parentElement;
											if (parent) {
												const index =
													Array.from(parent.children).indexOf(node) + 1;
												selector = `${node.tagName.toLowerCase()}:nth-child(${index})`;
											}
										}
									}

									// Determine element type
									let elementType = "";
									if (node.tagName === "A") {
										elementType = "link";
									} else if (node.tagName === "BUTTON") {
										elementType = "button";
									} else if (node.tagName === "INPUT") {
										elementType = node.type || "input";
									} else if (node.tagName === "TEXTAREA") {
										elementType = "textarea";
									} else if (node.tagName === "SELECT") {
										elementType = node.multiple
											? "select-multiple"
											: "select-one";
									} else if (node.tagName === "LABEL") {
										elementType = "label";
									} else if (node.onclick || node.hasAttribute("role")) {
										elementType = node.getAttribute("role") || "clickable";
									} else {
										elementType = node.tagName.toLowerCase();
									}

									// Format the output based on element type
									if (node.tagName === "A" && node.href) {
										// For links, preserve the standard markdown format with selector and type
										return `[${content}](${node.href})<!--${elementType}:${selector}-->`;
									}
									if (
										node.tagName === "BUTTON" ||
										node.onclick ||
										node.hasAttribute("role")
									) {
										// For buttons and clickable elements
										return `[${content}]<!--${elementType}:${selector}-->`;
									}
									if (["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)) {
										// For form elements, include the type in the text
										const inputType = node.type || node.tagName.toLowerCase();
										const displayContent =
											content || node.placeholder || node.value || "input";

										// For checkboxes and radios, show their label or value
										if (inputType === "checkbox" || inputType === "radio") {
											const label =
												node.labels?.[0]?.textContent ||
												content ||
												node.value ||
												inputType;
											return `[${label}]<!--${elementType}:${selector}-->`;
										}

										// For select elements, show options
										if (node.tagName === "SELECT") {
											const options = Array.from(node.options)
												.map((opt) => opt.text)
												.slice(0, 3)
												.join(", ");
											const more = node.options.length > 3 ? "..." : "";
											return `[${elementType}: ${options}${more}]<!--${elementType}:${selector}-->`;
										}

										return `[${inputType}: ${displayContent}]<!--${elementType}:${selector}-->`;
									}

									// Default format with element type
									return `${content}<!--${elementType}:${selector}-->`;
								},
							});
						}

						let contentElement;
						let contentHtml;

						if (enableDetailedResponse) {
							// Use full document body
							contentElement = document.body || document.documentElement;
						} else {
							// Try to find main content area
							contentElement =
								document.querySelector("main") ||
								document.querySelector("article") ||
								document.querySelector(".content") ||
								document.querySelector("#content") ||
								document.body ||
								document.documentElement;
						}

						// Pre-process forms if selectors are enabled
						if (includeSelectors) {
							// Clone the content element to avoid modifying the actual DOM
							const clonedElement = contentElement.cloneNode(true);

							// Mark all forms with boundaries
							const forms = clonedElement.querySelectorAll("form");
							forms.forEach((form, index) => {
								// Generate form selector
								let formSelector = "";
								if (form.id) {
									formSelector = `#${form.id}`;
								} else if (form.className) {
									const classes = form.className
										.split(" ")
										.filter(
											(c) =>
												c &&
												!c.startsWith("css-") &&
												!c.match(/^[a-z0-9]{8,}$/i),
										);
									if (classes.length) {
										formSelector = `.${classes[0]}`;
									}
								} else if (form.name) {
									formSelector = `[name="${form.name}"]`;
								} else {
									formSelector = `form:nth-of-type(${index + 1})`;
								}

								// Add markers before and after form
								const formStart = document.createElement("div");
								formStart.setAttribute("data-form-start", "true");
								formStart.setAttribute("data-form-selector", formSelector);
								formStart.style.display = "none";
								form.insertBefore(formStart, form.firstChild);

								const formEnd = document.createElement("div");
								formEnd.setAttribute("data-form-end", "true");
								formEnd.style.display = "none";
								form.appendChild(formEnd);
							});

							contentHtml = clonedElement.innerHTML;
						} else {
							contentHtml = contentElement.innerHTML;
						}

						// Convert HTML to Markdown using Turndown
						const markdown = turndownService.turndown(contentHtml);

						return {
							markdown: markdown,
							title: document.title,
							url: window.location.href,
							timestamp: new Date().toISOString(),
							stats: {
								source: enableDetailedResponse
									? "turndown_full"
									: "turndown_main",
								markdownLength: markdown.length,
								processed: true,
							},
						};
					} catch (processingError) {
						console.error("🔧 BROP: Processing error:", processingError);
						return {
							error: `Content processing failed: ${processingError.message}`,
							title: document.title || "Unknown",
							url: window.location.href || "Unknown",
						};
					}
				},
				args: [{ format, enableDetailedResponse, includeSelectors }],
			});

			console.log("🔧 DEBUG: executeScript completed, raw results:", results);

			const result = results[0]?.result;

			console.log("🔧 DEBUG handleGetSimplifiedDOM: executeScript results:", {
				resultsLength: results?.length,
				hasResult: !!result,
				resultType: typeof result,
				resultKeys: result ? Object.keys(result) : "none",
			});

			if (!result) {
				throw new Error("No result from content extraction");
			}

			if (result.error) {
				throw new Error(result.error);
			}

			console.log(
				`✅ Successfully extracted ${format === "html" ? result.html?.length : result.markdown?.length} chars of ${format} from "${result.title}"`,
			);

			return {
				...(format === "html"
					? { html: result.html }
					: { markdown: result.markdown }),
				title: result.title,
				url: result.url,
				timestamp: result.timestamp,
				stats: result.stats,
				tabId: tabId,
				format: format,
			};
		} catch (error) {
			console.error("Content extraction failed:", error);
			throw new Error(`Content extraction error: ${error.message}`);
		}
	}

	// Tab Management Methods
	async handleCreateTab(params) {
		const { url = "about:blank", active = true } = params;

		try {
			const newTab = await chrome.tabs.create({
				url: url,
				active: active,
			});

			// Wait a moment for tab to initialize
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Get updated tab info
			const tabInfo = await chrome.tabs.get(newTab.id);

			// Ensure content script is injected
			if (
				tabInfo.url &&
				!tabInfo.url.startsWith("chrome://") &&
				!tabInfo.url.startsWith("chrome-extension://")
			) {
				try {
					await chrome.scripting.executeScript({
						target: { tabId: tabInfo.id },
						files: ["content.js"],
					});
					console.log(`✅ Content script injected into new tab ${tabInfo.id}`);
				} catch (error) {
					console.log(
						`⚠️ Could not inject content script into new tab ${tabInfo.id}:`,
						error.message,
					);
				}
			}

			console.log(
				`✅ Created new tab: ${newTab.id} - "${tabInfo.title}" - ${tabInfo.url}`,
			);

			return {
				success: true,
				tabId: tabInfo.id,
				url: tabInfo.url,
				title: tabInfo.title,
				active: tabInfo.active,
				status: tabInfo.status,
			};
		} catch (error) {
			console.error("Failed to create tab:", error);
			throw new Error(`Tab creation failed: ${error.message}`);
		}
	}

	async handleCloseTab(params) {
		const { tabId } = params;

		if (!tabId) {
			throw new Error("tabId is required for close_tab");
		}

		try {
			await chrome.tabs.remove(tabId);
			console.log(`✅ Closed tab: ${tabId}`);

			return {
				success: true,
				tabId: tabId,
				action: "closed",
			};
		} catch (error) {
			console.error(`Failed to close tab ${tabId}:`, error);
			throw new Error(`Tab close failed: ${error.message}`);
		}
	}

	async handleListTabs(params) {
		const { include_content = false } = params;

		try {
			const allTabs = await chrome.tabs.query({});

			const tabList = allTabs.map((tab) => ({
				tabId: tab.id,
				url: tab.url,
				title: tab.title,
				active: tab.active,
				status: tab.status,
				windowId: tab.windowId,
				index: tab.index,
				pinned: tab.pinned,
				accessible:
					(!tab.url.startsWith("chrome://") &&
						!tab.url.startsWith("chrome-extension://") &&
						!tab.url.startsWith("edge://") &&
						!tab.url.startsWith("about:")) ||
					tab.url === "about:blank",
			}));

			// Get active tab
			const [activeTab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			console.log(
				`📋 Listed ${tabList.length} tabs (active: ${activeTab?.id || "none"})`,
			);

			return {
				success: true,
				tabs: tabList,
				activeTabId: activeTab?.id || null,
				totalTabs: tabList.length,
				accessibleTabs: tabList.filter((tab) => tab.accessible).length,
			};
		} catch (error) {
			console.error("Failed to list tabs:", error);
			throw new Error(`Tab listing failed: ${error.message}`);
		}
	}

	async handleActivateTab(params) {
		const { tabId } = params;

		if (!tabId) {
			throw new Error("tabId is required for activate_tab");
		}

		try {
			// Get tab info first
			const tab = await chrome.tabs.get(tabId);

			// Activate the tab
			await chrome.tabs.update(tabId, { active: true });

			// Also focus the window containing the tab
			await chrome.windows.update(tab.windowId, { focused: true });

			console.log(`✅ Activated tab: ${tabId} - "${tab.title}"`);

			return {
				success: true,
				tabId: tabId,
				url: tab.url,
				title: tab.title,
				action: "activated",
			};
		} catch (error) {
			console.error(`Failed to activate tab ${tabId}:`, error);
			throw new Error(`Tab activation failed: ${error.message}`);
		}
	}

	async handleGetServerStatus(params) {
		try {
			console.log("📊 Getting server status...");

			// This command will be handled directly by the bridge server
			// and won't come back to the extension, but we need this handler
			// in case someone calls it directly through the extension
			return {
				success: true,
				message: "Server status request forwarded to bridge",
				note: "This command is handled by the bridge server directly",
			};
		} catch (error) {
			console.error("Failed to get server status:", error);
			throw new Error(`Server status request failed: ${error.message}`);
		}
	}

	async handleGetExtensionVersion(params) {
		try {
			console.log("🔢 Getting extension version...");

			const manifest = chrome.runtime.getManifest();
			return {
				success: true,
				result: {
					extension_version: manifest.version,
					extension_name: manifest.name,
					target_event_blocking_active: true, // Indicates our Target.attachedToTarget fix is active
					manifest_version: manifest.manifest_version,
					timestamp: Date.now(),
				},
			};
		} catch (error) {
			console.error("Failed to get extension version:", error);
			throw new Error(`Extension version request failed: ${error.message}`);
		}
	}

	async handleGetExtensionErrors(params) {
		const limit = params?.limit || 50;
		const errors = this.extensionErrors.slice(0, limit);

		return {
			errors: errors,
			total_errors: this.extensionErrors.length,
			max_stored: this.maxErrorEntries,
			extension_info: {
				name: chrome.runtime.getManifest()?.name || "BROP Extension",
				version: chrome.runtime.getManifest()?.version || "1.0.0",
				id: chrome.runtime.id,
			},
		};
	}

	async handleClearExtensionErrors(params) {
		const clearedCount = this.extensionErrors.length;

		// Clear all extension errors
		this.extensionErrors = [];

		// Also clear call logs if requested
		if (params?.clearLogs) {
			const clearedLogs = this.callLogs.length;
			this.callLogs = [];

			// Save cleared state
			await this.saveSettings();

			return {
				success: true,
				cleared_errors: clearedCount,
				cleared_logs: clearedLogs,
				message: `Cleared ${clearedCount} errors and ${clearedLogs} logs`,
			};
		}
		// Save cleared state
		await this.saveSettings();

		return {
			success: true,
			cleared_errors: clearedCount,
			message: `Cleared ${clearedCount} extension errors`,
		};
	}

	async handleReloadExtension(params) {
		const reloadReason = params?.reason || "Manual reload requested";
		const delay = params?.delay || 1000; // Default 1 second delay

		try {
			// Log the reload event
			this.logError(
				"Extension Reload",
				`Extension reload requested: ${reloadReason}`,
				null,
				{
					reason: reloadReason,
					delay: delay,
					timestamp: Date.now(),
				},
			);

			// Save current state before reload
			await this.saveSettings();

			// Schedule the reload
			setTimeout(() => {
				console.log(`[BROP] Reloading extension: ${reloadReason}`);
				chrome.runtime.reload();
			}, delay);

			return {
				success: true,
				message: `Extension will reload in ${delay}ms`,
				reason: reloadReason,
				scheduled_time: Date.now() + delay,
			};
		} catch (error) {
			this.logError(
				"Extension Reload Error",
				`Failed to reload extension: ${error.message}`,
				error.stack,
			);

			return {
				success: false,
				error: error.message,
				message: "Failed to schedule extension reload",
			};
		}
	}

	logCall(method, type, params, result, error, duration) {
		// Fix undefined/null method names
		const safeMethod = method || "unknown_method";
		const safeType = type || "unknown_type";

		const logEntry = {
			id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: Date.now(),
			method: safeMethod,
			type: safeType,
			params: params ? JSON.stringify(params) : "{}",
			result: result ? JSON.stringify(result) : undefined,
			error: error,
			success: !error,
			duration: duration,
		};

		// Debug logging for undefined methods
		if (!method) {
			console.warn("🔧 WARNING: logCall received undefined method:", {
				originalMethod: method,
				safeMethod: safeMethod,
				type: type,
				hasParams: !!params,
				hasResult: !!result,
				hasError: !!error,
			});
		}

		this.callLogs.unshift(logEntry);
		if (this.callLogs.length > this.maxLogEntries) {
			this.callLogs = this.callLogs.slice(0, this.maxLogEntries);
		}

		this.saveSettings();
	}
}

// Export for use in background scripts
if (typeof module !== "undefined" && module.exports) {
	module.exports = BROPServer;
} else {
	self.BROPServer = BROPServer;
}
