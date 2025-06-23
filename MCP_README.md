# MCP-BROP Server - Model Context Protocol Documentation

The MCP-BROP server provides AI agents with comprehensive browser automation capabilities through the Model Context Protocol (MCP). This documentation is specifically designed for AI agents to understand and use the browser automation tools effectively.

## Overview

MCP-BROP bridges Chrome browser automation with AI agents using the official MCP SDK. It provides both high-level browser automation tools and low-level Chrome DevTools Protocol (CDP) access.

### Key Features

- **Dual-Mode Operation**: Automatically detects and switches between server and relay modes
- **Session Management**: Handles browser connection and session lifecycle
- **Error Recovery**: Built-in retry logic and connection management
- **Console Log Capture**: Explicit console log collection with Chrome Debugger API
- **Full JavaScript Execution**: Complete JavaScript evaluation with async/await support
- **Content Extraction**: Advanced content extraction with CSS selectors for automation

## Connection Architecture

```
AI Agent ←→ MCP Server ←→ Bridge Server ←→ Chrome Extension ←→ Browser
   STDIO      Auto-detect    WebSocket       Chrome APIs      Web Pages
```

### Modes

1. **Server Mode**: When no existing bridge server is detected (port 9225 free)
   - Starts full BROP infrastructure
   - Manages Chrome extension connection
   - Handles all browser communication

2. **Relay Mode**: When existing bridge server is detected (port 9225 occupied)
   - Connects as client to existing server
   - Shares browser access with other clients
   - Efficient resource usage

## Available Tools

### Core Navigation & Content

#### `brop_navigate`
Navigate to a URL in the browser.

**Parameters:**
- `url` (string): URL to navigate to
- `tabId` (number, optional): Specific tab ID (uses active tab if not provided)

**Returns:** Navigation result with tab information

```json
{
  "success": true,
  "action": "navigated",
  "tabId": 123,
  "url": "https://example.com",
  "title": "Example Page"
}
```

#### `brop_get_page_content`
Extract raw HTML and text content from a page.

**Parameters:**
- `tabId` (number): Tab ID to extract content from

**Returns:** Page content with metadata

```json
{
  "html": "<html>...</html>",
  "text": "Page text content...",
  "title": "Page Title",
  "url": "https://example.com"
}
```

#### `brop_get_simplified_content`
Get cleaned, simplified content in HTML or Markdown format with CSS selectors.

**Parameters:**
- `tabId` (number): Tab ID to extract from
- `format` (string): "html" or "markdown" (default: "markdown")
- `enableDetailedResponse` (boolean): Include extraction metadata (default: false)

**Returns:** Simplified content with actionable element selectors

```json
{
  "markdown": "# Page Title\n\nClick [Login](https://example.com/login)<!--#login-btn--> to continue...",
  "title": "Page Title",
  "url": "https://example.com",
  "stats": {
    "source": "turndown_main",
    "markdownLength": 1234,
    "processed": true
  }
}
```

**AI Usage Note:** The markdown includes CSS selectors in HTML comments (e.g., `<!--#login-btn-->`) that you can use with click/type commands.

### Tab Management

#### `brop_create_page`
Create a new browser tab/page.

**Parameters:**
- `url` (string, optional): URL to navigate to (default: "about:blank")
- `active` (boolean, optional): Make tab active (default: true)

**Returns:** New tab information

#### `brop_close_tab`
Close a specific browser tab.

**Parameters:**
- `tabId` (number): ID of tab to close

#### `brop_list_tabs`
List all open browser tabs.

**Parameters:**
- `windowId` (number, optional): Filter by window ID
- `includeContent` (boolean, optional): Include page content (default: false)

**Returns:** Array of tab information with accessibility status

#### `brop_activate_tab`
Switch to/activate a specific tab.

**Parameters:**
- `tabId` (number): ID of tab to activate

### Element Interaction

#### `brop_click_element`
Click an element using CSS selector.

