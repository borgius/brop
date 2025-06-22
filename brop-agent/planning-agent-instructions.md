# Planning and Execution Agent System for Browser Automation

## Overview

This document defines a multi-agent system for browser automation that:
1. Creates detailed execution plans
2. Stores plans in memory for tracking
3. Executes plans step-by-step using BROP tools
4. Reports progress and handles failures
5. Updates memory with results

## Agent Architecture

### 1. Planning Agent
**Role**: Analyzes user requests and creates detailed, executable plans

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { openai } from "@ai-sdk/openai";

const planningMemory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      use: "tool-call",
      template: `
# Current Plan

## Task: {{taskName}}
## Status: {{status}}
## Created: {{timestamp}}

## Steps:
{{#each steps}}
- [ ] Step {{number}}: {{description}}
  - Status: {{status}}
  - Tool: {{tool}}
  - Parameters: {{parameters}}
  - Result: {{result}}
  - Error: {{error}}
{{/each}}

## Context:
- User Credentials Required: {{credentialsNeeded}}
- Current URL: {{currentUrl}}
- Session State: {{sessionState}}
`
    }
  }
});

export const planningAgent = new Agent({
  name: "Planning Agent",
  instructions: `
You are a planning agent that creates detailed, executable plans for browser automation tasks.

## CRITICAL REQUIREMENT: Always Use Simplified DOM

**IMPORTANT**: For EVERY page interaction, you MUST first use get_simplified_dom to:
1. Get the page structure in markdown format
2. Identify available elements with their CSS selectors
3. Understand the current page content and state

The simplified DOM will return markdown like:
\`\`\`
# Page Title

## Navigation
- [Home](css:a.nav-home)
- [Profile](css:a.nav-profile)

## Main Content
### Search Section
- Input: [Search box](css:input#search-input) - Current value: ""
- Button: [Search](css:button.search-btn)

### Results
- [Result 1 Title](css:.result-item:nth-child(1) h3)
  - [Follow button](css:.result-item:nth-child(1) button.follow-btn)
\`\`\`

## Your Process:

1. **Analyze the Request**
   - Break down the user's goal into atomic, executable steps
   - ALWAYS include get_simplified_dom before any interaction
   - Use the DOM content to determine what to click or where to type

2. **Create Detailed Plan**
   Each interaction step MUST follow this pattern:
   a. Use get_simplified_dom to see current page state
   b. Analyze the markdown to find the right element
   c. Use the CSS selector from the markdown to interact
   d. Verify the action succeeded

3. **Available BROP Tools**:
   - navigate_to_url: Navigate to a specific URL
   - get_simplified_dom: **USE THIS BEFORE EVERY INTERACTION** - Returns markdown with CSS selectors
   - get_page_content: Extract readable content from current page
   - click_element: Click using CSS selectors from simplified DOM
   - type_text: Type into inputs using CSS selectors from simplified DOM
   - get_screenshot: Capture current state
   - execute_console: Run JavaScript for complex interactions
   - create_tab/close_tab: Manage browser tabs
   - list_tabs: Get current tab information

4. **Plan Structure Example**:
   {
     "taskName": "Subscribe to AI influencers on LinkedIn",
     "steps": [
       {
         "number": 1,
         "description": "Navigate to LinkedIn homepage",
         "tool": "navigate_to_url",
         "parameters": { "url": "https://www.linkedin.com" },
         "successCriteria": "Page title contains 'LinkedIn'"
       },
       {
         "number": 2,
         "description": "Check if user is signed in",
         "tool": "get_simplified_dom",
         "parameters": {},
         "successCriteria": "Find profile menu or sign-in button",
         "conditional": {
           "if": "not signed in",
           "then": "steps 3-4",
           "else": "step 5"
         }
       }
     ]
   }

5. **Important Considerations**:
   - Always check authentication state before proceeding
   - Include error recovery steps
   - Add verification steps after actions
   - Consider rate limiting for social platforms
   - Plan for dynamic content loading
   - Include data extraction steps where needed

Output your plan in the structured format above.
`,
  model: openai("gpt-4o"),
  memory: planningMemory
});
```

### 2. Execution Agent
**Role**: Executes plan steps and reports progress

```typescript
export const executionAgent = new Agent({
  name: "Execution Agent",
  instructions: `
You are an execution agent that carries out browser automation plans step by step.

## CRITICAL: Always Get DOM First

**BEFORE ANY INTERACTION**, you MUST:
1. Use get_simplified_dom to see the current page in markdown format
2. The markdown will show all interactive elements with CSS selectors like [Button Text](css:button.class-name)
3. Use these exact CSS selectors for clicking or typing

## Your Responsibilities:

1. **Execute Steps Sequentially**
   - ALWAYS start with get_simplified_dom
   - Read the simplified DOM markdown carefully
   - Find the element mentioned in the step using the markdown content
   - Use the CSS selector provided in the markdown
   - Example flow:
     * Step says "Click the Sign In button"
     * Use get_simplified_dom
     * Find "[Sign In](css:button.signin-btn)" in the markdown
     * Use click_element with selector "button.signin-btn"

2. **Element Selection**
   - The simplified DOM provides exact CSS selectors
   - For "Type email in login field":
     * Get DOM → Find "[Email input](css:input#email)" → type_text with "input#email"
   - For "Click Subscribe button for John Doe":
     * Get DOM → Find the right section → Use the specific selector

3. **Error Handling**
   - If element not found, get fresh DOM (page may have changed)
   - Look for alternative text or nearby elements
   - Report what you see vs what you expected

4. **Dynamic Content**
   - After navigation or actions, always get fresh DOM
   - Wait for content to load if needed
   - The DOM will show current values in inputs

5. **Data Collection**
   - Extract data directly from the simplified DOM markdown
   - Current values are shown like: "Current value: 'example@email.com'"
   - Structure extracted data for the final report

REMEMBER: Never guess selectors. Always use get_simplified_dom first!
`,
  model: openai("gpt-4o"),
  tools: mcpBropTools, // All BROP MCP tools
  memory: executionMemory
});
```

### 3. Monitoring Agent
**Role**: Tracks overall progress and handles user interactions

```typescript
export const monitoringAgent = new Agent({
  name: "Monitoring Agent",
  instructions: `
You are a monitoring agent that oversees the execution of browser automation plans.

## Your Tasks:

1. **Progress Tracking**
   - Monitor execution status
   - Calculate completion percentage
   - Estimate time remaining

2. **User Communication**
   - Request credentials when needed
   - Report significant progress milestones
   - Handle user interruptions

3. **Quality Assurance**
   - Verify data quality
   - Ensure all required data is collected
   - Validate final results

4. **Final Reporting**
   Format and present results clearly:
   - Summary of completed actions
   - Collected data in requested format
   - Any errors or partial failures
   - Recommendations for next steps

Keep the user informed without overwhelming them with details.
`,
  model: openai("gpt-4o"),
  memory: monitoringMemory
});
```

## Example: LinkedIn AI Influencer Subscription

### User Request
"Subscribe to top AI influencers on LinkedIn"

### Generated Plan

```json
{
  "taskName": "Subscribe to top AI influencers on LinkedIn",
  "estimatedDuration": "5-10 minutes",
  "steps": [
    {
      "number": 1,
      "description": "Navigate to LinkedIn homepage",
      "tool": "navigate_to_url",
      "parameters": { "url": "https://www.linkedin.com" },
      "successCriteria": "LinkedIn page loaded"
    },
    {
      "number": 2,
      "description": "Check authentication status",
      "tool": "get_simplified_dom",
      "parameters": {},
      "successCriteria": "Determine if signed in",
      "dataExtraction": ["isSignedIn", "profileMenuVisible"]
    },
    {
      "number": 3,
      "description": "Request credentials if not signed in",
      "tool": "user_interaction",
      "parameters": { "request": "LinkedIn credentials" },
      "conditional": true,
      "skipIf": "isSignedIn === true"
    },
    {
      "number": 4,
      "description": "Sign in to LinkedIn",
      "tool": "sequence",
      "subSteps": [
        {
          "tool": "type_text",
          "parameters": { 
            "selector": "input[name='session_key']",
            "text": "{{email}}"
          }
        },
        {
          "tool": "type_text",
          "parameters": { 
            "selector": "input[name='session_password']",
            "text": "{{password}}"
          }
        },
        {
          "tool": "click_element",
          "parameters": { 
            "selector": "button[type='submit']"
          }
        }
      ],
      "conditional": true,
      "skipIf": "isSignedIn === true"
    },
    {
      "number": 5,
      "description": "Navigate to search with AI filter",
      "tool": "navigate_to_url",
      "parameters": { 
        "url": "https://www.linkedin.com/search/results/content/?keywords=AI&sortBy=date&datePosted=past-week"
      },
      "successCriteria": "Search results loaded"
    },
    {
      "number": 6,
      "description": "Get simplified DOM to find post authors",
      "tool": "get_simplified_dom",
      "parameters": {},
      "successCriteria": "Markdown shows post authors with profile links"
    },
    {
      "number": 7,
      "description": "Extract author information from DOM",
      "tool": "execute_console",
      "parameters": {
        "note": "Parse the markdown from previous step to extract author data"
      },
      "successCriteria": "List of authors with profile URLs extracted",
      "dataExtraction": ["authorsList"]
    },
    {
      "number": 8,
      "description": "Process each author profile",
      "tool": "loop",
      "loopOver": "authorsList",
      "subSteps": [
        {
          "description": "Navigate to author profile",
          "tool": "navigate_to_url",
          "parameters": { "url": "{{author.profileUrl}}" }
        },
        {
          "description": "Get profile page DOM",
          "tool": "get_simplified_dom",
          "parameters": {}
        },
        {
          "description": "Find and click follow/connect button from DOM",
          "tool": "click_element",
          "parameters": { 
            "note": "Use selector from simplified DOM for Follow/Connect button"
          },
          "errorHandling": "continue"
        },
        {
          "description": "Extract profile details from DOM",
          "tool": "get_page_content",
          "dataExtraction": ["followerCount", "bio"]
        }
      ]
    },
    {
      "number": 9,
      "description": "Compile final report",
      "tool": "data_processing",
      "parameters": {
        "format": "summary",
        "includeFields": ["name", "profileUrl", "title", "followStatus"]
      }
    }
  ],
  "rollbackStrategy": {
    "onError": "pause_and_report",
    "saveProgress": true
  }
}
```

## Execution Flow

```typescript
// Main orchestration function
async function executeLinkedInSubscription(userRequest: string) {
  // Step 1: Generate plan
  const plan = await planningAgent.generate(
    `Create a detailed plan for: ${userRequest}`,
    { output: planSchema }
  );

  // Step 2: Store plan in memory
  await planningAgent.memory.store({
    threadId: "linkedin-task-001",
    plan: plan.object,
    status: "initialized"
  });

  // Step 3: Execute plan
  const results = [];
  for (const step of plan.object.steps) {
    // Update status
    await monitoringAgent.generate(
      `Report progress: Starting step ${step.number}: ${step.description}`
    );

    // Execute step
    const stepResult = await executionAgent.generate(
      `Execute step: ${JSON.stringify(step)}`,
      { 
        tools: mcpBropTools,
        maxSteps: 3 // Allow retries
      }
    );

    // Store result
    results.push({
      step: step.number,
      status: stepResult.success ? "completed" : "failed",
      data: stepResult.data
    });

    // Update memory
    await executionAgent.memory.update({
      threadId: "linkedin-task-001",
      stepResults: results
    });

    // Handle failures
    if (!stepResult.success && step.required) {
      await monitoringAgent.generate(
        `Critical step failed: ${step.description}. ${stepResult.error}`
      );
      break;
    }
  }

  // Step 4: Generate final report
  const report = await monitoringAgent.generate(
    `Create final report from results: ${JSON.stringify(results)}`,
    { output: reportSchema }
  );

  return report.object;
}
```

## Required BROP Tool Extensions

### 1. Enhanced Element Selection
```typescript
export const findElementByText = createTool({
  id: "find-element-by-text",
  description: "Find element containing specific text",
  inputSchema: z.object({
    text: z.string(),
    elementType: z.string().optional()
  }),
  execute: async ({ context }) => {
    const script = `
      Array.from(document.querySelectorAll('${context.elementType || '*'}'))
        .find(el => el.textContent.includes('${context.text}'))
        ?.getBoundingClientRect();
    `;
    return await executeBrowserScript(script);
  }
});
```

### 2. Wait for Dynamic Content
```typescript
export const waitForElement = createTool({
  id: "wait-for-element",
  description: "Wait for element to appear",
  inputSchema: z.object({
    selector: z.string(),
    timeout: z.number().default(5000)
  }),
  execute: async ({ context }) => {
    const script = `
      new Promise((resolve) => {
        const check = setInterval(() => {
          const element = document.querySelector('${context.selector}');
          if (element) {
            clearInterval(check);
            resolve(true);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          resolve(false);
        }, ${context.timeout});
      });
    `;
    return await executeBrowserScript(script);
  }
});
```

### 3. Structured Data Extraction
```typescript
export const extractStructuredData = createTool({
  id: "extract-structured-data",
  description: "Extract data matching a schema",
  inputSchema: z.object({
    selectors: z.record(z.string()),
    multiple: z.boolean().optional()
  }),
  execute: async ({ context }) => {
    const script = `
      const extract = (element) => ({
        ${Object.entries(context.selectors)
          .map(([key, selector]) => 
            `${key}: element.querySelector('${selector}')?.textContent?.trim()`
          ).join(',\n')}
      });
      
      ${context.multiple ? 
        `Array.from(document.querySelectorAll('.result-item')).map(extract)` :
        `extract(document)`
      }
    `;
    return await executeBrowserScript(script);
  }
});
```

## Memory Schema

```typescript
const planMemorySchema = z.object({
  taskId: z.string(),
  taskName: z.string(),
  status: z.enum(["planning", "executing", "completed", "failed"]),
  plan: z.object({
    steps: z.array(z.object({
      number: z.number(),
      description: z.string(),
      tool: z.string(),
      parameters: z.any(),
      status: z.enum(["pending", "in_progress", "completed", "failed"]),
      result: z.any().optional(),
      error: z.string().optional()
    }))
  }),
  progress: z.object({
    completedSteps: z.number(),
    totalSteps: z.number(),
    percentComplete: z.number(),
    estimatedTimeRemaining: z.string().optional()
  }),
  collectedData: z.any(),
  finalReport: z.any().optional()
});
```

## Usage Example

```typescript
// Initialize the system
const browserAutomation = new BrowserAutomationSystem({
  agents: {
    planner: planningAgent,
    executor: executionAgent,
    monitor: monitoringAgent
  },
  tools: {
    ...mcpBropTools,
    findElementByText,
    waitForElement,
    extractStructuredData
  }
});

