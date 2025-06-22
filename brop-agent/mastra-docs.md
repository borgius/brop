# Mastra AI Framework - Quick Reference for AI Agents

Mastra is a TypeScript framework for building production-ready AI applications with autonomous agents, workflows, tools, memory systems, and extensive integrations. It provides a composable architecture for creating intelligent applications that can understand context, use tools, and complete complex tasks.

## Core Features
- **Agents**: Autonomous AI entities with instructions, models, and capabilities
- **Tools**: Functions that extend agent capabilities with type-safe schemas
- **Workflows**: Multi-step processes with branching, loops, and error handling
- **Memory**: Persistent conversation storage with semantic recall
- **Voice**: Speech-to-text and text-to-speech capabilities
- **Integrations**: MCP servers, vector databases, and model providers
- **Observability**: Built-in telemetry and evaluation metrics

## 🚀 Quick Setup

### 1. Installation
```bash
# Create new project (recommended)
npm create mastra@latest
# or
npx create-mastra@latest

# Add to existing project
pnpm add @mastra/core@latest zod @ai-sdk/openai

# One-liner with defaults
npx mastra@latest init --dir . --components agents,tools --example --llm openai
```

### 2. Basic Project Structure
```
src/mastra/
├── agents/          # AI agents
├── tools/           # Custom functions
├── workflows/       # Multi-step processes
└── index.ts         # Main Mastra instance
```

### 3. Environment Setup
```bash
# .env
OPENAI_API_KEY=your_openai_api_key

# Optional: Other providers
ANTHROPIC_API_KEY=your_anthropic_api_key
GROQ_API_KEY=your_groq_api_key

# Vector DB connections
POSTGRES_CONNECTION_STRING=postgresql://...
PINECONE_API_KEY=your_pinecone_key
```

## 🤖 Creating Agents

### Basic Agent
```typescript
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

export const myAgent = new Agent({
  name: "MyAgent",
  instructions: "You are a helpful assistant.",
  model: openai("gpt-4o-mini"),
});
```

### Dynamic Agent with Runtime Context
```typescript
export const dynamicAgent = new Agent({
  name: "DynamicAgent",
  instructions: ({ runtimeContext }) => {
    const userLocale = runtimeContext.get("locale");
    return `You are a helpful assistant. Respond in ${userLocale}.`;
  },
  model: ({ runtimeContext }) => {
    const modelType = runtimeContext.get("model-type");
    return openai(modelType || "gpt-4o-mini");
  },
});
```

### Agent with Tools
```typescript
export const agentWithTools = new Agent({
  name: "ToolAgent",
  instructions: "You can use tools to help users.",
  model: openai("gpt-4o"),
  tools: { weatherTool, calculatorTool },
});
```

### Agent with Memory
```typescript
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { TokenLimiter } from "@mastra/memory/processors";

const memory = new Memory({
  storage: new LibSQLStore({ url: "file:memory.db" }),
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 3,
      messageRange: { before: 2, after: 1 }
    },
    workingMemory: {
      enabled: true,
      use: "tool-call",
      template: "# User Profile\n\n## Personal Info\n- Name:\n- Preferences:\n\n## Session State\n- Current Topic:\n- Open Questions:"
    }
  },
  processors: [new TokenLimiter(127000)] // For GPT-4o context window
});

export const memoryAgent = new Agent({
  name: "MemoryAgent",
  instructions: "Remember our conversations.",
  model: openai("gpt-4o"),
  memory,
});
```

## 🔧 Creating Tools

### Basic Tool
```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const weatherTool = createTool({
  id: "get-weather",
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name")
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string()
  }),
  execute: async ({ context }) => {
    // API call logic here
    return { temperature: 20, conditions: "Sunny" };
  }
});
```

