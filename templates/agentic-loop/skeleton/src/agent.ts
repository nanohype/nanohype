import {
  getProvider,
  type Message,
  type LlmResponse,
} from "./providers/index.js";
import { registry } from "./tools/index.js";
import { logger } from "./logger.js";

const MAX_ITERATIONS = __MAX_ITERATIONS__;
const provider = getProvider("__LLM_PROVIDER__");

const SYSTEM_PROMPT = `You are a helpful assistant with access to tools.

When a user asks a question that can be answered using your tools, use them.
Think step by step: analyze the request, decide which tool(s) to call,
interpret the results, and provide a clear final answer.

If you cannot answer using your tools, say so honestly.

Available tools: ${registry.names().join(", ")}`;

/**
 * Result returned by the agent loop, including the final text response,
 * a log of tool calls made, and the number of loop iterations used.
 */
export interface AgentResult {
  response: string;
  toolCallLog: string[];
  iterations: number;
  messages: Message[];
}

/**
 * Run the agentic loop for a single user input.
 *
 * The loop sends the conversation to the LLM, checks the response for
 * tool-call requests, executes any requested tools through the registry,
 * appends the results as messages, and repeats. It stops when the LLM
 * produces a response with no tool calls, or when the iteration limit
 * is reached.
 */
export async function runAgent(userInput: string): Promise<AgentResult> {
  const messages: Message[] = [
    { role: "user", content: userInput },
  ];

  const toolCallLog: string[] = [];
  let iterations = 0;
  let finalResponse = "";

  logger.info("agent.start", { provider: "__LLM_PROVIDER__", maxIterations: MAX_ITERATIONS });

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    logger.debug("agent.iteration", { iteration: iterations, messageCount: messages.length });

    // Send the current conversation to the LLM
    const llmResponse: LlmResponse = await provider.sendMessage(
      SYSTEM_PROMPT,
      messages,
      registry.list(),
    );

    // Append the raw assistant message to preserve provider-specific fields
    // (e.g. OpenAI's tool_calls array, which is required for tool result messages)
    messages.push(llmResponse.rawAssistantMessage);

    // If no tool calls, we're done — extract the final text
    if (llmResponse.toolCalls.length === 0) {
      finalResponse = extractText(llmResponse);
      break;
    }

    // Execute each tool call and append results
    for (const toolCall of llmResponse.toolCalls) {
      toolCallLog.push(toolCall.name);
      logger.info("agent.tool_call", { tool: toolCall.name, iteration: iterations });

      let result: string;
      try {
        result = await registry.execute(toolCall.name, toolCall.input);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn("agent.tool_error", { tool: toolCall.name, error: errorMsg });
        result = `Tool execution failed: ${errorMsg}`;
      }

      const toolResultMessage = provider.makeToolResultMessage(toolCall.id, result);
      messages.push(toolResultMessage);
    }

    // If this was the last allowed iteration, extract whatever text we have
    if (iterations >= MAX_ITERATIONS) {
      finalResponse = extractText(llmResponse);
    }
  }

  logger.info("agent.complete", { iterations, toolCalls: toolCallLog });

  return {
    response: finalResponse,
    toolCallLog,
    iterations,
    messages,
  };
}

/**
 * Extract text content from an LLM response. Concatenates all text
 * blocks, ignoring tool_use blocks.
 */
function extractText(response: LlmResponse): string {
  return response.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("\n");
}

/**
 * CLI entry point. Reads user input from command-line arguments or
 * runs an interactive prompt.
 */
async function main(): Promise<void> {
  const input = process.argv.slice(2).join(" ");

  if (!input) {
    console.log("Usage: npm start -- \"<your question>\"");
    console.log("Example: npm start -- \"What is 144 / 12?\"");
    process.exit(0);
  }

  console.log(`Agent starting (max ${MAX_ITERATIONS} iterations)...`);
  console.log(`Input: ${input}\n`);

  const result = await runAgent(input);

  console.log(`Response: ${result.response}`);
  console.log(`\nTool calls: [${result.toolCallLog.join(", ")}]`);
  console.log(`Iterations: ${result.iterations}`);
}

main().catch((err) => {
  console.error("Agent error:", err);
  process.exit(1);
});
