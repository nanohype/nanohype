import type { TaskRequest, TaskResponse } from "../types.js";
import type { A2ATransport } from "./types.js";
import { registerTransport } from "./registry.js";
import { logger } from "../../logger.js";

/**
 * WebSocket transport for A2A protocol.
 *
 * Opens a WebSocket connection, sends the task request as a JSON message,
 * and waits for the response. Uses a request/response pattern over a
 * persistent connection for lower-latency agent-to-agent communication.
 */
class WebSocketTransport implements A2ATransport {
  readonly name = "websocket";

  async sendTask(agentUrl: string, request: TaskRequest): Promise<TaskResponse> {
    const wsUrl = agentUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/tasks";

    logger.debug("WebSocket transport sending task", { url: wsUrl, skill: request.skill });

    return new Promise<TaskResponse>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket transport timed out after 30s"));
      }, 30_000);

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify(request));
      });

      ws.addEventListener("message", (event) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(String(event.data)) as TaskResponse;
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse WebSocket response: ${error}`));
        } finally {
          ws.close();
        }
      });

      ws.addEventListener("error", (event) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket transport error: ${event}`));
      });
    });
  }
}

registerTransport("websocket", () => new WebSocketTransport());