// Execute a task
const result = await browserAutomation.execute({
  task: "Subscribe to top AI influencers on LinkedIn",
  options: {
    maxInfluencers: 10,
    reportFormat: "detailed",
    saveScreenshots: true
  }
});

console.log(result);
// Output:
// {
//   success: true,
//   subscribed: [
//     { name: "Andrew Ng", profileUrl: "...", followers: "2.1M" },
//     { name: "Yann LeCun", profileUrl: "...", followers: "850K" },
//     ...
//   ],
//   errors: [],
//   screenshots: ["step1.png", "step5.png", ...],
//   executionTime: "4m 32s"
// }
```

## Best Practices

1. **Plan Granularity**: Break tasks into atomic, verifiable steps
2. **Error Recovery**: Always include fallback strategies
3. **User Privacy**: Never log sensitive credentials
4. **Rate Limiting**: Add delays between actions on social platforms
5. **Progress Updates**: Report meaningful milestones to users
6. **Data Validation**: Verify extracted data before proceeding
7. **Session Management**: Handle authentication states properly
8. **Memory Efficiency**: Clean up completed task data periodically

## Next Steps

1. Implement specialized agents for different platforms (LinkedIn, Twitter, etc.)
2. Add visual debugging with screenshot analysis
3. Create reusable plan templates for common tasks
4. Implement parallel execution for independent steps
5. Add machine learning for selector adaptation