# BROP Protocol Documentation

## Browser Remote Operations Protocol (BROP)

BROP is a WebSocket-based protocol for browser automation that bridges Chrome Extension APIs with external tools, enabling programmatic control of Chrome browsers without requiring CDP debugging ports or special browser configurations.

## Architecture Overview

### System Components

1. **Chrome Extension** (Manifest V3)

   - Service worker handling command execution
   - Content scripts for DOM manipulation
   - Native Chrome Extension API access
   - No special browser flags required

2. **Unified Bridge Server** (Node.js)

   - WebSocket server on port 9225 (BROP clients)
   - Extension connection on port 9224
   - CDP compatibility layer on port 9222
   - Protocol routing and session management

3. **Client Applications**
   - Connect via WebSocket to port 9225
   - Send JSON-formatted BROP commands
   - Receive structured responses

### Message Flow

```
Client → Bridge Server (9225) → Chrome Extension (9224) → Chrome APIs
         ↓                      ↓
    Protocol Router        Command Handlers
                          (BROPServer)
```

## Connection Protocol

### Client Connection

Clients connect to the BROP server via WebSocket:

```javascript
ws://localhost:9225?name=<optional_client_name>
```

Query parameters:

- `name` (optional): Client identifier for logging

### Message Format

All BROP messages use JSON with the following structure:

#### Request

```json
{
  "id": "unique_message_id",
  "method": "command_name",
  "params": {
    // Command-specific parameters
  }
}
```

#### Response

```json
{
  "id": "unique_message_id",
  "success": true,
  "result": {
    // Command-specific result data
  }
}
```

#### Error Response

```json
{
  "id": "unique_message_id",
  "success": false,
  "error": "Error description"
}
```

## BROP Commands

### Tab Management

#### `create_tab`

Creates a new browser tab.

**Parameters:**

- `url` (string, optional): URL to navigate to (default: "about:blank")
- `active` (boolean, optional): Whether to make tab active (default: true)

**Response:**

```json
{
  "success": true,
  "tabId": 123,
  "url": "https://example.com",
  "title": "Example",
  "active": true,
  "status": "complete"
}
```

#### `close_tab`

Closes a specified tab.

**Parameters:**

- `tabId` (number, required): ID of tab to close

**Response:**

```json
{
  "success": true,
  "tabId": 123,
  "action": "closed"
}
```

#### `list_tabs`

Lists all open tabs.

**Parameters:**

- `include_content` (boolean, optional): Include page content (default: false)

**Response:**

```json
{
  "success": true,
  "tabs": [
    {
      "tabId": 123,
      "url": "https://example.com",
      "title": "Example",
      "active": true,
      "status": "complete",
      "windowId": 1,
      "index": 0,
      "pinned": false,
      "accessible": true
    }
  ],
  "activeTabId": 123,
  "totalTabs": 1,
  "accessibleTabs": 1
}
```

#### `activate_tab`

Makes a tab active (brings to foreground).

**Parameters:**

- `tabId` (number, required): ID of tab to activate

**Response:**

```json
{
  "success": true,
  "tabId": 123,
  "url": "https://example.com",
  "title": "Example",
  "action": "activated"
}
```

### Navigation

#### `navigate`

Navigates a tab to a URL.

**Parameters:**

- `url` (string, required): URL to navigate to
- `tabId` (number, optional): Tab to navigate (uses active tab if not specified)
- `create_new_tab` (boolean, optional): Create new tab for navigation
- `close_tab` (boolean, optional): Close tab after navigation

**Response:**

```json
{
  "success": true,
  "action": "navigated",
  "tabId": 123,
  "url": "https://example.com",
  "title": "Example"
}
```

### Form Interaction

#### `fill_form`

Fills form fields with provided data and optionally submits the form.

**Parameters:**

- `tabId` (number, required): Tab containing the form
- `formData` (object, required): Key-value pairs of field names/values to fill
- `submit` (boolean, optional): Submit the form after filling (default: false)
- `formSelector` (string, optional): CSS selector to target specific form

**Form Data Format:**

The `formData` object uses field identifiers as keys. Fields are located using:
1. `name` attribute
2. `id` attribute
3. `data-testid` attribute
4. Placeholder text (partial match)
5. Associated label text

**Response:**

