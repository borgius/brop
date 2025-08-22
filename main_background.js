// Browser Remote Operations Protocol - Main Background Script
// Clean multiplexing architecture with delegated servers:
// 1. BROP commands → BROPServer (extension APIs)
// 2. CDP commands → CDPServer (real Chrome forwarding)

// Import the BROP and CDP servers
importScripts("brop_server.js");
importScripts("cdp_server.js");

class MainBackground {
	constructor() {
		this.bridgeSocket = null;
		this.reconnectAttempts = 0;
		this.reconnectTimer = null;
		this.lastReconnectAttempt = 0;
		this.connectionStatus = "disconnected";
		this.isConnected = false;
		this.isConnecting = false;
		this.enabled = true;
		this.pingInterval = null;
		this.lastPongTime = Date.now();
		
		
		// Memory cleanup intervals
		this.cleanupInterval = null;
		this.memoryMonitorInterval = null;
		this.healthMonitorInterval = null;

		this.bridgeUrl = "ws://localhost:9224"; // Extension server port

		// Initialize BROP server for native commands
		this.bropServer = new BROPServer();
		console.log("🔧 BROP Server initialized for native commands");

		// Initialize CDP server for CDP commands
		this.cdpServer = new CDPServer();
		console.log("🎭 CDP Server initialized for CDP commands");

		// Set up CDP event forwarding
		this.cdpServer.setEventCallback((event) => {
			this.forwardCDPEvent(event);
		});

		this.setupErrorHandlers();
		this.setupPopupMessageHandler();
		this.setupOptimizedKeepalive();
		this.setupTabHandlers();
		this.setupMemoryManagement();
		this.monitorHealth();
		this.connectToBridge();
	}

	forwardCDPEvent(event) {
		// Log CDP event to BROP server logs
		if (this.bropServer && event.method) {
			this.bropServer.logCall(
				event.method,
				"CDP_EVENT",
				event.params,
				null, // Events don't have results
				null, // No error for events
				0, // Events are instant
			);
		}

		// Forward CDP events from real Chrome to bridge clients
		if (this.isConnected && this.bridgeSocket) {
			try {
				this.bridgeSocket.send(JSON.stringify(event));
				console.log(`🎭 Forwarded CDP event: ${event.method}`);
			} catch (error) {
				console.error("Error forwarding CDP event:", error);
			}
		}
	}

	setupErrorHandlers() {
		// Enhanced error capture system - delegate to BROP server
		self.addEventListener("error", (event) => {
			if (this.bropServer) {
				this.bropServer.logError(
					"Uncaught Error",
					event.error?.message || event.message,
					event.error?.stack,
				);
			}
		});

		self.addEventListener("unhandledrejection", (event) => {
			if (this.bropServer) {
				this.bropServer.logError(
					"Unhandled Promise Rejection",
					event.reason?.message || String(event.reason),
					event.reason?.stack,
				);
			}
		});
	}

