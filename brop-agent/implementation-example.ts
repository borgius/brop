import { openai } from "@ai-sdk/openai";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { MCPClient } from "@mastra/mcp";
import { Memory } from "@mastra/memory";
import { z } from "zod";

// Initialize MCP client for BROP tools
const mcpClient = new MCPClient({
	servers: {
		brop: {
			command: "node",
			args: ["./bridge/mcp-server.js"],
		},
	},
});

// Get BROP tools
const bropTools = await mcpClient.getTools();

// Define schemas for structured data
const planStepSchema = z.object({
	number: z.number(),
	description: z.string(),
	tool: z.string(),
	parameters: z.any(),
	successCriteria: z.string(),
	status: z
		.enum(["pending", "in_progress", "completed", "failed"])
		.default("pending"),
	result: z.any().optional(),
	error: z.string().optional(),
	conditional: z
		.object({
			if: z.string(),
			then: z.string(),
			else: z.string(),
		})
		.optional(),
});

const executionPlanSchema = z.object({
	taskId: z.string(),
	taskName: z.string(),
	estimatedDuration: z.string(),
	steps: z.array(planStepSchema),
	rollbackStrategy: z.object({
		onError: z.enum(["continue", "pause_and_report", "rollback"]),
		saveProgress: z.boolean(),
	}),
});

// Memory configuration for planning agent
const planningMemory = new Memory();

// Planning Agent
export const planningAgent = new Agent({
	name: "Browser Planning Agent",
	instructions: `
You are an expert planning agent for browser automation tasks. Create detailed, executable plans.

## Planning Guidelines:

1. Break down tasks into atomic steps that use specific BROP tools
2. Each step must have clear success criteria
3. Include conditional logic for authentication and error handling
4. Consider dynamic content and loading times

## Available BROP Tools:
- navigate_to_url: Navigate to any URL
- get_page_content: Extract readable content
- get_simplified_dom: Get structured DOM for element selection
- click_element: Click buttons, links, etc.
- type_text: Fill in forms and inputs
- execute_console: Run custom JavaScript
- get_screenshot: Capture current state
- list_tabs/create_tab/close_tab: Tab management

## Output Format:
Create plans following the executionPlanSchema with detailed steps.

Example for LinkedIn task:
1. Navigate to LinkedIn
2. Check authentication (conditional)
3. Sign in if needed (conditional)
4. Search for content
5. Extract author data
6. Visit each profile
7. Click follow/subscribe
8. Compile results

Always consider edge cases and include verification steps.
`,
	model: openai("gpt-4o"),
	memory: planningMemory,
});

// Execution Agent with BROP tools
export const executionAgent = new Agent({
	name: "Browser Execution Agent",
	instructions: `
You are a browser automation execution specialist. Execute plans step-by-step using BROP tools.

## Execution Process:

1. Read the current step from the plan
2. Use the appropriate BROP tool with correct parameters
3. Verify the result matches success criteria
4. Handle errors gracefully
5. Update progress in memory

## Error Handling:
- If element not found, try alternative selectors
- If page not loaded, wait and retry
- If action fails, capture screenshot for debugging

## Data Extraction:
When extracting data, use execute_console for complex queries:
- Get multiple elements
- Extract structured data
- Handle dynamic content

Always update step status and store results.
`,
	model: openai("gpt-4o"),
	tools: bropTools,
});

// Monitoring Agent
export const monitoringAgent = new Agent({
	name: "Progress Monitoring Agent",
	instructions: `
You are a progress monitoring agent. Track execution and communicate with users.

## Responsibilities:

1. Track overall progress percentage
2. Report milestones to user
3. Request user input when needed (credentials, confirmations)
4. Format final results clearly

## Progress Reporting Format:
"Task: [Name] - [X%] complete
Current: [Current step description]
Collected: [X] items so far"

## Final Report Format:
- Summary of actions taken
- List of collected data
- Any errors encountered
- Recommendations

Keep updates concise but informative.
`,
	model: openai("gpt-4o-mini"),
});

// Custom tools for enhanced functionality
const waitForElementTool = createTool({
	id: "wait-for-element",
	description: "Wait for an element to appear on the page",
	inputSchema: z.object({
		selector: z.string().describe("CSS selector or XPath"),
		timeout: z.number().default(5000).describe("Max wait time in ms"),
	}),
	execute: async ({ context }) => {
		const result = await bropTools.execute_console.execute({
			context: {
				javascript: `
          await new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
              const element = document.querySelector('${context.selector}');
              if (element) {
                clearInterval(checkInterval);
                resolve({ found: true, element: element.outerHTML });
              } else if (Date.now() - startTime > ${context.timeout}) {
                clearInterval(checkInterval);
                resolve({ found: false, timeout: true });
              }
            }, 100);
          });
        `,
			},
		});
		return result;
	},
});

const extractProfileDataTool = createTool({
	id: "extract-profile-data",
	description: "Extract structured data from social media profiles",
	inputSchema: z.object({
		platform: z.enum(["linkedin", "twitter", "github"]),
		dataPoints: z
			.array(z.string())
			.describe("Data to extract: name, bio, followers, etc."),
	}),
	execute: async ({ context }) => {
		const selectors = {
			linkedin: {
				name: ".text-heading-xlarge",
				title: ".text-body-medium",
				followers: ".pvs-header__subtitle",
				bio: ".pv-about-section",
			},
			twitter: {
				name: "[data-testid='UserName']",
				bio: "[data-testid='UserDescription']",
				followers: "a[href$='/followers'] span",
			},
			github: {
				name: ".vcard-fullname",
				bio: ".user-profile-bio",
				followers: "a[href$='followers'] span",
			},
		};

		const platformSelectors = selectors[context.platform];
		const extractScript = `
      const data = {};
      ${context.dataPoints
				.map(
					(point: string) => `
        const ${point}Element = document.querySelector('${platformSelectors[point] || ""}');
        data['${point}'] = ${point}Element?.textContent?.trim() || null;
      `,
				)
				.join("\n")}
      return data;
    `;

		return await bropTools.execute_console.execute({
			context: { javascript: extractScript },
		});
	},
});