```json
{
  "success": true,
  "tabId": 123,
  "filledFields": 4,
  "totalFields": 5,
  "filled": [
    {
      "key": "username",
      "fieldName": "username",
      "fieldType": "text",
      "value": "john.doe"
    },
    {
      "key": "email",
      "fieldName": "email",
      "fieldType": "email",
      "value": "john@example.com"
    }
  ],
  "errors": ["Field not found: invalid_field"],
  "submitted": true,
  "formFound": true
}
```

**Example Usage:**

```json
{
  "method": "fill_form",
  "params": {
    "tabId": 123,
    "formData": {
      "username": "john.doe",
      "email": "john@example.com",
      "password": "secure123",
      "country": "USA",
      "newsletter": true,
      "comments": "This is a test"
    },
    "submit": true
  }
}
```

**Field Type Handling:**

- **Text inputs**: Set as string value
- **Checkboxes/Radio**: Set with boolean or 'true'/'false'/'on'/'off'
- **Select**: Match by option value or text
- **Textarea**: Set as string value
- **File inputs**: Cannot be set (security restriction)

**Notes:**

- Events (`input` and `change`) are triggered after setting values
- If no form selector provided, fields are searched document-wide
- Form is automatically detected from filled fields
- Submit clicks button or calls form.submit()

### Content Extraction

#### `get_page_content`

Retrieves HTML and text content from a page.

**Parameters:**

- `tabId` (number, required): Tab to extract content from

**Response:**

```json
{
  "html": "<html>...</html>",
  "text": "Page text content...",
  "title": "Page Title",
  "url": "https://example.com"
}
```

#### `get_simplified_dom`

Extracts simplified content using Readability or converts to Markdown with Turndown.

**Parameters:**

- `tabId` (number, required): Tab to extract from
- `format` (string, optional): "markdown" or "html" (default: "markdown")
- `enableDetailedResponse` (boolean, optional): Include full document (default: false)
- `includeSelectors` (boolean, optional): Include CSS selectors for actionable elements (default: true)

**Response:**

```json
{
  "markdown": "# Page Title\n\nContent with [link](url)<!--#linkId--> and [button]<!--.btn-primary-->...",
  "title": "Page Title",
  "url": "https://example.com",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "stats": {
    "source": "turndown_main",
    "markdownLength": 1234,
    "processed": true
  },
  "tabId": 123,
  "format": "markdown"
}
```

#### `get_element`

Finds and retrieves detailed information about DOM elements using CSS selectors.

**Parameters:**

- `tabId` (number, required): Tab to search in
- `selector` (string, required): CSS selector to find elements
- `multiple` (boolean, optional): Return all matching elements (default: false)

**Response (single element):**

```json
{
  "success": true,
  "selector": "#submit-button",
  "tabId": 123,
  "found": 1,
  "element": {
    "tagName": "button",
    "id": "submit-button",
    "className": "btn btn-primary",
    "classList": ["btn", "btn-primary"],
    "textContent": "Submit",
    "innerHTML": "Submit",
    "isVisible": true,
    "isClickable": true,
    "boundingBox": {
      "x": 100,
      "y": 200,
      "width": 80,
      "height": 40,
      "top": 200,
      "right": 180,
      "bottom": 240,
      "left": 100
    },
    "computedStyle": {
      "display": "block",
      "visibility": "visible",
      "opacity": "1",
      "color": "rgb(255, 255, 255)",
      "backgroundColor": "rgb(0, 123, 255)",
      "fontSize": "16px",
      "cursor": "pointer"
    },
    "attributes": {
      "id": "submit-button",
      "class": "btn btn-primary",
      "type": "submit"
    },
    "parentTagName": "form",
    "childrenCount": 0,
    "role": "button",
    "ariaLabel": "Submit form"
  }
}
```

**Response (multiple elements):**

```json
{
  "success": true,
  "selector": ".menu-item",
  "tabId": 123,
  "found": 3,
  "elements": [
    {
      "tagName": "li",
      "className": "menu-item",
      // ... element details
    },
    // ... more elements
  ]
}
```

**Element Details Include:**