### Tool with Runtime Context
```typescript
export const contextAwareTool = createTool({
  id: "context-tool",
  description: "Tool that uses runtime context",
  inputSchema: z.object({
    query: z.string()
  }),
  execute: async ({ context, runtimeContext }) => {
    const temperatureUnit = runtimeContext.get("temperature-scale");
    // Use context values in execution
    return { unit: temperatureUnit };
  }
});
```

### Vector Query Tool
```typescript
import { createVectorQueryTool } from "@mastra/core/tools";

const vectorQueryTool = createVectorQueryTool({
  vectorStoreName: "pgVector",
  indexName: "embeddings",
  model: openai.embedding("text-embedding-3-small"),
  reranker: {
    model: openai("gpt-4o-mini")
  }
});
```

## 📋 Creating Workflows

### Basic Workflow
```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  id: "process-data",
  inputSchema: z.object({ input: z.string() }),
  outputSchema: z.object({ output: z.string() }),
  execute: async ({ inputData }) => {
    return { output: `Processed: ${inputData.input}` };
  }
});

export const myWorkflow = createWorkflow({
  id: "my-workflow",
  inputSchema: z.object({ input: z.string() }),
  outputSchema: z.object({ output: z.string() }),
  steps: [step1] // Declare steps for type safety
})
  .then(step1)
  .commit();
```

### Workflow with Branching
```typescript
const workflow = createWorkflow({ /* ... */ })
  .then(initialStep)
  .branch([
    [async ({ inputData }) => inputData.value > 50, highValueStep],
    [async ({ inputData }) => inputData.value <= 50, lowValueStep],
  ])
  .then(finalStep)
  .commit();
```

### Workflow with Loops
```typescript
// Foreach loop
workflow.foreach(processItemStep, { concurrency: 2 });

// Do-until loop
workflow.dountil(
  incrementStep,
  async ({ inputData }) => inputData.value >= 10
);
```

### Suspendable Workflow
```typescript
const humanInputStep = createStep({
  id: "human-input",
  suspend: true,
  execute: async ({ inputData, suspend }) => {
    const result = await suspend({ needsInput: true });
    return { userInput: result };
  }
});
```

### Workflow with Agent
```typescript
const agentStep = createStep(myAgent);

export const agentWorkflow = createWorkflow({
  id: "agent-workflow",
  inputSchema: z.object({ prompt: z.string() }),
  outputSchema: z.object({ response: z.string() })
})
  .map(({ inputData }) => ({ prompt: inputData.prompt }))
  .then(agentStep)
  .commit();
```

## 🏗️ Main Mastra Instance

```typescript
import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";

export const mastra = new Mastra({
  agents: { myAgent, memoryAgent },
  tools: { weatherTool },
  workflows: { myWorkflow },
  logger: new PinoLogger({
    name: "Mastra",
    level: "info"
  })
});
```

## 🎯 Usage Examples

### Generate Text
```typescript
const response = await myAgent.generate([
  { role: "user", content: "Hello!" }
]);
console.log(response.text);
```

### Generate with Options
```typescript
const response = await myAgent.generate("Analyze this", {
  maxSteps: 3, // Allow multiple tool calls
  abortSignal: controller.signal, // Cancellation support
  threadId: "conversation-1",
  resourceId: "user-123"
});
```

### Stream Response
```typescript
const stream = await myAgent.stream([
  { role: "user", content: "Tell me a story" }
]);

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

### Structured Output
```typescript
const schema = z.object({
  summary: z.string(),
  keywords: z.array(z.string())
});

const response = await myAgent.generate([
  { role: "user", content: "Analyze this text..." }
], { output: schema });

console.log(response.object); // Typed output
```

### Run Workflow
```typescript
const run = mastra.getWorkflow("myWorkflow").createRun();
const result = await run.start({
  inputData: { input: "test data" }
});