// Main orchestration class
class BrowserAutomationSystem {
	private planningAgent = planningAgent;
	private executionAgent = executionAgent;
	private monitoringAgent = monitoringAgent;

	constructor() {
		// Agents are initialized above
	}

	async execute(request: {
		task: string;
		options?: {
			maxItems?: number;
			reportFormat?: "summary" | "detailed";
			saveScreenshots?: boolean;
		};
	}) {
		const taskId = `task-${Date.now()}`;
		const threadId = `thread-${taskId}`;

		try {
			// Step 1: Generate execution plan
			console.log("🤖 Planning task...");
			const planResponse = await this.planningAgent.generate(
				`Create a detailed execution plan for: ${request.task}`,
				{
					output: executionPlanSchema,
					threadId,
					resourceId: taskId,
				},
			);

			const plan = planResponse.object;
			console.log(`📋 Plan created with ${plan.steps.length} steps`);

			// Step 2: Initialize monitoring
			await this.monitoringAgent.generate(
				`Task started: ${plan.taskName}\nEstimated duration: ${plan.estimatedDuration}`,
				{ threadId, resourceId: taskId },
			);

			// Step 3: Execute plan step by step
			const results = [];
			let collectedData = {};

			for (const step of plan.steps) {
				// Update progress
				const progress = Math.round((step.number / plan.steps.length) * 100);
				await this.monitoringAgent.generate(
					`Progress: ${progress}%\nExecuting: ${step.description}`,
					{ threadId, resourceId: taskId },
				);

				// Execute step
				console.log(`\n🔄 Executing step ${step.number}: ${step.description}`);

				try {
					const stepResult = await this.executionAgent.generate(
						`Execute this step using the ${step.tool} tool: ${JSON.stringify(step)}`,
						{
							threadId,
							resourceId: taskId,
							maxSteps: 3, // Allow tool retries
						},
					);

					// Update step status
					step.status = "completed";
					step.result = stepResult.text;

					// Extract any data from the result
					if (
						stepResult.text.includes("extracted") ||
						stepResult.text.includes("found")
					) {
						try {
							const extractedData = JSON.parse(
								stepResult.text.match(/\{.*\}/s)?.[0] || "{}",
							);
							collectedData = { ...collectedData, ...extractedData };
						} catch (e) {
							// Not JSON, store as text
							collectedData[`step${step.number}`] = stepResult.text;
						}
					}

					console.log(`✅ Step ${step.number} completed`);
				} catch (error) {
					console.error(`❌ Step ${step.number} failed:`, error);
					step.status = "failed";
					step.error = error.message;

					// Handle failure based on rollback strategy
					if (plan.rollbackStrategy.onError === "pause_and_report") {
						await this.monitoringAgent.generate(
							`Step ${step.number} failed: ${error.message}\nPausing execution for review.`,
							{ threadId, resourceId: taskId },
						);
						break;
					}
				}

				results.push({
					number: step.number,
					description: step.description,
					status: step.status,
					result: step.result,
					error: step.error,
				});

				// Save screenshots if requested
				if (request.options?.saveScreenshots && step.number % 3 === 0) {
					await bropTools.get_screenshot?.execute?.({
						context: { filename: `step-${step.number}.png` },
					});
				}
			}

			// Step 4: Generate final report
			console.log("\n📊 Generating final report...");
			const reportResponse = await this.monitoringAgent.generate(
				`Create a ${request.options?.reportFormat || "summary"} report for task ${taskId}:
        Plan: ${JSON.stringify(plan)}
        Results: ${JSON.stringify(results)}
        Collected Data: ${JSON.stringify(collectedData)}`,
				{
					threadId,
					resourceId: taskId,
					output: z.object({
						success: z.boolean(),
						summary: z.string(),
						completedSteps: z.number(),
						totalSteps: z.number(),
						collectedData: z.any(),
						errors: z.array(z.string()),
						recommendations: z.array(z.string()).optional(),
					}),
				},
			);

			return reportResponse.object;
		} catch (error) {
			console.error("System error:", error);
			return {
				success: false,
				summary: "Task execution failed",
				error: error.message,
			};
		}
	}
}

// Example usage
async function main() {
	const automation = new BrowserAutomationSystem();

	// Example 1: LinkedIn AI Influencer Subscription
	const result = await automation.execute({
		task: "Subscribe to top 5 AI influencers on LinkedIn",
		options: {
			maxItems: 5,
			reportFormat: "detailed",
			saveScreenshots: true,
		},
	});

	console.log("\n🎉 Task completed!");
	console.log(result);

	// Example 2: GitHub Repository Analysis
	const githubResult = await automation.execute({
		task: "Analyze top 10 TypeScript repositories on GitHub and extract their star counts",
		options: {
			reportFormat: "summary",
		},
	});

	console.log("\n📈 GitHub Analysis:");
	console.log(githubResult);
}

// Export the class
export { BrowserAutomationSystem };
