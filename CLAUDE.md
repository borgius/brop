# MCP-BROP Development Instructions

MCP-BROP (Model Context Protocol - Browser Remote Operations Protocol) is a browser automation system that bridges Chrome Extension APIs with industry-standard protocols, enabling AI agents and automation tools to control Chrome browsers.

## Development Principles

- Do not call refactored method as "enhanced" or "optimised" just rewrite the old ones, completely replaced them if necessary

## Agent-Based Development Workflow

### Circular Agent Workflow for Feature Implementation

When implementing new features, use the following circular workflow with specialized agents:

1. **chrome-extension-developer**: Implements the initial code
2. **chrome-extension-code-reviewer**: Reviews code against requirements
3. **Loop until approved**: Developer fixes all issues found by reviewer
4. **test-validator-extender**: Tests the implementation
5. **Developer-Tester Feedback Loop**: 
   - When tests fail, developer MUST ask tester for error analysis
   - Tester provides root cause and specific fix locations
   - Developer implements fixes based on tester guidance
   - This loop continues until ALL tests pass
6. **Human review**: Get approval before committing
7. **Git commit**: Commit the completed task

### Workflow Instructions

- Track all progress in `WIP_IMPLEMENTATION.md`
- Each iteration must be documented with agent feedback
- **IMPORTANT**: Developer must engage in dialogue with tester when tests fail
- The developer-tester feedback loop ensures:
  - Clear understanding of failures
  - Targeted fixes based on tester analysis
  - No guessing - ask for specific guidance
- No task proceeds without passing all quality gates:
  - Zero critical issues from reviewer
  - All tests passing (through feedback loop if needed)
  - Human approval received

### Example Feedback Loop

```
Tests Fail → Developer: "What's causing this error?"
→ Tester: "Missing handler in content.js line 111"
→ Developer: Fixes the issue
→ Re-test → If fails, ask again
→ Continue until all tests pass
```

### Current Implementation

**Active Feature**: Browser-Use Style Content Understanding & Highlighting
- Element detection framework (14 layers)
- Confidence scoring system
- Visual highlighting with color-coded overlays
- See `WIP_IMPLEMENTATION.md` for detailed progress

### Git Workflow

- Review unstaged changes: `git status --porcelain`
- One commit per completed task
- Include all contributing agents in commit message

## Architecture Overview

### Unified Bridge Server Architecture

The system uses a **unified bridge server** (`bridge/bridge_server.js`) that handles both BROP and CDP protocols without requiring an external Chrome instance:

- **BROP Protocol (Port 9225)**: Native browser automation commands
- **CDP Protocol (Port 9222)**: Chrome DevTools Protocol compatibility for Playwright/Puppeteer
- **Extension Connection (Port 9224)**: WebSocket connection to Chrome extension
- **No External Chrome Required**: Everything routes through Chrome Extension APIs

[... rest of the existing content remains unchanged ...]