**Parameters:**
- `selector` (string): CSS selector for element to click
- `tabId` (number, optional): Tab ID (uses active tab if not provided)

**Returns:** Click result with element details and navigation detection

**AI Usage:**
- Use selectors from `brop_get_simplified_content` output
- Element must be visible and clickable
- Automatically detects page navigation after click

#### `brop_type_text`
Type text into an input element.

**Parameters:**
- `selector` (string): CSS selector for input element
- `text` (string): Text to type
- `tabId` (number, optional): Tab ID

**Returns:** Typing result with final input value

**AI Usage:**
- Works with input, textarea, and contentEditable elements
- Triggers proper keyboard events for compatibility
- Can clear existing content first if needed

### JavaScript Execution

#### `brop_execute_script`
Execute JavaScript code in page context with full async/await support.

**Parameters:**
- `script` (string): JavaScript code to execute
- `tabId` (number, optional): Tab ID

**Returns:** Script execution result

**AI Usage Examples:**

```javascript
// Simple data extraction
"document.querySelectorAll('a').length"

// Complex async operations
`async () => {
  await new Promise(r => setTimeout(r, 1000));
  return Array.from(document.querySelectorAll('.item')).map(el => el.textContent);
}`

// Form interaction
`
document.getElementById('username').value = 'user@example.com';
document.getElementById('submit').click();
return 'Form submitted';
`
```

### Console Log Capture

**Important:** Console capture requires explicit session management for reliable log collection.

#### `brop_start_console_capture`
Start collecting console logs using Chrome Debugger API.

**Parameters:**
- `tabId` (number): Tab to start capturing logs from

**Returns:** Capture session started confirmation

**AI Usage:** Always call this before generating logs or navigating to pages where you need console monitoring.

#### `brop_get_console_logs`
Retrieve captured console logs (requires active capture session).

**Parameters:**
- `tabId` (number): Tab to get logs from
- `limit` (number, optional): Maximum logs to return
- `level` (string, optional): Filter by level ("log", "warn", "error", "info", "debug")

**Returns:** Array of console logs with timestamps and source locations

```json
{
  "logs": [
    {
      "level": "error",
      "message": "Network request failed",
      "timestamp": 1234567890,
      "source": "https://example.com/app.js",
      "line": 42,
      "column": 10
    }
  ],
  "total_captured": 5,
  "capture_duration": 5000
}
```

#### `brop_clear_console_logs`
Clear captured logs without stopping capture session.

**Parameters:**
- `tabId` (number): Tab to clear logs for

**AI Usage:** Use this to reset logs at specific checkpoints during automation.

#### `brop_stop_console_capture`
Stop console log collection and detach debugger.

**Parameters:**
- `tabId` (number): Tab to stop capturing for

**AI Usage:** Always call this when done to free up browser resources.

### Server Status

#### `brop_get_server_status`
Get server connection and status information.

**Returns:** Server status including mode, connections, and health

## AI Agent Usage Patterns

### Basic Page Automation

```javascript
// 1. Create or navigate to page
const tab = await brop_create_page({ url: "https://example.com" });

// 2. Get page structure with selectors
const content = await brop_get_simplified_content({ 
  tabId: tab.tabId, 
  format: "markdown" 
});

// 3. Use selectors from content for interaction
await brop_click_element({ 
  tabId: tab.tabId, 
  selector: "#login-btn" 
});

// 4. Fill forms
await brop_type_text({ 
  tabId: tab.tabId, 
  selector: "[name='username']", 
  text: "user@example.com" 
});
```

### Console Log Monitoring

```javascript
// 1. Start capture before generating logs
await brop_start_console_capture({ tabId: tab.tabId });

// 2. Perform actions that might generate logs
await brop_execute_script({ 
  tabId: tab.tabId, 
  script: "console.error('Test error'); fetch('/api/data');" 
});

// 3. Check for errors
const logs = await brop_get_console_logs({ 
  tabId: tab.tabId, 
  level: "error" 
});

// 4. Clean up
await brop_stop_console_capture({ tabId: tab.tabId });
```