// Handle different statuses
if (result.status === "success") {
  console.log(result.result);
  console.log(result.steps); // Access individual step outputs
} else if (result.status === "suspended") {
  // Resume with user input
  const resumed = await run.resume({
    step: result.suspended[0],
    resumeData: { userInput: "continue" }
  });
} else if (result.status === "failed") {
  console.error(result.error);
}
```

### Use Memory
```typescript
await memoryAgent.generate("Remember my name is Alice", {
  resourceId: "user_123",
  threadId: "conversation_1"
});

// Later...
const response = await memoryAgent.generate("What's my name?", {
  resourceId: "user_123", 
  threadId: "conversation_1"
});
```

## 🚀 Development Server

```bash
# Start development server
pnpm run dev

# Access playground
http://localhost:4111
```

## 🔗 MCP Integration

### Connect to MCP Server
```typescript
import { MCPClient } from "@mastra/mcp";

const mcp = new MCPClient({
  servers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    },
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"]
    }
  }
});

const agent = new Agent({
  name: "MCPAgent",
  model: openai("gpt-4o"),
  tools: await mcp.getTools()
});
```

## 🧠 Voice Capabilities

### Text-to-Speech
```typescript
import { OpenAIVoice } from "@mastra/voice-openai";

const voiceAgent = new Agent({
  name: "VoiceAgent",
  model: openai("gpt-4o"),
  voice: new OpenAIVoice()
});

// Speak text
const audio = await voiceAgent.voice.speak("Hello, world!");
```

### Speech-to-Text
```typescript
import { createReadStream } from "fs";

// Listen to audio file
const audioStream = createReadStream("./audio.mp3");
const transcript = await voiceAgent.voice.listen(audioStream);
const response = await voiceAgent.generate(transcript);
```

### Real-time Voice
```typescript
import { OpenAIRealtimeVoice } from "@mastra/voice-openai-realtime";

const realtimeVoice = new OpenAIRealtimeVoice({
  realtimeConfig: {
    model: "gpt-4o-mini-realtime",
    apiKey: process.env.OPENAI_API_KEY
  }
});

await realtimeVoice.connect();
realtimeVoice.on("writing", ({ text }) => console.log(text));
```

## 📊 Evaluation Metrics

### Agent with Evals
```typescript
import { SummarizationMetric } from "@mastra/evals/llm";
import { ContentSimilarityMetric, ToneConsistencyMetric } from "@mastra/evals/nlp";

export const evaluatedAgent = new Agent({
  name: "EvaluatedAgent",
  model: openai("gpt-4o"),
  evals: {
    summarization: new SummarizationMetric(openai("gpt-4o")),
    contentSimilarity: new ContentSimilarityMetric(),
    tone: new ToneConsistencyMetric()
  }
});
```

### Faithfulness Metric
```typescript
import { FaithfulnessMetric } from "@mastra/evals";

const faithfulnessMetric = new FaithfulnessMetric({
  model: openai("gpt-4"),
  context: ["Paris is the capital of France"],
  scale: 1
});

const result = await faithfulnessMetric.measure(
  "Tell me about Paris",
  "Paris is the capital of France"
);
```

## 💡 Key Concepts

- **Agents**: AI entities with instructions, models, and capabilities
- **Tools**: Functions that extend agent capabilities
- **Workflows**: Multi-step processes with type safety
- **Memory**: Persistent conversation and context storage
- **MCP**: Model Context Protocol for external tool integration
- **Runtime Context**: Dynamic configuration for agents/tools
- **Voice**: Speech-to-text and text-to-speech capabilities
- **Evals**: Metrics for evaluating agent performance
- **Telemetry**: Built-in observability with OpenTelemetry

## 🗄️ RAG (Retrieval Augmented Generation)

### Document Processing
```typescript
import { MDocument } from "@mastra/rag";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

// Create and chunk document
const doc = MDocument.fromText("Your document text...");
const chunks = await doc.chunk({
  strategy: "recursive",
  size: 512,
  overlap: 50
});