	setupPopupMessageHandler() {
		// Handle messages from popup and other extension components
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			console.log("📨 Popup message received:", message.type);

			const handleAsync = async () => {
				try {
					switch (message.type) {
						case "GET_STATUS":
							return this.getStatus();

						case "SET_ENABLED":
							return await this.setEnabled(message.enabled);

						case "GET_SERVER_STATUS":
							return await this.getServerStatus();

						case "GET_LOGS":
							return this.getLogs(message.limit);

						case "CLEAR_LOGS":
							return await this.clearLogs();

						default:
							throw new Error(`Unknown popup message type: ${message.type}`);
					}
				} catch (error) {
					console.error(`Error handling popup message ${message.type}:`, error);
					return {
						success: false,
						error: error.message,
					};
				}
			};

			// Handle async messages
			handleAsync().then((response) => {
				sendResponse(response);
			});

			return true; // Keep message channel open for async response
		});
	}

	getStatus() {
		return {
			connected: this.isConnected,
			enabled: this.enabled,
			connectionStatus: this.connectionStatus,
			reconnectAttempts: this.reconnectAttempts,
			totalLogs: this.bropServer?.callLogs?.length || 0,
			debuggerAttached: this.cdpServer?.isAttached || false,
			activeSessions: this.isConnected ? 1 : 0,
			controlledTabs: 0, // Will be populated from tab query if needed
		};
	}

	async setEnabled(enabled) {
		this.enabled = enabled;
		if (this.bropServer) {
			this.bropServer.enabled = enabled;
			await this.bropServer.saveSettings();
		}

		console.log(`🔧 BROP service ${enabled ? "enabled" : "disabled"}`);

		return {
			success: true,
			enabled: this.enabled,
			message: `BROP service ${enabled ? "enabled" : "disabled"}`,
		};
	}

	async getServerStatus() {
		// This should query the bridge server for its status
		// For now, return extension status
		return {
			success: true,
			result: {
				connected_clients: {
					total_active_sessions: this.isConnected ? 1 : 0,
				},
				bridge_connected: this.isConnected,
				extension_status: this.getStatus(),
			},
		};
	}

	getLogs(limit = 100) {
		const logs = this.bropServer?.callLogs || [];
		return {
			success: true,
			logs: logs.slice(-limit),
		};
	}

	async clearLogs() {
		if (this.bropServer) {
			this.bropServer.callLogs = [];
			await this.bropServer.saveSettings();
		}

		return {
			success: true,
			message: "Logs cleared successfully",
		};
	}

	logError(type, message, stack = null) {
		// Delegate to BROP server for consistent error handling
		if (this.bropServer) {
			this.bropServer.logError(type, message, stack);
		} else {
			console.error(
				`[BROP Error] ${type}: ${message}`,
				stack ? `\nStack: ${stack}` : "",
			);
		}
	}

	async connectToBridge() {
		// Prevent multiple simultaneous connection attempts
		if (this.isConnecting) {
			console.log("🔄 Connection already in progress, skipping...");
			return;
		}

		// Check if already connected
		if (this.isConnected && this.bridgeSocket && 
			this.bridgeSocket.readyState === WebSocket.OPEN) {
			console.log("✅ Already connected to bridge, skipping...");
			return;
		}

		// Clean up any existing socket
		if (this.bridgeSocket) {
			try {
				this.bridgeSocket.close();
			} catch (e) {
				// Ignore errors when closing
			}
			this.bridgeSocket = null;
		}

		this.isConnecting = true;

		try {
			console.log("🔗 Connecting to multiplexed bridge server...");
			this.bridgeSocket = new WebSocket(this.bridgeUrl);

			this.bridgeSocket.onopen = () => {
				console.log("✅ Connected to multiplexed bridge server");
				this.isConnected = true;
				this.isConnecting = false;
				this.connectionStatus = "connected";
				this.reconnectAttempts = 0;
				this.lastPongTime = Date.now();
				this.startKeepalive();
			};

			this.bridgeSocket.onmessage = (event) => {
				this.handleBridgeMessage(event.data);
			};

			this.bridgeSocket.onclose = () => {
				console.log("🔌 Bridge connection closed");
				this.isConnected = false;
				this.isConnecting = false;
				this.connectionStatus = "disconnected";
				this.stopKeepalive();
				this.scheduleReconnect();
			};

			this.bridgeSocket.onerror = (error) => {
				console.error("❌ Bridge connection error:", error);
				this.isConnected = false;
				this.isConnecting = false;
				this.connectionStatus = "disconnected";
			};
		} catch (error) {
			console.error("Failed to connect to bridge:", error);
			this.isConnecting = false;
			this.scheduleReconnect();
		}
	}

	// CDP connection is now handled by CDPServer

	scheduleReconnect() {
		// Clear any existing reconnect timer
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.reconnectAttempts < 10) {
			this.reconnectAttempts++;
			const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
			console.log(
				`🔄 Reconnecting to bridge in ${delay}ms (attempt ${this.reconnectAttempts})`,
			);
			this.reconnectTimer = setTimeout(() => {
				this.reconnectTimer = null;
				this.connectToBridge();
			}, delay);
		}
	}

	async handleBridgeMessage(data) {
		try {
			const message = JSON.parse(data);
			const messageType = message.type;

			console.log("📥 Bridge message type:", messageType);

			if (messageType === "welcome") {
				console.log("👋 Bridge welcome:", message.message);
				return;
			}

			if (messageType === "pong") {
				this.lastPongTime = Date.now();
				return;
			}

			if (messageType === "brop_command") {
				// Native BROP command - handle via extension APIs
				await this.processBROPNativeCommand(message);
			} else if (messageType === "BROP_CDP") {
				// Wrapped CDP command - forward to real Chrome
				await this.processBROPCDPCommand(message);
			} else {
				console.warn("Unknown message type from bridge:", messageType);
			}
		} catch (error) {
			console.error("Error handling bridge message:", error);
		}
	}

	async processBROPNativeCommand(message) {
		const { id, method, params } = message;

		console.log("🔧 Processing BROP native command via BROPServer:", method);

		if (!this.enabled) {
			this.sendToBridge({
				type: "response",
				id: id,
				success: false,
				error: "BROP service is disabled",
			});
			return;
		}

		try {
			// Use the BROP server to process the command
			const result = await this.bropServer.processBROPCommand(message);

			this.sendToBridge({
				type: "response",
				id: id,
				success: true,
				result: result,
			});
		} catch (error) {
			console.error(`BROP command error (${method}):`, error);
			this.logError(
				"BROP Command Error",
				`${method}: ${error.message}`,
				error.stack,
			);

			this.sendToBridge({
				type: "response",
				id: id,
				success: false,
				error: error.message,
			});
		}
	}

	async processBROPCDPCommand(message) {
		console.log(
			"🎭 Processing wrapped CDP command via CDP Server",
			message.method,
		);
		console.log("🎭 Full CDP message:", message);

		// Log CDP command to BROP server logs
		if (this.bropServer) {
			this.bropServer.logCall(
				message.method || "unknown_cdp_method",
				"CDP",
				message.params,
				null, // Result will be logged when response comes
				null, // No error yet
				null, // Duration will be calculated later
			);
		}

		try {
			// Use the CDP server to process the command
			await this.cdpServer.processCDPCommand(message, (response) => {
				console.log("🎭 CDP command response:", response);

				// Log CDP response to BROP server logs
				if (this.bropServer && response.type === "response") {
					// Find the original log entry and update it
					const logs = this.bropServer.callLogs;
					const logEntry = logs.find(
						(log) =>
							log.method === message.method &&
							!log.result &&
							!log.error &&
							log.type === "CDP",
					);

					if (logEntry) {
						// Update the existing entry with result/error
						if (response.error) {
							logEntry.error = JSON.stringify(response.error);
							logEntry.success = false;
						} else {
							logEntry.result = JSON.stringify(response.result);
							logEntry.success = true;
						}
						logEntry.duration = Date.now() - logEntry.timestamp;

						// Save updated logs
						this.bropServer.saveSettings();
					}
				}

				this.sendToBridge(response);
			});
		} catch (error) {
			console.error("🎭 Error in processBROPCDPCommand:", error);

			// Log CDP error to BROP server logs
			if (this.bropServer) {
				const logs = this.bropServer.callLogs;
				const logEntry = logs.find(
					(log) =>
						log.method === message.method &&
						!log.result &&
						!log.error &&
						log.type === "CDP",
				);

				if (logEntry) {
					logEntry.error = error.message;
					logEntry.success = false;
					logEntry.duration = Date.now() - logEntry.timestamp;
					this.bropServer.saveSettings();
				}
			}

			this.sendToBridge({
				type: "response",
				id: message.id,
				error: {
					code: -32603,
					message: `CDP processing failed: ${error.message}`,
				},
			});
		}
	}

	// CDP message handling is now delegated to CDPServer
	// No need for handleRealChromeMessage or handleCDPFallback methods

	sendToBridge(message) {
		if (
			this.isConnected &&
			this.bridgeSocket &&
			this.bridgeSocket.readyState === WebSocket.OPEN
		) {
			this.bridgeSocket.send(JSON.stringify(message));
		} else {
			console.error("Cannot send to bridge: not connected");
		}
	}

	startKeepalive() {
		console.log("🏓 Starting keepalive ping/pong mechanism");

		// Clear any existing interval
		this.stopKeepalive();

		// Send ping every 5 seconds
		this.pingInterval = setInterval(() => {
			if (this.isConnected && this.bridgeSocket) {
				// Check if we received a pong recently (within 15 seconds)
				const timeSinceLastPong = Date.now() - this.lastPongTime;
				if (timeSinceLastPong > 15000) {
					console.warn("⚠️ No pong received for 15 seconds, reconnecting...");
					this.bridgeSocket.close();
					return;
				}

				// Send ping
				this.sendToBridge({ type: "ping", timestamp: Date.now() });
			}
		}, 5000);
	}

	stopKeepalive() {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
			console.log("🏓 Stopped keepalive ping/pong");
		}
	}

	setupStorageKeepalive() {
		console.log("💾 Setting up keepalive mechanisms");

		// Optimized keepalive strategies (removed storage heartbeat)
		this.setupAlarmKeepAlive();
		this.setupTabKeepAlive();
	}


	setupTabHandlers() {
		// Ensure content scripts are injected when tabs are updated
		chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
			if (
				changeInfo.status === "complete" &&
				tab.url &&
				!tab.url.startsWith("chrome://") &&
				!tab.url.startsWith("chrome-extension://") &&
				!tab.url.startsWith("devtools://")
			) {
				// Try to inject content script programmatically
				try {
					await chrome.scripting.executeScript({
						target: { tabId: tabId },
						files: ["content.js"],
					});
					console.log(`✅ Content script injected into tab ${tabId}`);
				} catch (error) {
					// This might fail if content script is already injected or page doesn't allow it
					console.log(
						`⚠️ Could not inject content script into tab ${tabId}:`,
						error.message,
					);
				}
			}
		});

		// Also inject into existing tabs when extension starts
		this.injectIntoExistingTabs();
	}

	async injectIntoExistingTabs() {
		try {
			const tabs = await chrome.tabs.query({});
			for (const tab of tabs) {
				if (
					tab.url &&
					!tab.url.startsWith("chrome://") &&
					!tab.url.startsWith("chrome-extension://") &&
					!tab.url.startsWith("devtools://")
				) {
					try {
						await chrome.scripting.executeScript({
							target: { tabId: tab.id },
							files: ["content.js"],
						});
						console.log(
							`✅ Content script injected into existing tab ${tab.id}`,
						);
					} catch (error) {
						// Ignore errors for tabs where injection fails
					}
				}
			}
		} catch (error) {
			console.error("Error injecting into existing tabs:", error);
		}
	}


	setupAlarmKeepAlive() {
		// Use Chrome alarms API for reliable background execution
		try {
			// Clear any existing alarms
			chrome.alarms.clear("brop-keepalive");

			// Create alarm that fires every 2 minutes
			chrome.alarms.create("brop-keepalive", {
				delayInMinutes: 0.5, // Start in 30 seconds
				periodInMinutes: 2, // Repeat every 2 minutes
			});

			// Listen for alarm events
			chrome.alarms.onAlarm.addListener((alarm) => {
				if (alarm.name === "brop-keepalive") {
					console.log("⏰ Alarm keepalive triggered");
					this.handleAlarmKeepAlive();
				}
			});

			console.log("⏰ Alarm-based keepalive configured");
		} catch (error) {
			console.error("Error setting up alarm keepalive:", error);
		}
	}

	async handleAlarmKeepAlive() {
		try {
			// Update storage to show alarm is working
			await chrome.storage.local.set({
				lastAlarmKeepalive: Date.now(),
				alarmKeepaliveCount: (await this.getAlarmCount()) + 1,
			});

			// Check connection and try to reconnect if needed
			if (!this.isConnected) {
				console.log("🔄 Alarm-triggered reconnection attempt");
				this.connectToBridge();
			}

			// Restart other keepalive mechanisms if they seem to have stopped
			if (!this.pingInterval) {
				console.log("🔄 Restarting ping interval from alarm");
				this.startKeepalive();
			}
		} catch (error) {
			console.error("Error in alarm keepalive handler:", error);
		}
	}

	async getAlarmCount() {
		try {
			const result = await chrome.storage.local.get(["alarmKeepaliveCount"]);
			return result.alarmKeepaliveCount || 0;
		} catch (error) {
			return 0;
		}
	}

	setupTabKeepAlive() {
		// Use tab events to keep service worker alive
		try {
			// Listen to various tab events that indicate user activity
			chrome.tabs.onActivated.addListener(() => {
				this.handleTabActivity("tab_activated");
			});

			chrome.tabs.onUpdated.addListener(() => {
				this.handleTabActivity("tab_updated");
			});

			chrome.tabs.onCreated.addListener(() => {
				this.handleTabActivity("tab_created");
			});

			console.log("📱 Tab-based keepalive configured");
		} catch (error) {
			console.error("Error setting up tab keepalive:", error);
		}
	}

	async handleTabActivity(activityType) {
		try {
			await chrome.storage.local.set({
				lastTabActivity: Date.now(),
				lastTabActivityType: activityType,
			});

			// Use tab activity as a trigger to check connection
			if (!this.isConnected && this.reconnectAttempts < 5) {
				console.log(
					`🔄 Tab activity (${activityType}) triggered reconnection check`,
				);
				this.connectToBridge();
			}
		} catch (error) {
			console.error("Error handling tab activity:", error);
		}
	}

	restartKeepAliveMechanisms() {
		console.log("🔄 Restarting all keepalive mechanisms");

		// Restart ping/pong if it's not running
		if (!this.pingInterval && this.isConnected) {
			this.startKeepalive();
		}


		// Refresh alarm
		this.setupAlarmKeepAlive();
	}

	// All CDP commands are now handled by the CDPServer instance
	// All BROP commands are now handled by the BROPServer instance
	// Clean multiplexing layer with delegated command processing

	// Lightweight health check (called from consolidated interval)
	performHealthCheck() {
		try {
			// Simple connection health check
			if (!this.isConnected && this.reconnectAttempts < 10) {
				// Only try reconnection occasionally if not connected
				if (Date.now() - (this.lastReconnectAttempt || 0) > 2 * 60 * 1000) {
					console.log("🔄 Health check triggered reconnection attempt");
					this.lastReconnectAttempt = Date.now();
					this.connectToBridge();
				}
			}
			
			// Restart keepalive if ping interval is not running
			if (this.isConnected && !this.pingInterval) {
				console.log("🔄 Health check restarting keepalive");
				this.startKeepalive();
			}
		} catch (error) {
			console.error("Error in health check:", error);
		}
	}

	async getHealthCheckCount() {
		try {
			const result = await chrome.storage.local.get(["healthCheckCount"]);
			return result.healthCheckCount || 0;
		} catch (error) {
			return 0;
		}
	}


	// Memory management and cleanup (consolidated intervals)
	setupMemoryManagement() {
		console.log("🧠 Setting up memory management");
		
		// Consolidated maintenance interval - runs every minute but different tasks at different frequencies
		this.maintenanceCounter = 0;
		this.cleanupInterval = setInterval(() => {
			this.maintenanceCounter++;
			
			// Memory cleanup every 5 minutes (counter % 5 === 0)
			if (this.maintenanceCounter % 5 === 0) {
				this.performMemoryCleanup();
			}
			
			// Memory monitoring every 10 minutes (counter % 10 === 0)  
			if (this.maintenanceCounter % 10 === 0) {
				this.logMemoryUsage();
			}
			
			// Health check every 1 minute
			this.performHealthCheck();
			
		}, 1 * 60 * 1000); // Single interval every minute
	}

	performMemoryCleanup() {
		console.log("🧹 Performing memory cleanup");
		
		try {
			// Clean up BROP server logs
			if (this.bropServer?.callLogs) {
				const maxLogs = 100; // Reduced from 1000
				if (this.bropServer.callLogs.length > maxLogs) {
					this.bropServer.callLogs = this.bropServer.callLogs.slice(-maxLogs);
					console.log(`🧹 Trimmed BROP logs to ${maxLogs} entries`);
				}
			}
			
			// Clean up extension errors
			if (this.bropServer?.extensionErrors) {
				const maxErrors = 50; // Reduced from 100
				if (this.bropServer.extensionErrors.length > maxErrors) {
					this.bropServer.extensionErrors = this.bropServer.extensionErrors.slice(0, maxErrors);
					console.log(`🧹 Trimmed error logs to ${maxErrors} entries`);
				}
			}
			
			// Clean up CDP server data
			if (this.cdpServer) {
				this.cdpServer.performCleanup();
			}
			
			// Force garbage collection if available
			if (global.gc) {
				global.gc();
				console.log("🧹 Forced garbage collection");
			}
			
		} catch (error) {
			console.error("Memory cleanup failed:", error);
		}
	}

	logMemoryUsage() {
		try {
			const bropLogCount = this.bropServer?.callLogs?.length || 0;
			const errorCount = this.bropServer?.extensionErrors?.length || 0;
			const cdpSessions = this.cdpServer?.debuggerSessions?.size || 0;
			const attachedTabs = this.cdpServer?.attachedTabs?.size || 0;
			
			console.log(`📊 Memory usage: BROP logs=${bropLogCount}, errors=${errorCount}, CDP sessions=${cdpSessions}, attached tabs=${attachedTabs}`);
		} catch (error) {
			console.error("Memory monitoring failed:", error);
		}
	}

	// Cleanup on shutdown
	shutdown() {
		console.log("🔌 Shutting down main background");
		
		// Clear the single consolidated interval
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
		
		// Final cleanup
		this.performMemoryCleanup();
	}
}

// Initialize the main background script
const mainBackground = new MainBackground();

// Export for testing
if (typeof module !== "undefined" && module.exports) {
	module.exports = MainBackground;
}