### Data Extraction

```javascript
// Extract structured data
const data = await brop_execute_script({
  tabId: tab.tabId,
  script: `
    Array.from(document.querySelectorAll('.product')).map(item => ({
      name: item.querySelector('h2').textContent,
      price: item.querySelector('.price').textContent,
      url: item.querySelector('a').href
    }))
  `
});
```

### Form Automation

```javascript
// Complex form filling
await brop_execute_script({
  tabId: tab.tabId,
  script: `
    // Fill multiple fields
    document.querySelector('[name="email"]').value = 'user@example.com';
    document.querySelector('[name="password"]').value = 'secure123';
    document.querySelector('[name="country"]').value = 'US';
    
    // Submit form
    document.querySelector('form').submit();
    return 'Form submitted successfully';
  `
});
```

## Error Handling

### Common Error Patterns

1. **Extension Not Connected**: Chrome extension isn't loaded or connected
   ```json
   { "error": "Chrome extension not connected" }
   ```
   **Solution**: Check Chrome extension is loaded and bridge server is running

2. **Tab Not Found**: Invalid or closed tab ID
   ```json
   { "error": "Tab 123 not found: No tab with id: 123" }
   ```
   **Solution**: Use `brop_list_tabs` to get valid tab IDs

3. **Element Not Found**: CSS selector doesn't match any elements
   ```json
   { "error": "Element not found: #non-existent" }
   ```
   **Solution**: Use `brop_get_simplified_content` to find correct selectors

4. **Console Capture Not Active**: Trying to get logs without active session
   ```json
   { "error": "No active console capture session for tab 123" }
   ```
   **Solution**: Call `brop_start_console_capture` first

### Retry Strategies

The MCP server includes built-in retry logic for connection issues:
- Automatic reconnection attempts
- Exponential backoff for failed connections
- Extension connection recovery

### Best Practices for AI Agents

1. **Always Check Server Status**: Use `brop_get_server_status` to verify connectivity
2. **Handle Tab Lifecycle**: Create tabs when needed, close when done
3. **Use Console Capture Sessions**: Start/stop capture for specific monitoring periods
4. **Leverage CSS Selectors**: Extract selectors from simplified content for reliable interaction
5. **Error Recovery**: Check for specific error types and retry with different approaches
6. **Resource Cleanup**: Stop console capture sessions to free browser resources

## Development Integration

### Testing Commands

```bash
# Test MCP server
pnpm run mcp

# Test with bridge server
pnpm run dev & pnpm run mcp

# Console capture testing
pnpm run test:console
```

### Debugging

```bash
# Check server logs
pnpm run debug:logs

# Check extension errors
pnpm run debug:errors

# Reload extension if needed
pnpm run debug:reload
```

## Security Considerations

- All operations run within Chrome's security sandbox
- Content Security Policy restrictions apply to some sites
- No access to chrome:// internal pages
- Debugger API requires user permission on first use

## Performance Notes

- Console capture uses Chrome Debugger API (minimal overhead)
- JavaScript execution is optimized for both sync and async operations
- Tab switching has activation overhead for screenshots
- WebSocket communication is efficient for real-time operations

## Advanced Features

### CDP Integration

The MCP server also provides direct Chrome DevTools Protocol access:

- `cdp_execute_command`: Execute raw CDP methods
- `cdp_create_page`: Create page with CDP session
- `cdp_navigate`: Navigate with CDP-level control
- `cdp_evaluate`: JavaScript evaluation with CDP features

### Session Management

- Automatic session recovery on connection loss
- Persistent debugger sessions for console capture
- Efficient resource sharing in relay mode
- Clean shutdown with proper resource cleanup

This documentation provides AI agents with the complete information needed to effectively automate browser tasks using the MCP-BROP server.