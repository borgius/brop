#!/usr/bin/env node
/**
 * BROP MCP Server - Official SDK Implementation
 *
 * Model Context Protocol server for Browser Remote Operations Protocol (BROP)
 * Built using the official @modelcontextprotocol/sdk
 */

import net from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import { z } from "zod";
import { UnifiedBridgeServer } from "./bridge_server.js";

class BROPMCPServer {
	constructor() {
		this.isServerMode = false;
		this.bridgeServer = null;
		this.bropClient = null;
		this.cdpClient = null;
		this.isInitializing = false;
		this.isInitialized = false;
		this.cdpSessionId = null;
		this.cdpMessageCounter = 1;
	}

	log(message) {
		// Log to stderr to avoid interfering with STDIO transport
		console.error(`[BROP-MCP] ${new Date().toISOString()} ${message}`);
	}

	/**
	 * Check if port is available
	 * @returns {Promise<boolean>} true if port is available, false if occupied
	 */
	async checkPortAvailability(port) {
		return new Promise((resolve) => {
			const server = net.createServer();

			server.listen(port, () => {
				server.close(() => {
					resolve(true); // Port is available
				});
			});

			server.on("error", (err) => {
				if (err.code === "EADDRINUSE") {
					resolve(false); // Port is occupied
				} else {
					resolve(false); // Other error, assume port is not available
				}
			});
		});
	}

