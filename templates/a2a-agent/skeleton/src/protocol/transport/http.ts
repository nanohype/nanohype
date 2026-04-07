import type { TaskRequest, TaskResponse } from "../types.js";
import type { A2ATransport } from "./types.js";
import { registerTransport } from "./registry.js";
import { logger } from "../../logger.js";
import { createCircuitBreaker } from "../../resilience/circuit-breaker.js";

/**
 * HTTP transport for A2A protocol.
 *
 * Sends task requests as JSON POST to the remote agent's /tasks endpoint.
 * Uses the built-in Node.js fetch API.
 */
class HttpTransport implements A2ATransport {
  readonly name = "http";
  private cb = createCircuitBreaker();

  async sendTask(agentUrl: string, request: TaskRequest): Promise<TaskResponse> {
    const url = `${agentUrl.replace(/\/$/, "")}/tasks`;

    logger.debug("HTTP transport sending task", { url, skill: request.skill });

    const response = await this.cb.execute(() =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30_000),
      }),
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP transport error ${response.status}: ${body}`);
    }

    return (await response.json()) as TaskResponse;
  }
}

registerTransport("http", () => new HttpTransport());
