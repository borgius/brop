// Browser Remote Operations Protocol - Popup Script

class BROPPopup {
	constructor() {
		this.initializePopup();
		this.setupEventListeners();
		this.startStatusUpdates();
	}

	async initializePopup() {
		await this.updateStatus();
		await this.updateActiveTab();
		await this.updateConsolePreview();
	}

	setupEventListeners() {
		// Tab switching
		for (const tab of document.querySelectorAll(".tab-link")) {
			tab.addEventListener("click", (e) => {
				e.preventDefault();
				const targetTab = e.target.dataset.tab;
				this.switchTab(targetTab);
			});
		}

		// Handle optional buttons that might not exist
		const clearLogsBtn = document.getElementById("clear-logs");
		if (clearLogsBtn) {
			clearLogsBtn.addEventListener("click", () => {
				this.clearConsoleLogs();
			});
		}

		const testConnectionBtn = document.getElementById("test-connection");
		if (testConnectionBtn) {
			testConnectionBtn.addEventListener("click", () => {
				this.testConnection();
			});
		}

		const refreshLogsBtn = document.getElementById("refresh-logs");
		if (refreshLogsBtn) {
			refreshLogsBtn.addEventListener("click", () => {
				this.updateStatus();
			});
		}

		// Full screen logs button
		const fullScreenBtn = document.getElementById("open-fullscreen");
		if (fullScreenBtn) {
			fullScreenBtn.addEventListener("click", () => {
				this.openFullScreenLogs();
			});
		}

		// Clear all logs button
		const clearAllLogsBtn = document.getElementById("clear-all-logs");
		if (clearAllLogsBtn) {
			clearAllLogsBtn.addEventListener("click", () => {
				this.clearConsoleLogs();
			});
		}

		// Service toggle switch
		const serviceToggle = document.getElementById("service-toggle");
		if (serviceToggle) {
			serviceToggle.addEventListener("click", () => {
				this.toggleService();
			});
		}

		// Wakeup service worker button
		const wakeupBtn = document.getElementById("wakeup-service");
		if (wakeupBtn) {
			wakeupBtn.addEventListener("click", () => {
				this.wakeupServiceWorker();
			});
		}

		// Log type filter
		const logTypeFilter = document.getElementById("log-type-filter");
		if (logTypeFilter) {
			logTypeFilter.addEventListener("change", () => {
				this.updateConsolePreview();
			});
		}
	}

	async toggleService() {
		try {
			// Get current status first
			const currentStatus = await chrome.runtime.sendMessage({
				type: "GET_STATUS",
			});

			// Toggle the service
			const newEnabled = !currentStatus.enabled;
			const response = await chrome.runtime.sendMessage({
				type: "SET_ENABLED",
				enabled: newEnabled,
			});

			console.log("Service toggle response:", response);

			// Update UI immediately
			await this.updateStatus();
		} catch (error) {
			console.error("Error toggling service:", error);
		}
	}

	switchTab(tabName) {
		// Hide all tab contents
		for (const content of document.querySelectorAll(".tab-content")) {
			content.classList.remove("active");
		}

		// Remove active class from all tabs
		for (const tab of document.querySelectorAll(".tab-link")) {
			tab.classList.remove("active");
		}

		// Show target tab content
		const targetContent = document.getElementById(tabName);
		if (targetContent) {
			targetContent.classList.add("active");
		}

		// Add active class to clicked tab
		const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
		if (targetTab) {
			targetTab.classList.add("active");
		}
	}

	startStatusUpdates() {
		// Update status every 5 seconds (less frequent to avoid interrupting user)
		setInterval(() => {
			this.updateStatus();
			this.updateStorageHeartbeat();
			// Only update logs if user is not actively viewing them
			if (
				document
					.querySelector('.tab-link[data-tab="call-logs"]')
					.classList.contains("active")
			) {
				// Don't auto-refresh logs when user is viewing them
				return;
			}
			this.updateConsolePreview();
		}, 5000);

		// Initial storage heartbeat update
		this.updateStorageHeartbeat();
	}

	async updateStatus() {
		try {
			// Check if background script is responsive
			const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });

			if (response) {
				let statusMessage;
				if (response.connected) {
					// Get available tabs count for a more useful display
					try {
						const tabs = await chrome.tabs.query({});
						const availableTabs = tabs.filter(
							(tab) => !tab.url.startsWith("chrome://"),
						).length;
						statusMessage = `Connected - ${availableTabs} available tabs`;
					} catch (error) {
						// Fallback if we can't access tabs
						const controlledCount = response.controlledTabs || 0;
						statusMessage = `Connected - ${controlledCount} controlled tabs`;
					}
				} else {
					const attempts = response.reconnectAttempts || 0;
					statusMessage = `Disconnected - Attempting to reconnect (${attempts} attempts)`;
				}

				this.setStatus(response.connected, statusMessage);

				// Update additional status info
				this.updateConnectionDetails(response);
			} else {
				this.setStatus(false, "Background script not responding");
			}
		} catch (error) {
			this.setStatus(false, "Background script not responding");
		}
	}

	setStatus(active, message) {
		const statusElement = document.getElementById("connection-status");
		const textElement = document.getElementById("connection-text");

		if (statusElement && textElement) {
			statusElement.className = active
				? "status-banner"
				: "status-banner inactive";
			textElement.textContent = message;
		}
	}

	updateConnectionDetails(status) {
		// Update stats
		const totalCallsElement = document.getElementById("total-calls");
		if (totalCallsElement) {
			totalCallsElement.textContent = status.totalLogs || 0;
		}

		const activeSessionsElement = document.getElementById("active-sessions");
		if (activeSessionsElement) {
			// Get server status to show actual connected clients
			this.getServerStatus()
				.then((serverStatus) => {
					if (serverStatus?.connected_clients) {
						activeSessionsElement.textContent =
							serverStatus.connected_clients.total_active_sessions || 0;
					} else {
						activeSessionsElement.textContent = status.activeSessions || 0;
					}
				})
				.catch(() => {
					activeSessionsElement.textContent = status.activeSessions || 0;
				});
		}

		// Update debugger status
		const debuggerStatusElement = document.getElementById("debugger-status");
		if (debuggerStatusElement) {
			debuggerStatusElement.textContent = status.debuggerAttached
				? "Yes"
				: "No";
		}

		const controlledTabsElement = document.getElementById("controlled-tabs");
		if (controlledTabsElement) {
			// Show available tabs instead of controlled tabs for better UX
			chrome.tabs
				.query({})
				.then((tabs) => {
					const availableTabs = tabs.filter(
						(tab) => !tab.url.startsWith("chrome://"),
					).length;
					controlledTabsElement.textContent = availableTabs;
				})
				.catch(() => {
					controlledTabsElement.textContent = status.controlledTabs || 0;
				});
		}

		const browserControlStatusElement = document.getElementById(
			"browser-control-status",
		);
		if (browserControlStatusElement) {
			browserControlStatusElement.textContent = status.connected
				? "Active"
				: "Inactive";
		}

		// Update service status
		const serviceStatusElement = document.getElementById("service-status");
		if (serviceStatusElement) {
			serviceStatusElement.textContent = status.enabled
				? "Enabled"
				: "Disabled";
		}

		const serviceTextElement = document.getElementById("service-text");
		if (serviceTextElement) {
			serviceTextElement.textContent = status.enabled ? "Enabled" : "Disabled";
		}

		// Update toggle switch visual state
		const serviceToggle = document.getElementById("service-toggle");
		if (serviceToggle) {
			if (status.enabled) {
				serviceToggle.classList.add("active");
			} else {
				serviceToggle.classList.remove("active");
			}
		}

		// Update connection method statuses
		const nativeStatusElement = document.getElementById("native-status");
		if (nativeStatusElement) {
			nativeStatusElement.textContent = status.connected
				? "✅ Connected"
				: "❌ Disconnected";
		}

		const cdpStatusElement = document.getElementById("cdp-status");
		if (cdpStatusElement) {
			cdpStatusElement.textContent = status.connected
				? "✅ Available"
				: "❌ Unavailable";
		}

		const settingsDebuggerStatusElement = document.getElementById(
			"settings-debugger-status",
		);
		if (settingsDebuggerStatusElement) {
			settingsDebuggerStatusElement.textContent = status.debuggerAttached
				? "✅ Attached"
				: "❌ Not Attached";
		}

		const logCountElement = document.getElementById("log-count");
		if (logCountElement) {
			logCountElement.textContent = status.totalLogs || 0;
		}
	}

	async updateActiveTab() {
		try {
			const [activeTab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (activeTab) {
				const url = new URL(activeTab.url);
				const displayUrl =
					url.hostname + (url.pathname !== "/" ? url.pathname : "");
				document.getElementById("active-tab").textContent = displayUrl;
			}
		} catch (error) {
			document.getElementById("active-tab").textContent =
				"Error loading tab info";
		}
	}

	async getServerStatus() {
		try {
			// Use existing background script connection to get server status
			const response = await chrome.runtime.sendMessage({
				type: "GET_SERVER_STATUS",
			});

			if (response?.success) {
				return response.result;
			}
			throw new Error(response?.error || "Server status request failed");
		} catch (error) {
			console.error("Error getting server status:", error);
			throw error;
		}
	}

	async updateConsolePreview() {
		try {
			// Get call logs from background script
			const response = await chrome.runtime.sendMessage({
				type: "GET_LOGS",
				limit: 20,
			});

			if (response?.logs) {
				this.displayConsoleLogs(response.logs);
			} else {
				this.displayConsoleLogs([]);
			}
		} catch (error) {
			console.error("Error getting logs:", error);
			this.displayConsoleLogs([]);
		}
	}

	displayConsoleLogs(logs) {
		const logsContainer = document.getElementById("logs-container");

		if (!logsContainer) {
			console.warn("logs-container element not found");
			return;
		}

		// Apply filter
		const logTypeFilter = document.getElementById("log-type-filter");
		const filterValue = logTypeFilter ? logTypeFilter.value : "all";

		let filteredLogs = logs;
		if (filterValue !== "all") {
			filteredLogs = logs.filter((log) => log.type === filterValue);
		}

		if (filteredLogs.length === 0) {
			logsContainer.innerHTML =
				'<div class="empty-logs">No logs found for the selected filter.</div>';
			return;
		}

		const entries = filteredLogs
			.slice(-10)
			.map((log, index) => {
				const time = new Date(log.timestamp || Date.now()).toLocaleTimeString();
				const status = log.error ? "error" : "success";
				const statusText = log.error ? "Error" : "Success";
				const checkIcon = `<svg class="icon-check-small" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
      </svg>`;

				// Format the type badge with appropriate color
				let badgeClass = "badge";
				let badgeText = log.type || "BROP";

				if (log.type === "CDP") {
					badgeClass += " badge-cdp";
				} else if (log.type === "CDP_EVENT") {
					badgeClass += " badge-cdp-event";
					badgeText = "CDP Event";
				}

				return `<div class="log-item ${status}" data-log-index="${index}" data-log-id="${log.id || index}">
        <div class="checkbox-container">
          <div class="custom-checkbox">
            ${checkIcon}
          </div>
        </div>
        <span class="type">${log.method || "Unknown"}</span>
        <span class="status">${statusText}</span>
        <span class="${badgeClass}">${badgeText}</span>
        <span class="time">${time}</span>
      </div>`;
			})
			.join("");

		// Remember current scroll position
		const currentScrollTop = logsContainer.scrollTop;
		const wasAtBottom =
			logsContainer.scrollTop >=
			logsContainer.scrollHeight - logsContainer.clientHeight - 5;

		logsContainer.innerHTML = entries;

		// Add click event listeners to log entries
		const logItems = logsContainer.querySelectorAll(".log-item");
		const displayedLogs = filteredLogs.slice(-10);
		for (let index = 0; index < logItems.length; index++) {
			const entry = logItems[index];
			entry.addEventListener("click", () => {
				const logData = displayedLogs[index]; // Get the actual log data from filtered list
				this.openLogDetailView(logData);
			});
		}

		// Only auto-scroll to bottom if user was already at the bottom
		if (wasAtBottom) {
			logsContainer.scrollTop = logsContainer.scrollHeight;
		} else {
			// Try to maintain the scroll position, or close to it
			logsContainer.scrollTop = currentScrollTop;
		}
	}

	openLogDetailView(logData) {
		// Create a new window to show detailed log information
		const detailWindow = window.open(
			"",
			"_blank",
			"width=800,height=600,scrollbars=yes,resizable=yes",
		);

		if (!detailWindow) {
			// Fallback: log to console if popup blocking
			console.log("Detailed log data:", logData);
			alert("Log details logged to console (F12)");
			return;
		}

		const timestamp = new Date(
			logData.timestamp || Date.now(),
		).toLocaleString();
		const duration = logData.duration ? `${logData.duration}ms` : "N/A";
		const status = logData.error ? "ERROR" : "SUCCESS";
		const logType = logData.type || "BROP";
		const typeColor =
			logType === "CDP"
				? "#2196F3"
				: logType === "CDP_EVENT"
					? "#9C27B0"
					: "#4CAF50";

		detailWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${logType} Log Details - ${logData.method || "Unknown"}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 20px; 
            background: #f5f5f5;
          }
          .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0 0 10px 0;
            color: #1976d2;
            font-size: 24px;
          }
          .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            color: white;
            font-size: 12px;
          }
          .status.success { background: #4caf50; }
          .status.error { background: #f44336; }
          .section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
          }
          .section h2 {
            margin: 0 0 15px 0;
            color: #333;
            font-size: 18px;
            border-bottom: 2px solid #eee;
            padding-bottom: 8px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
            margin-bottom: 15px;
          }
          .info-label {
            font-weight: bold;
            color: #666;
          }
          .info-value {
            color: #333;
            word-break: break-all;
          }
          pre {
            background: #f8f8f8;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #1976d2;
            overflow-x: auto;
            font-size: 12px;
            line-height: 1.4;
          }
          .error-pre {
            border-left-color: #f44336;
            background: #fff5f5;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${logData.method || "Unknown Method"}</h1>
          <span class="status ${logData.error ? "error" : "success"}">${status}</span>
        </div>

        <div class="section">
          <h2>Request Information</h2>
          <div class="info-grid">
            <div class="info-label">Method:</div>
            <div class="info-value">${logData.method || "N/A"}</div>
            
            <div class="info-label">Type:</div>
            <div class="info-value"><span style="background-color: ${typeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${logType}</span></div>
            
            <div class="info-label">Timestamp:</div>
            <div class="info-value">${timestamp}</div>
            
            <div class="info-label">Duration:</div>
            <div class="info-value">${duration}</div>
            
            <div class="info-label">Success:</div>
            <div class="info-value">${logData.success !== undefined ? logData.success : "N/A"}</div>
          </div>
        </div>

        ${
					logData.params
						? `
        <div class="section">
          <h2>Parameters</h2>
          <pre>${typeof logData.params === "string" ? logData.params : JSON.stringify(logData.params, null, 2)}</pre>
        </div>
        `
						: ""
				}

        ${
					logData.result
						? `
        <div class="section">
          <h2>Result</h2>
          <pre>${typeof logData.result === "string" ? logData.result : JSON.stringify(logData.result, null, 2)}</pre>
        </div>
        `
						: ""
				}

        ${
					logData.error
						? `
        <div class="section">
          <h2>Error Details</h2>
          <pre class="error-pre">${logData.error}</pre>
        </div>
        `
						: ""
				}

        <div class="section">
          <h2>Raw Log Data</h2>
          <pre>${JSON.stringify(logData, null, 2)}</pre>
        </div>
      </body>
      </html>
    `);

		detailWindow.document.close();

		// Focus the window without inline scripts
		setTimeout(() => {
			detailWindow.focus();
		}, 50);
	}

	async openFullScreenLogs() {
		try {
			// Get all logs from background script
			const response = await chrome.runtime.sendMessage({
				type: "GET_LOGS",
				limit: 1000,
			});
			const logs = response?.logs || [];

			// Create a full-screen log viewer window using the new design
			const fullScreenWindow = window.open(
				"",
				"_blank",
				"width=1200,height=800,scrollbars=yes,resizable=yes",
			);

			if (!fullScreenWindow) {
				alert("Please allow popups to view full-screen logs");
				return;
			}

			// Use the beautiful design from design/logs.html
			fullScreenWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BROP Full Screen Logs</title>
            <style>
                :root {
                    --background: hsl(0 0% 100%);
                    --foreground: hsl(222.2 84% 4.9%);
                    --card: hsl(0 0% 100%);
                    --card-foreground: hsl(222.2 84% 4.9%);
                    --primary: hsl(221.2 83.2% 53.3%);
                    --primary-foreground: hsl(210 40% 98%);
                    --secondary: hsl(210 40% 96.1%);
                    --secondary-foreground: hsl(222.2 47.4% 11.2%);
                    --muted: hsl(210 40% 96.1%);
                    --muted-foreground: hsl(215.4 16.3% 46.9%);
                    --accent: hsl(210 40% 96.1%);
                    --accent-foreground: hsl(222.2 47.4% 11.2%);
                    --destructive: hsl(0 84.2% 60.2%);
                    --destructive-foreground: hsl(210 40% 98%);
                    --border: hsl(214.3 31.8% 91.4%);
                    --input: hsl(214.3 31.8% 91.4%);
                    --ring: hsl(222.2 84% 4.9%);
                    --success: hsl(142.1 76.2% 36.3%);
                    --success-foreground: hsl(355.7 100% 97.3%);
                    --warning: hsl(38 92% 50%);
                    --warning-foreground: hsl(48 96% 89%);
                    --radius: 0.5rem;
                }

                * {
                    border-color: var(--border);
                }

                *, *::before, *::after {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }

                body {
                    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    background-color: var(--background);
                    color: var(--foreground);
                    font-size: 14px;
                    line-height: 1.5;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                    min-height: 100vh;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 2rem;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                }

                .header {
                    margin-bottom: 2rem;
                    border-bottom: 1px solid var(--border);
                    padding-bottom: 1.5rem;
                }

                .header h1 {
                    font-size: 2rem;
                    font-weight: 700;
                    color: var(--primary);
                    margin-bottom: 0.5rem;
                    letter-spacing: -0.025em;
                }

                .header .subtitle {
                    color: var(--muted-foreground);
                    font-size: 1rem;
                    font-weight: 500;
                }

                .main-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .logs-container {
                    background-color: var(--card);
                    border: 1px solid var(--border);
                    border-radius: var(--radius);
                    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px 0 rgb(0 0 0 / 0.06);
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    overflow-y: auto;
                }

                .log-entry {
                    border-bottom: 1px solid var(--border);
                    transition: all 0.2s ease-in-out;
                }

                .log-entry:last-child {
                    border-bottom: none;
                }

                .log-entry:hover {
                    background-color: var(--accent);
                }

                .log-entry.error {
                    border-left: 4px solid var(--destructive);
                }

                .log-entry.success {
                    border-left: 4px solid var(--success);
                }

                .log-header {
                    display: grid;
                    grid-template-columns: 1fr auto auto auto;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem 1.5rem;
                    cursor: pointer;
                }

                .log-method {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .log-method-name {
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--primary);
                    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
                }

                .expand-hint {
                    color: var(--muted-foreground);
                    font-size: 0.875rem;
                    font-weight: 500;
                }

                .log-badge {
                    background-color: var(--success);
                    color: var(--success-foreground);
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    line-height: 1;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .log-timestamp {
                    color: var(--muted-foreground);
                    font-size: 0.875rem;
                    font-weight: 500;
                    white-space: nowrap;
                    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
                }

                .log-status {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 1.5rem;
                    height: 1.5rem;
                }

                .status-icon {
                    width: 1.25rem;
                    height: 1.25rem;
                }

                .status-success {
                    color: var(--success);
                }

                .status-error {
                    color: var(--destructive);
                }

                .log-content {
                    display: none;
                    padding: 0 1.5rem 1rem 1.5rem;
                    border-top: 1px solid var(--border);
                    background-color: var(--muted);
                }

                .log-content.expanded {
                    display: block;
                }

                .error-message {
                    color: var(--destructive);
                    font-weight: 500;
                    font-size: 0.875rem;
                    padding: 0.75rem 1rem;
                    background-color: hsl(0 84.2% 60.2% / 0.1);
                    border: 1px solid hsl(0 84.2% 60.2% / 0.2);
                    border-radius: var(--radius);
                    margin-top: 0.75rem;
                }

                .log-details {
                    margin-top: 0.75rem;
                    padding: 0.75rem 1rem;
                    background-color: var(--background);
                    border-radius: var(--radius);
                    border: 1px solid var(--border);
                }

                .log-details-title {
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                    color: var(--foreground);
                }

                .log-details-content {
                    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
                    font-size: 0.875rem;
                    color: var(--muted-foreground);
                    white-space: pre-wrap;
                    word-break: break-all;
                    max-height: 400px;
                    overflow-y: auto;
                    line-height: 1.4;
                }

                .log-details-content::-webkit-scrollbar {
                    width: 4px;
                }

                .log-details-content::-webkit-scrollbar-track {
                    background: var(--muted);
                }

                .log-details-content::-webkit-scrollbar-thumb {
                    background-color: var(--muted-foreground);
                    border-radius: 2px;
                }

                .footer-actions {
                    margin-top: 2rem;
                    display: flex;
                    justify-content: flex-end;
                    gap: 1rem;
                    padding-top: 1.5rem;
                    border-top: 1px solid var(--border);
                }

                .btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    white-space: nowrap;
                    border-radius: var(--radius);
                    font-size: 0.875rem;
                    font-weight: 500;
                    height: 2.5rem;
                    padding: 0 1.5rem;
                    cursor: pointer;
                    transition: all 0.2s ease-in-out;
                    border: 1px solid var(--input);
                    background-color: var(--background);
                    color: var(--foreground);
                    text-decoration: none;
                    gap: 0.5rem;
                }

                .btn:hover {
                    background-color: var(--accent);
                    color: var(--accent-foreground);
                }

                .btn:focus-visible {
                    outline: 2px solid var(--ring);
                    outline-offset: 2px;
                }

                .btn-destructive {
                    background-color: var(--destructive);
                    color: var(--destructive-foreground);
                    border-color: var(--destructive);
                }

                .btn-destructive:hover {
                    background-color: hsl(0 84.2% 55.2%);
                    border-color: hsl(0 84.2% 55.2%);
                }

                .empty-logs {
                    text-align: center;
                    padding: 4rem 2rem;
                    color: var(--muted-foreground);
                    font-style: italic;
                }

                @media (max-width: 768px) {
                    .container {
                        padding: 1rem;
                    }

                    .log-header {
                        grid-template-columns: 1fr auto;
                        gap: 0.5rem;
                    }

                    .log-badge,
                    .log-timestamp {
                        display: none;
                    }

                    .footer-actions {
                        flex-direction: column;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header class="header">
                    <h1>BROP Call Logs</h1>
                    <p class="subtitle">Total: ${logs.length} entries</p>
                </header>

                <main class="main-content">
                    <div class="logs-container" id="logs-container">
                        ${this.generateModernLogEntries(logs)}
                    </div>
                </main>

                <footer class="footer-actions">
                    <button class="btn" id="print-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6,9 6,2 18,2 18,9"></polyline>
                            <path d="M6,18H4a2,2,0,0,1-2-2V11a2,2,0,0,1,2-2H20a2,2,0,0,1,2,2v5a2,2,0,0,1-2,2H18"></path>
                            <polyline points="6,14 6,22 18,22 18,14"></polyline>
                        </svg>
                        Print
                    </button>
                    <button class="btn btn-destructive" id="close-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        Close
                    </button>
                </footer>
            </div>
        </body>
        </html>
      `);

			fullScreenWindow.document.close();

			// Add functionality after document is ready
			setTimeout(() => {
				this.setupFullScreenLogsInteractivity(fullScreenWindow, logs);
				fullScreenWindow.focus();
			}, 100);
		} catch (error) {
			console.error("Error opening full-screen logs:", error);
			alert("Error opening full-screen logs. Check console for details.");
		}
	}

	generateModernLogEntries(logs) {
		if (logs.length === 0) {
			return '<div class="empty-logs">No call logs yet. Make some API calls to see them here.</div>';
		}

		return logs
			.map((log, index) => {
				const time = new Date(log.timestamp || Date.now()).toLocaleString();
				const status = log.error ? "error" : "success";
				const statusIcon = log.error
					? '<svg class="status-icon status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
					: '<svg class="status-icon status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';

				const method = this.escapeHtml(log.method || "Unknown");
				const type = this.escapeHtml(log.type || "BROP");

				// Generate content sections
				const requestDetails = this.generateLogDetails(log);
				const errorMessage = log.error
					? `<div class="error-message">Error: ${this.escapeHtml(String(log.error))}</div>`
					: "";

				return `
        <div class="log-entry ${status}" data-index="${index}">
          <div class="log-header" data-index="${index}">
            <div class="log-method">
              <span class="log-method-name">${method}</span>
              <span class="expand-hint">(click to expand)</span>
            </div>
            <span class="log-badge">${type}</span>
            <span class="log-timestamp">${time}</span>
            <div class="log-status">
              ${statusIcon}
            </div>
          </div>
          <div class="log-content" id="content-${index}">
            ${errorMessage}
            <div class="log-details">
              <div class="log-details-title">Request Details</div>
              <div class="log-details-content">${requestDetails}</div>
            </div>
          </div>
        </div>
      `;
			})
			.join("");
	}

	generateLogDetails(log) {
		const details = [];

		details.push(`Method: ${log.method || "N/A"}`);
		details.push(`Type: ${log.type || "N/A"}`);
		details.push(
			`Timestamp: ${new Date(log.timestamp || Date.now()).toLocaleString()}`,
		);
		details.push(`Duration: ${log.duration ? `${log.duration}ms` : "N/A"}`);
		details.push(
			`Success: ${log.success !== undefined ? log.success : log.error ? "false" : "true"}`,
		);

		if (log.params) {
			try {
				const paramsText =
					typeof log.params === "string"
						? JSON.stringify(JSON.parse(log.params), null, 2)
						: JSON.stringify(log.params, null, 2);
				details.push(`\nParameters:\n${this.truncateValue(paramsText)}`);
			} catch (e) {
				details.push(`\nParameters: ${this.truncateValue(String(log.params))}`);
			}
		}

		if (log.result) {
			try {
				const resultText =
					typeof log.result === "string"
						? JSON.stringify(JSON.parse(log.result), null, 2)
						: JSON.stringify(log.result, null, 2);
				details.push(`\nResult:\n${this.truncateValue(resultText)}`);
			} catch (e) {
				details.push(`\nResult: ${this.truncateValue(String(log.result))}`);
			}
		}

		if (log.error) {
			details.push(
				`\nError Details:\n${this.truncateValue(String(log.error))}`,
			);
		}

		return this.escapeHtml(details.join("\n"));
	}

	truncateValue(value, maxLength = 2000) {
		if (!value || typeof value !== "string") {
			return value;
		}

		if (value.length <= maxLength) {
			return value;
		}

		// For very long values (like screenshots, page content), show start and end
		const truncated = value.substring(0, maxLength);
		const remaining = value.length - maxLength;
		const lines = value.split("\n").length;

		return `${truncated}\n\n... [TRUNCATED: ${remaining} more characters, ${lines} total lines] ...\n\nLast 200 chars:\n${value.substring(value.length - 200)}`;
	}

	setupFullScreenLogsInteractivity(window, logs) {
		// Add print functionality
		const printBtn = window.document.getElementById("print-btn");
		if (printBtn) {
			printBtn.addEventListener("click", () => {
				window.print();
			});
		}

		// Add close functionality
		const closeBtn = window.document.getElementById("close-btn");
		if (closeBtn) {
			closeBtn.addEventListener("click", () => {
				window.close();
			});
		}

		// Add click event listeners to log headers (CSP-compliant)
		for (const header of window.document.querySelectorAll(".log-header")) {
			header.addEventListener("click", function () {
				const index = this.getAttribute("data-index");
				const content = window.document.getElementById(`content-${index}`);
				const isExpanded = content.classList.contains("expanded");

				// Close all other expanded entries
				for (const openContent of window.document.querySelectorAll(
					".log-content.expanded",
				)) {
					if (openContent !== content) {
						openContent.classList.remove("expanded");
					}
				}

				// Toggle current entry
				if (isExpanded) {
					content.classList.remove("expanded");
				} else {
					content.classList.add("expanded");
				}
			});
		}

		// Keyboard navigation
		window.document.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				// Close all expanded entries
				for (const content of window.document.querySelectorAll(
					".log-content.expanded",
				)) {
					content.classList.remove("expanded");
				}
			}
		});

		// Print functionality - expand all for printing
		window.addEventListener("beforeprint", () => {
			for (const content of window.document.querySelectorAll(".log-content")) {
				content.style.display = "block";
			}
		});

		window.addEventListener("afterprint", () => {
			for (const content of window.document.querySelectorAll(".log-content")) {
				if (!content.classList.contains("expanded")) {
					content.style.display = "none";
				}
			}
		});
	}

	generateSimpleLogEntriesNoInline(logs) {
		if (logs.length === 0) {
			return '<div class="empty-logs">No call logs yet. Make some API calls to see them here.</div>';
		}

		return logs
			.map((log, index) => {
				const time = new Date(log.timestamp || Date.now()).toLocaleString();
				const duration = log.duration ? `${log.duration}ms` : "";
				const status = log.error ? "error" : "success";
				const statusIcon = log.error ? "❌" : "✅";
				const method = this.escapeHtml(log.method || "Unknown");
				const type = this.escapeHtml(log.type || "BROP");

				// Safely handle error preview with proper escaping
				let errorPreview = "";
				if (log.error) {
					const errorText = String(log.error).substring(0, 100);
					errorPreview =
						this.escapeHtml(errorText) + (log.error.length > 100 ? "..." : "");
				}

				// Generate full details sections
				const fullDetails = this.generateLogFullDetails(log);

				return `
        <div class="log-entry ${status}" data-index="${index}">
          <div class="log-header">
            <span class="log-method">${method}<span class="expand-indicator">(click to expand)</span></span>
            <div class="log-meta">
              <span class="log-type ${type}">${type}</span>
              <span class="log-time">${time}</span>
              ${duration ? `<span class="log-duration">${duration}</span>` : ""}
              <span class="log-status">${statusIcon}</span>
            </div>
          </div>
          ${errorPreview ? `<div class="log-details">Error: ${errorPreview}</div>` : ""}
          <div class="log-full-details" id="details-${index}">
            ${fullDetails}
          </div>
        </div>
      `;
			})
			.join("");
	}

	generateSimpleLogEntries(logs) {
		if (logs.length === 0) {
			return '<div class="empty-logs">No call logs yet. Make some API calls to see them here.</div>';
		}

		return logs
			.map((log, index) => {
				const time = new Date(log.timestamp || Date.now()).toLocaleString();
				const duration = log.duration ? `${log.duration}ms` : "";
				const status = log.error ? "error" : "success";
				const statusIcon = log.error ? "❌" : "✅";
				const method = this.escapeHtml(log.method || "Unknown");
				const type = this.escapeHtml(log.type || "BROP");

				// Safely handle error preview with proper escaping
				let errorPreview = "";
				if (log.error) {
					const errorText = String(log.error).substring(0, 100);
					errorPreview =
						this.escapeHtml(errorText) + (log.error.length > 100 ? "..." : "");
				}

				return `
        <div class="log-entry ${status}">
          <div class="log-header">
            <span class="log-method">${method}</span>
            <div class="log-meta">
              <span class="log-type ${type}">${type}</span>
              <span class="log-time">${time}</span>
              ${duration ? `<span class="log-duration">${duration}</span>` : ""}
              <span class="log-status">${statusIcon}</span>
            </div>
          </div>
          ${errorPreview ? `<div class="log-details">Error: ${errorPreview}</div>` : ""}
        </div>
      `;
			})
			.join("");
	}

	generateLogFullDetails(log) {
		const sections = [];

		// Basic Information
		sections.push(`
      <div class="detail-section">
        <div class="detail-label">Basic Information</div>
        <div class="detail-content">Method: ${this.escapeHtml(log.method || "N/A")}
Type: ${this.escapeHtml(log.type || "N/A")}
Timestamp: ${new Date(log.timestamp || Date.now()).toLocaleString()}
Duration: ${log.duration ? `${log.duration}ms` : "N/A"}
Success: ${log.success !== undefined ? log.success : log.error ? "false" : "true"}
ID: ${this.escapeHtml(log.id || "N/A")}</div>
      </div>
    `);

		// Parameters
		if (log.params) {
			let paramsText;
			try {
				// Handle both string and object params
				if (typeof log.params === "string") {
					const parsed = JSON.parse(log.params);
					paramsText = JSON.stringify(parsed, null, 2);
				} else {
					paramsText = JSON.stringify(log.params, null, 2);
				}
			} catch (e) {
				paramsText = String(log.params);
			}

			sections.push(`
        <div class="detail-section">
          <div class="detail-label">Parameters</div>
          <div class="detail-content">${this.escapeHtml(paramsText)}</div>
        </div>
      `);
		}

		// Result
		if (log.result) {
			let resultText;
			try {
				// Handle both string and object results
				if (typeof log.result === "string") {
					const parsed = JSON.parse(log.result);
					resultText = JSON.stringify(parsed, null, 2);
				} else {
					resultText = JSON.stringify(log.result, null, 2);
				}
			} catch (e) {
				resultText = String(log.result);
			}

			sections.push(`
        <div class="detail-section">
          <div class="detail-label">Result</div>
          <div class="detail-content">${this.escapeHtml(resultText)}</div>
        </div>
      `);
		}

		// Error Details (full error, not truncated)
		if (log.error) {
			sections.push(`
        <div class="detail-section">
          <div class="detail-label">Error Details</div>
          <div class="detail-content">${this.escapeHtml(String(log.error))}</div>
        </div>
      `);
		}

		// Raw Log Data
		sections.push(`
      <div class="detail-section">
        <div class="detail-label">Raw Log Data</div>
        <div class="detail-content">${this.escapeHtml(JSON.stringify(log, null, 2))}</div>
      </div>
    `);

		return sections.join("");
	}

	escapeHtml(text) {
		const textStr = typeof text !== "string" ? String(text) : text;
		return textStr
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	async clearConsoleLogs() {
		try {
			const response = await chrome.runtime.sendMessage({ type: "CLEAR_LOGS" });
			if (response?.success) {
				// Refresh the logs display
				await this.updateConsolePreview();
			}
		} catch (error) {
			console.error("Failed to clear logs:", error);
		}
	}

	async updateStorageHeartbeat() {
		try {
			// Get storage heartbeat data
			const data = await chrome.storage.local.get([
				"heartbeat",
				"heartbeatCounter",
				"extensionActive",
				"connectionStatus",
			]);

			// Update heartbeat count
			const heartbeatCountEl = document.getElementById("heartbeat-count");
			if (heartbeatCountEl && data.heartbeatCounter !== undefined) {
				heartbeatCountEl.textContent = data.heartbeatCounter;
			}

			// Update last heartbeat time
			const lastHeartbeatEl = document.getElementById("last-heartbeat");
			if (lastHeartbeatEl && data.heartbeat) {
				const secondsAgo = Math.floor((Date.now() - data.heartbeat) / 1000);
				if (secondsAgo < 60) {
					lastHeartbeatEl.textContent = `${secondsAgo}s ago`;
				} else if (secondsAgo < 3600) {
					const minutesAgo = Math.floor(secondsAgo / 60);
					lastHeartbeatEl.textContent = `${minutesAgo}m ago`;
				} else {
					lastHeartbeatEl.textContent = "Inactive";
				}
			}
		} catch (error) {
			console.error("Failed to update storage heartbeat:", error);
		}
	}

	async wakeupServiceWorker() {
		try {
			// Send wakeup request via storage
			await chrome.storage.local.set({
				wakeupRequest: Date.now(),
				wakeupSource: "popup",
			});

			// Also try to send a message to ensure it's awake
			const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });

			// Update UI
			const wakeupBtn = document.getElementById("wakeup-service");
			if (wakeupBtn) {
				wakeupBtn.textContent = "Service Worker Active!";
				wakeupBtn.style.backgroundColor = "var(--success)";

				// Reset button after 2 seconds
				setTimeout(() => {
					wakeupBtn.textContent = "Wake Up Service Worker";
					wakeupBtn.style.backgroundColor = "";
				}, 2000);
			}

			// Update status immediately
			await this.updateStatus();
			await this.updateStorageHeartbeat();
		} catch (error) {
			console.error("Failed to wake up service worker:", error);
		}
	}
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	new BROPPopup();
});