	/**
	 * Start in Server Mode - run bridge servers based on port availability
	 */
	async startServerMode() {
		this.log("Starting in SERVER MODE - will start bridge servers");

		try {
			this.bridgeServer = new UnifiedBridgeServer({
				mcpMode: true,
				logToStderr: true,
			});
			await this.bridgeServer.startServers();

			this.isServerMode = true;
			this.log("Server Mode: Bridge servers started successfully");
		} catch (error) {
			this.log(`Failed to start server mode: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Start in Relay Mode - connect to existing servers
	 */
	async startRelayMode() {
		this.log("Starting in RELAY MODE - will connect to existing servers");

		try {
			// Check and connect to BROP server if available
			const bropPortAvailable = await this.checkPortAvailability(9225);
			if (!bropPortAvailable) {
				await this.connectToBROPServer();
				this.log("Relay Mode: Connected to BROP server successfully");
			} else {
				this.log("BROP server not available on port 9225");
			}

			// Check and connect to CDP server if available
			const cdpPortAvailable = await this.checkPortAvailability(9222);
			if (!cdpPortAvailable) {
				await this.connectToCDPServer();
				this.log("Relay Mode: Connected to CDP server successfully");
			} else {
				this.log("CDP server not available on port 9222");
			}

			this.isServerMode = false;
		} catch (error) {
			this.log(`Failed to start relay mode: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Connect to existing BROP server as a client
	 */
	async connectToBROPServer() {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket("ws://localhost:9225?name=mcp-stdio");

			ws.on("open", () => {
				this.log("Connected to BROP server as relay client");
				this.bropClient = ws;
				resolve();
			});

			ws.on("error", (error) => {
				this.log(`Failed to connect to BROP server: ${error.message}`);
				reject(error);
			});

			ws.on("close", () => {
				this.log("Connection to BROP server closed");
				this.bropClient = null;
			});

			ws.on("message", (message) => {
				try {
					const data = JSON.parse(message.toString());
					this.log(
						`Received from BROP server: ${data.type || data.method || "unknown"}`,
					);
				} catch (error) {
					this.log(`Error parsing BROP message: ${error.message}`);
				}
			});
		});
	}

	/**
	 * Connect to existing CDP server as a client
	 */
	async connectToCDPServer() {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket("ws://localhost:9222/devtools/browser/mcp-client");

			ws.on("open", () => {
				this.log("Connected to CDP server as relay client");
				this.cdpClient = ws;
				resolve();
			});

			ws.on("error", (error) => {
				this.log(`Failed to connect to CDP server: ${error.message}`);
				reject(error);
			});

			ws.on("close", () => {
				this.log("Connection to CDP server closed");
				this.cdpClient = null;
			});

			ws.on("message", (message) => {
				try {
					const data = JSON.parse(message.toString());
					this.log(
						`Received from CDP server: ${data.method || data.id || "unknown"}`,
					);
					// Handle CDP events and responses
					if (data.method && !data.id) {
						// This is a CDP event
						this.handleCDPEvent(data);
					}
				} catch (error) {
					this.log(`Error parsing CDP message: ${error.message}`);
				}
			});
		});
	}

	handleCDPEvent(event) {
		// Handle CDP events like Target.attachedToTarget
		if (event.method === "Target.attachedToTarget") {
			this.cdpSessionId = event.params.sessionId;
			this.log(`CDP session established: ${this.cdpSessionId}`);
		}
	}

	async initialize() {
		if (this.isInitializing || this.isInitialized) {
			return;
		}

		this.isInitializing = true;
		this.log("Initializing MCP Server...");

		try {
			// Check if port 9224 is available (extension port)
			const extensionPortAvailable = await this.checkPortAvailability(9224);

			if (!extensionPortAvailable) {
				// Extension port is occupied - bridge server is already running
				this.log("Port 9224 is occupied - bridge server already running");
				this.log("Starting in RELAY MODE");
				await this.startRelayMode();
			} else {
				// No bridge server running - start our own
				this.log("Port 9224 is available - no bridge server running");
				this.log("Starting in SERVER MODE");
				await this.startServerMode();
			}

			this.isInitialized = true;
			this.log(
				`MCP Server initialized in ${this.isServerMode ? "SERVER" : "RELAY"} mode`,
			);
		} catch (error) {
			this.log(`MCP initialization failed: ${error.message}`);
			throw error;
		} finally {
			this.isInitializing = false;
		}
	}

	async executeBROPCommand(toolName, args) {
		// Ensure BROP is initialized
		if (!this.isInitialized) {
			await this.initialize();
		}

		const bropCommand = this.convertMCPToolToBROPCommand(toolName, args);

		// Try execution with retry logic for extension connection
		return await this.executeWithRetry(bropCommand);
	}

	async executeWithRetry(bropCommand, maxRetries = 1, retryDelay = 5000) {
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				if (this.isServerMode && this.bridgeServer?.extensionClient) {
					// Server mode - use bridge server directly
					return await this.executeCommandInServerMode(bropCommand);
				}

				if (this.bropClient && this.bropClient.readyState === WebSocket.OPEN) {
					// Relay mode - send through BROP client
					return await this.executeCommandInRelayMode(bropCommand);
				}

				// No connection available
				if (attempt < maxRetries) {
					this.log(
						`No browser extension connected, waiting ${retryDelay / 1000}s before retry (attempt ${attempt + 1}/${maxRetries + 1})`,
					);
					await this.sleep(retryDelay);
					continue;
				}

				throw new Error(
					"No BROP connection available - Chrome extension not connected",
				);
			} catch (error) {
				if (
					error.message.includes("Chrome extension not connected") &&
					attempt < maxRetries
				) {
					this.log(
						`Extension connection error, waiting ${retryDelay / 1000}s before retry (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`,
					);
					await this.sleep(retryDelay);
					continue;
				}
				throw error;
			}
		}
	}

	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async executeCommandInServerMode(bropCommand) {
		if (!this.bridgeServer?.extensionClient) {
			throw new Error("Chrome extension not connected");
		}

		return new Promise((resolve, reject) => {
			const messageId = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			const timeout = setTimeout(() => {
				reject(new Error("Command timeout"));
			}, 10000);

			const responseHandler = (message) => {
				try {
					const data = JSON.parse(message);
					if (data.id === messageId) {
						clearTimeout(timeout);
						this.bridgeServer.extensionClient.off("message", responseHandler);

						if (data.success) {
							resolve(data.result);
						} else {
							reject(new Error(data.error || "Command failed"));
						}
					}
				} catch (error) {
					// Ignore parse errors for other messages
				}
			};

			this.bridgeServer.extensionClient.on("message", responseHandler);

			const command = {
				...bropCommand,
				id: messageId,
				type: "brop_command",
			};

			this.bridgeServer.extensionClient.send(JSON.stringify(command));
		});
	}

	async executeCommandInRelayMode(bropCommand) {
		return new Promise((resolve, reject) => {
			const messageId = `mcp_relay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			const timeout = setTimeout(() => {
				reject(new Error("Command timeout"));
			}, 10000);

			const responseHandler = (message) => {
				try {
					const data = JSON.parse(message);
					if (data.id === messageId) {
						clearTimeout(timeout);
						this.bropClient.off("message", responseHandler);

						if (data.success) {
							resolve(data.result);
						} else {
							reject(new Error(data.error || "Command failed"));
						}
					}
				} catch (error) {
					// Ignore parse errors for other messages
				}
			};

			this.bropClient.on("message", responseHandler);

			const command = {
				...bropCommand,
				id: messageId,
			};

			this.bropClient.send(JSON.stringify(command));
		});
	}

	async executeCDPCommand(method, params = {}) {
		if (!this.isInitialized) {
			await this.initialize();
		}

		if (this.isServerMode && this.bridgeServer?.extensionClient) {
			// Server mode - send through bridge
			return await this.executeCDPCommandInServerMode(method, params);
		}

		if (this.cdpClient && this.cdpClient.readyState === WebSocket.OPEN) {
			// Relay mode - send through CDP client
			return await this.executeCDPCommandInRelayMode(method, params);
		}

		throw new Error("No CDP connection available");
	}

	async executeCDPCommandInServerMode(method, params) {
		return new Promise((resolve, reject) => {
			const messageId = this.cdpMessageCounter++;

			const timeout = setTimeout(() => {
				reject(new Error("CDP command timeout"));
			}, 10000);

			const responseHandler = (message) => {
				try {
					const data = JSON.parse(message);
					if (data.id === messageId) {
						clearTimeout(timeout);
						this.bridgeServer.extensionClient.off("message", responseHandler);

						if (data.result) {
							resolve(data.result);
						} else if (data.error) {
							reject(new Error(data.error.message || "CDP command failed"));
						}
					}
				} catch (error) {
					// Ignore parse errors for other messages
				}
			};

			this.bridgeServer.extensionClient.on("message", responseHandler);

			const command = {
				type: "BROP_CDP",
				id: messageId,
				method: method,
				params: params,
			};

			this.bridgeServer.extensionClient.send(JSON.stringify(command));
		});
	}

	async executeCDPCommandInRelayMode(method, params) {
		return new Promise((resolve, reject) => {
			const messageId = this.cdpMessageCounter++;

			const timeout = setTimeout(() => {
				reject(new Error("CDP command timeout"));
			}, 10000);

			const responseHandler = (message) => {
				try {
					const data = JSON.parse(message);
					if (data.id === messageId) {
						clearTimeout(timeout);
						this.cdpClient.off("message", responseHandler);

						if (data.result) {
							resolve(data.result);
						} else if (data.error) {
							reject(new Error(data.error.message || "CDP command failed"));
						}
					}
				} catch (error) {
					// Ignore parse errors for other messages
				}
			};

			this.cdpClient.on("message", responseHandler);

			const command = {
				id: messageId,
				method: method,
				params: params,
			};

			// Add session ID if we have one
			if (this.cdpSessionId && !method.startsWith("Target.")) {
				command.sessionId = this.cdpSessionId;
			}

			this.cdpClient.send(JSON.stringify(command));
		});
	}

	convertMCPToolToBROPCommand(toolName, args) {
		switch (toolName) {
			case "brop_navigate":
				return {
					method: "navigate",
					params: {
						url: args.url,
						tabId: args.tabId,
					},
				};

			case "brop_get_page_content":
				return {
					method: "get_page_content",
					params: {
						tabId: args.tabId,
					},
				};

			case "brop_get_simplified_content":
				return {
					method: "get_simplified_dom",
					params: {
						tabId: args.tabId,
						format: args.format,
						enableDetailedResponse: args.enableDetailedResponse || false,
					},
				};

			case "brop_execute_script":
				return {
					method: "execute_console",
					params: {
						code: args.script,
						tabId: args.tabId,
					},
				};

			case "brop_click_element":
				return {
					method: "click",
					params: {
						selector: args.selector,
						tabId: args.tabId,
					},
				};

			case "brop_type_text":
				return {
					method: "type",
					params: {
						selector: args.selector,
						text: args.text,
						tabId: args.tabId,
					},
				};

			case "brop_create_page":
				return {
					method: "create_tab",
					params: {
						url: args.url || "about:blank",
						active: args.active !== false, // Default to true unless explicitly false
					},
				};

			case "brop_close_tab":
				return {
					method: "close_tab",
					params: {
						tabId: args.tabId,
					},
				};

			case "brop_list_tabs":
				return {
					method: "list_tabs",
					params: {
						include_content: args.includeContent || false,
					},
				};

			case "brop_activate_tab":
				return {
					method: "activate_tab",
					params: {
						tabId: args.tabId,
					},
				};

			case "brop_start_console_capture":
				return {
					method: "start_console_capture",
					params: {
						tabId: args.tabId,
					},
				};

			case "brop_get_console_logs":
				return {
					method: "get_console_logs",
					params: {
						tabId: args.tabId,
						limit: args.limit,
						level: args.level,
					},
				};

			case "brop_clear_console_logs":
				return {
					method: "clear_console_logs",
					params: {
						tabId: args.tabId,
					},
				};

			case "brop_stop_console_capture":
				return {
					method: "stop_console_capture",
					params: {
						tabId: args.tabId,
					},
				};

			default:
				throw new Error(`Unknown tool: ${toolName}`);
		}
	}

	async shutdown() {
		this.log("Shutting down BROP MCP Server...");

		if (this.bridgeServer) {
			await this.bridgeServer.shutdown();
		}

		if (this.bropClient) {
			this.bropClient.close();
		}

		process.exit(0);
	}
}

// Create server instance
const bropServer = new BROPMCPServer();
const server = new McpServer({
	name: "brop-mcp-server",
	version: "1.0.0",
});

// Register BROP tools
server.tool(
	"brop_navigate",
	"Navigate to a URL in the browser",
	{
		url: z.string().describe("URL to navigate to"),
		tabId: z.number().optional().describe("Optional tab ID to navigate in"),
	},
	async ({ url, tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand("brop_navigate", {
				url,
				tabId,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_get_page_content",
	"Get basic page content from the browser (raw HTML and text)",
	{
		tabId: z.number().describe("Tab ID to get content from"),
	},
	async ({ tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand(
				"brop_get_page_content",
				{ tabId },
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_get_simplified_content",
	"Get simplified and cleaned page content in HTML or Markdown format",
	{
		tabId: z.number().describe("Tab ID to get content from"),
		format: z
			.enum(["html", "markdown"])
			.describe(
				"Output format - html (using Readability) or markdown (semantic conversion)",
			),
		enableDetailedResponse: z
			.boolean()
			.optional()
			.describe("Include detailed extraction statistics and metadata"),
	},
	async ({ tabId, format, enableDetailedResponse }) => {
		try {
			const result = await bropServer.executeBROPCommand(
				"brop_get_simplified_content",
				{ tabId, format, enableDetailedResponse },
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_execute_script",
	"Execute JavaScript in the browser",
	{
		script: z.string().describe("JavaScript code to execute"),
		tabId: z.number().optional().describe("Optional tab ID to execute in"),
	},
	async ({ script, tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand(
				"brop_execute_script",
				{ script, tabId },
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_click_element",
	"Click an element on the page",
	{
		selector: z.string().describe("CSS selector for the element to click"),
		tabId: z.number().optional().describe("Optional tab ID"),
	},
	async ({ selector, tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand("brop_click_element", {
				selector,
				tabId,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_type_text",
	"Type text into an input field",
	{
		selector: z.string().describe("CSS selector for the input element"),
		text: z.string().describe("Text to type"),
		tabId: z.number().optional().describe("Optional tab ID"),
	},
	async ({ selector, text, tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand("brop_type_text", {
				selector,
				text,
				tabId,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_create_page",
	"Create a new browser page/tab",
	{
		url: z
			.string()
			.optional()
			.describe(
				"Optional URL to navigate to in the new page (defaults to about:blank)",
			),
		active: z
			.boolean()
			.optional()
			.describe("Whether to make the new tab active (defaults to true)"),
	},
	async ({ url, active }) => {
		try {
			const result = await bropServer.executeBROPCommand("brop_create_page", {
				url,
				active,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_close_tab",
	"Close a browser tab",
	{
		tabId: z.number().describe("ID of the tab to close"),
	},
	async ({ tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand("brop_close_tab", {
				tabId,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_list_tabs",
	"List all open browser tabs",
	{
		windowId: z
			.number()
			.optional()
			.describe(
				"Optional window ID to filter tabs (if not provided, lists tabs from all windows)",
			),
		includeContent: z
			.boolean()
			.optional()
			.describe(
				"Whether to include page content in the response (defaults to false)",
			),
	},
	async ({ windowId, includeContent }) => {
		try {
			const result = await bropServer.executeBROPCommand("brop_list_tabs", {
				windowId,
				includeContent,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_activate_tab",
	"Switch to/activate a specific browser tab",
	{
		tabId: z.number().describe("ID of the tab to activate"),
	},
	async ({ tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand("brop_activate_tab", {
				tabId,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_get_server_status",
	"Get BROP server status and connection info",
	{},
	async () => {
		try {
			const status = {
				mode: bropServer.isServerMode ? "server" : "relay",
				isInitialized: bropServer.isInitialized,
				hasExtensionConnection:
					bropServer.bridgeServer?.extensionClient &&
					bropServer.bridgeServer.extensionClient.readyState === WebSocket.OPEN,
				hasBropConnection:
					bropServer.bropClient &&
					bropServer.bropClient.readyState === WebSocket.OPEN,
				hasCdpConnection:
					bropServer.cdpClient &&
					bropServer.cdpClient.readyState === WebSocket.OPEN,
				cdpSessionId: bropServer.cdpSessionId,
				status: "running",
			};

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(status, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

// Console Log Capture Tools
server.tool(
	"brop_start_console_capture",
	"Start capturing console logs for a tab using Chrome Debugger API",
	{
		tabId: z.number().describe("Tab ID to start capturing logs from"),
	},
	async ({ tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand(
				"brop_start_console_capture",
				{ tabId },
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_get_console_logs",
	"Retrieve console logs captured since capture was started (requires active capture session)",
	{
		tabId: z.number().describe("Tab ID to get logs from"),
		limit: z.number().optional().describe("Maximum logs to return (default: all captured)"),
		level: z
			.enum(["log", "warn", "error", "info", "debug"])
			.optional()
			.describe("Filter by log level"),
	},
	async ({ tabId, limit, level }) => {
		try {
			const result = await bropServer.executeBROPCommand(
				"brop_get_console_logs",
				{ tabId, limit, level },
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_clear_console_logs",
	"Clear captured console logs without stopping the capture session",
	{
		tabId: z.number().describe("Tab ID to clear logs for"),
	},
	async ({ tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand(
				"brop_clear_console_logs",
				{ tabId },
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"brop_stop_console_capture",
	"Stop console log collection and detach the debugger",
	{
		tabId: z.number().describe("Tab ID to stop capturing logs for"),
	},
	async ({ tabId }) => {
		try {
			const result = await bropServer.executeBROPCommand(
				"brop_stop_console_capture",
				{ tabId },
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

// CDP Tools
server.tool(
	"cdp_execute_command",
	"Execute a Chrome DevTools Protocol command",
	{
		method: z.string().describe("CDP method to execute (e.g., 'Page.navigate')"),
		params: z.object({}).passthrough().optional().describe("Parameters for the CDP method"),
	},
	async ({ method, params }) => {
		try {
			const result = await bropServer.executeCDPCommand(method, params || {});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"cdp_create_page",
	"Create a new page using CDP and attach to it",
	{
		url: z.string().optional().describe("URL to navigate to (defaults to about:blank)"),
	},
	async ({ url }) => {
		try {
			// Create a new target
			const createResult = await bropServer.executeCDPCommand("Target.createTarget", {
				url: url || "about:blank",
			});

			// Wait a bit for session to be established
			await new Promise(resolve => setTimeout(resolve, 500));

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							targetId: createResult.targetId,
							sessionId: bropServer.cdpSessionId,
						}, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"cdp_navigate",
	"Navigate to a URL using CDP",
	{
		url: z.string().describe("URL to navigate to"),
		waitUntil: z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"]).optional().describe("When to consider navigation complete"),
	},
	async ({ url, waitUntil }) => {
		try {
			const result = await bropServer.executeCDPCommand("Page.navigate", {
				url: url,
				waitUntil: waitUntil,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

server.tool(
	"cdp_evaluate",
	"Evaluate JavaScript in the page using CDP",
	{
		expression: z.string().describe("JavaScript expression to evaluate"),
		awaitPromise: z.boolean().optional().describe("Whether to await promise resolution"),
	},
	async ({ expression, awaitPromise }) => {
		try {
			const result = await bropServer.executeCDPCommand("Runtime.evaluate", {
				expression: expression,
				awaitPromise: awaitPromise || false,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message}`,
					},
				],
			};
		}
	},
);

// Start the server
async function main() {
	// Initialize BROP bridge servers immediately so extension can connect
	try {
		await bropServer.initialize();
	} catch (error) {
		console.error("Warning: BROP initialization failed:", error.message);
	}

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("BROP MCP Server running on stdio");
}

// Handle shutdown signals
process.on("SIGINT", async () => {
	await bropServer.shutdown();
});

process.on("SIGTERM", async () => {
	await bropServer.shutdown();
});

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