// Generate embeddings
const { embeddings } = await embedMany({
  model: openai.embedding("text-embedding-3-small"),
  values: chunks.map(chunk => chunk.text)
});
```

### Vector Storage
```typescript
import { PgVector } from "@mastra/pg";

const pgVector = new PgVector({
  connectionString: process.env.POSTGRES_CONNECTION_STRING
});

// Store embeddings
await pgVector.createIndex({
  indexName: "embeddings",
  dimension: 1536
});

await pgVector.upsert({
  indexName: "embeddings",
  vectors: embeddings,
  metadata: chunks.map(chunk => ({ text: chunk.text }))
});
```

### Query with Filters
```typescript
const results = await pgVector.query({
  indexName: "embeddings",
  queryVector: queryEmbedding,
  topK: 10,
  filter: {
    category: "electronics",
    price: { $lt: 1000 },
    tags: { $in: ["sale", "new"] }
  }
});
```

### Re-ranking
```typescript
import { rerank } from "@mastra/rag";

const rerankedResults = await rerank(
  initialResults,
  query,
  openai("gpt-4o-mini"),
  {
    weights: {
      semantic: 0.5,
      vector: 0.3,
      position: 0.2
    },
    topK: 3
  }
);
```

## 📚 Common Patterns

1. **Multi-step Tool Use**: Set `maxSteps > 1` for complex tasks
2. **Dynamic Agents**: Use runtime context for user-specific behavior
3. **Workflow Suspension**: Pause workflows for human input
4. **Structured Data**: Always use Zod schemas for type safety
5. **Error Handling**: Wrap agent calls in try-catch blocks
6. **Memory Management**: Use token limiters to stay within context windows
7. **Hybrid Search**: Combine vector similarity with metadata filters
8. **Agent Composition**: Chain agents in workflows for complex tasks

## 🏗️ Framework Integrations

### Next.js
```typescript
// app/api/chat/route.ts
import { mastra } from "@/mastra";
import { StreamingTextResponse } from "ai";

export async function POST(req: Request) {
  const { message } = await req.json();
  const agent = mastra.getAgent("assistant");
  
  const result = await agent.stream(message);
  return new StreamingTextResponse(result.textStream);
}
```

### Express.js
```typescript
import express from "express";
import { mastra } from "./mastra";

const app = express();

app.post("/api/chat", async (req, res) => {
  const agent = mastra.getAgent("assistant");
  const result = await agent.generate(req.body.message);
  res.json({ response: result.text });
});
```

## 🚀 Deployment

### With Inngest
```typescript
import { init } from "@mastra/inngest";
import { Inngest } from "inngest";

const { createWorkflow, createStep } = init(
  new Inngest({ id: "mastra" })
);
```

### Telemetry Configuration
```typescript
const mastra = new Mastra({
  telemetry: {
    serviceName: "my-service",
    enabled: true,
    sampling: {
      type: "ratio",
      probability: 0.5
    },
    export: {
      type: "otlp",
      endpoint: "https://otel-collector.example.com/v1/traces"
    }
  }
});
```

## 🔧 Package Management

Always use `pnpm` for dependency management:
```bash
pnpm add @mastra/package-name@latest
```

## 📦 Vector Database Support

- **PostgreSQL**: `@mastra/pg`
- **Pinecone**: `@mastra/pinecone`
- **Qdrant**: `@mastra/qdrant`
- **Chroma**: `@mastra/chroma`
- **MongoDB**: `@mastra/mongodb`
- **Astra DB**: `@mastra/astra`
- **Upstash**: `@mastra/upstash`
- **OpenSearch**: `@mastra/opensearch`
- **And more...**

## 🎓 Resources

- **Documentation**: https://mastra.ai/docs
- **Examples**: https://github.com/mastra-ai/mastra/tree/main/examples
- **API Reference**: https://mastra.ai/docs/reference
- **Discord**: https://discord.gg/mastra