- Basic properties: tagName, id, className, classList
- Content: textContent, innerHTML, value (for inputs)
- Attributes: all HTML attributes
- State: disabled, checked, selected, readOnly
- Position: boundingBox with coordinates and dimensions
- Visibility: isVisible, isClickable
- Computed styles: display, visibility, color, background, etc.
- Parent/child info: parentTagName, childrenCount
- Form properties: type, name, placeholder, required, pattern, min/max
- ARIA properties: role, ariaLabel, ariaDescribedBy, ariaLabelledBy
- Data attributes: all data-* attributes
- Select options: for select elements, includes all options

### Screenshot Capture

#### `get_screenshot`

Captures a screenshot of the visible tab area.

**Parameters:**

- `tabId` (number, required): Tab to capture
- `format` (string, optional): "png" or "jpeg" (default: "png")
- `full_page` (boolean, optional): Capture full page (not implemented)

**Response:**

```json
{
  "image_data": "base64_encoded_image_data",
  "format": "png",
  "tabId": 123,
  "tab_title": "Page Title",
  "tab_url": "https://example.com"
}
```

### Console Operations

#### `get_console_logs`

Retrieves console logs from a tab.

**Parameters:**

- `tabId` (number, required): Tab to get logs from
- `limit` (number, optional): Maximum logs to return (default: 100)
- `level` (string, optional): Filter by log level

**Response:**

```json
{
  "logs": [
    {
      "level": "info",
      "message": "Console message",
      "timestamp": 1234567890,
      "source": "runtime_messaging_primary"
    }
  ],
  "source": "runtime_messaging_primary",
  "tab_title": "Page Title",
  "tab_url": "https://example.com",
  "timestamp": 1234567890,
  "total_captured": 1,
  "method": "runtime_messaging_only"
}
```

#### `execute_console`

Executes safe console operations in a tab.

**Parameters:**

- `code` (string, required): Code to execute
- `tabId` (number, required): Tab to execute in

**Response:**

```json
{
  "result": "Execution result"
}
```

**Note:** Due to CSP restrictions, only safe operations are supported:

- `document.title`
- `window.location.href`
- `document.readyState`
- `console.log(...)` statements

### Extension Management

#### `get_extension_version`

Gets extension version information.

**Response:**

```json
{
  "success": true,
  "result": {
    "extension_version": "1.0.0",
    "extension_name": "BROP Extension",
    "target_event_blocking_active": true,
    "manifest_version": 3,
    "timestamp": 1234567890
  }
}
```

#### `get_extension_errors`

Retrieves extension error logs.

**Parameters:**

- `limit` (number, optional): Maximum errors to return (default: 50)

**Response:**

```json
{
  "errors": [
    {
      "id": "error_123",
      "timestamp": 1234567890,
      "type": "Error Type",
      "message": "Error message",
      "stack": "Stack trace...",
      "url": "Extension Background",
      "userAgent": "User agent string",
      "context": {}
    }
  ],
  "total_errors": 1,
  "max_stored": 100,
  "extension_info": {
    "name": "BROP Extension",
    "version": "1.0.0",
    "id": "extension_id"
  }
}
```

#### `clear_extension_errors`

Clears extension error logs.

**Parameters:**

- `clearLogs` (boolean, optional): Also clear call logs

**Response:**

```json
{
  "success": true,
  "cleared_errors": 10,
  "message": "Cleared 10 extension errors"
}
```

#### `reload_extension`

Reloads the Chrome extension.

**Parameters:**

- `reason` (string, optional): Reason for reload
- `delay` (number, optional): Delay before reload in ms (default: 1000)

**Response:**

```json
{
  "success": true,
  "message": "Extension will reload in 1000ms",
  "reason": "Manual reload requested",
  "scheduled_time": 1234567890
}
```

### Server Status

#### `get_server_status`

Gets bridge server status information.

**Response:**

```json
{
  "success": true,
  "message": "Server status request forwarded to bridge",
  "note": "This command is handled by the bridge server directly"
}
```

## Error Handling

### Common Errors

1. **Extension Not Connected**

   ```json
   {
     "success": false,
     "error": "Chrome extension not connected"
   }
   ```

2. **Tab Not Found**

   ```json
   {
     "success": false,
     "error": "Tab 123 not found: No tab with id: 123"
   }
   ```

3. **Inaccessible URL**

   ```json
   {
     "success": false,
     "error": "Cannot access chrome:// URL: chrome://extensions/"
   }
   ```

