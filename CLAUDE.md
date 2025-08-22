# MCP-BROP Development Instructions

MCP-BROP (Model Context Protocol - Browser Remote Operations Protocol) is a browser automation system that bridges Chrome Extension APIs with industry-standard protocols, enabling AI agents and automation tools to control Chrome browsers.

## Development Principles

- Do not call refactored method as "enhanced" or "optimised" just rewrite the old ones, completely replaced them if necessary

## Architecture Overview

### Unified Bridge Server Architecture

The system uses a **unified bridge server** (`bridge/bridge_server.js`) that handles both BROP and CDP protocols without requiring an external Chrome instance:

- **BROP Protocol (Port 9225)**: Native browser automation commands
- **CDP Protocol (Port 9222)**: Chrome DevTools Protocol compatibility for Playwright/Puppeteer
- **Extension Connection (Port 9224)**: WebSocket connection to Chrome extension
- **No External Chrome Required**: Everything routes through Chrome Extension APIs

[... rest of the existing content remains unchanged ...]