4. **Command Not Supported**
   ```json
   {
     "success": false,
     "error": "Unsupported BROP command: unknown_command"
   }
   ```

## CSS Selectors for AI Reference

When `includeSelectors` is `true` in the `get_simplified_dom` command, the Markdown output includes CSS selectors for actionable elements embedded in HTML comments. This enables AI agents to reference specific elements for automation tasks.

For comprehensive documentation on the markdown format with CSS selectors, see [MARKDOWN_FORMAT_GUIDE.md](./MARKDOWN_FORMAT_GUIDE.md).

### Quick Reference

Selectors are appended to actionable elements in HTML comments:
- Links: `[text](url)<!--#elementId-->`
- Buttons: `[button text]<!--.button-class-->`
- Inputs: `[type: placeholder]<!--[name="username"]-->`
- Textareas: `[textarea: content]<!--#comments-->`
- Selects: `[select-one: options...]<!--[name="country"]-->`

### Selector Priority

The system uses a priority order to select the most reliable selector:
1. **ID**: `#elementId` (most reliable)
2. **aria-label**: `[aria-label="Button Label"]`
3. **data-testid**: `[data-testid="submit-button"]`
4. **name**: `[name="username"]` (for form elements)
5. **Class**: `.primary-button` (first meaningful class)
6. **Text content**: `button:contains("Click me")`
7. **nth-child**: `button:nth-child(3)` (last resort)

### Example Output

```markdown
# Welcome Page

Please [Sign In](https://example.com/login)<!--#signin-link--> or 
[Register]<!--[aria-label="Create new account"]--> to continue.

Fill in your details:
[text: Email]<!--[name="email"]-->
[password: Password]<!--#password-field-->

[Submit]<!--.submit-button-->
```

### Actionable Elements

CSS selectors are added to:
- Links (`<a>`)
- Buttons (`<button>`)
- Inputs (`<input>`, `<textarea>`, `<select>`)
- Elements with `onclick` handlers
- Elements with `role` attributes
- Elements with `tabindex`
- Labels (`<label>`)
- Elements with `cursor: pointer` style

## Protocol Features

### Connection Management

- Automatic reconnection with exponential backoff
- Connection status tracking
- Named client connections for better debugging

### Message Routing

- Unique message ID tracking
- Request/response correlation
- Proper error propagation

### Logging and Debugging

- Comprehensive command logging
- Error collection and reporting
- Debug endpoints for troubleshooting

### Security

- Chrome Extension sandboxing
- CSP-compliant code execution
- No debugger API requirement

## Implementation Notes

### Chrome Extension Limitations

- Cannot access `chrome://` URLs
- Content Security Policy restrictions
- Limited to Chrome Extension API capabilities

### Performance Considerations

- WebSocket message size limits
- Chrome Extension API rate limits
- Tab activation overhead for screenshots

### Best Practices

1. Always check tab accessibility before operations
2. Handle connection errors gracefully
3. Use appropriate timeouts for long operations
4. Clean up tabs when done

## Example Client Implementation

```javascript
const WebSocket = require("ws");

class BROPClient {
  constructor() {
    this.ws = new WebSocket("ws://localhost:9225?name=example_client");
    this.messageId = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        const response = JSON.parse(data);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.success) {
            pending.resolve(response.result || response);
          } else {
            pending.reject(new Error(response.error));
          }
        }
      });
    });
  }

  async sendCommand(method, params = {}) {
    const id = `msg_${++this.messageId}`;
    const message = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  async createTab(url) {
    return this.sendCommand("create_tab", { url });
  }

  async getPageContent(tabId) {
    return this.sendCommand("get_page_content", { tabId });
  }
}

// Usage
const client = new BROPClient();
await client.connect();
const tab = await client.createTab("https://example.com");
const content = await client.getPageContent(tab.tabId);
```

## Debugging

### Bridge Server Logs

Access logs via HTTP endpoint:

```
http://localhost:9222/logs?limit=50
```

### Extension Errors

Use BROP commands:

- `get_extension_errors` - View errors
- `clear_extension_errors` - Clear errors
- `reload_extension` - Reload if needed

### Connection Issues

1. Check Chrome extension is loaded
2. Verify bridge server is running
3. Ensure ports 9224 and 9225 are available
4. Check WebSocket connection status
