import type { TaskRequest, TaskResponse } from "../types.js";

/**
 * Transport interface that every A2A transport backend must implement.
 *
 * Transports handle the network-level details of sending task requests
 * to remote agents and receiving responses. The protocol layer above
 * is transport-agnostic.
 */
export interface A2ATransport {
  /** Transport name for registry lookup. */
  readonly name: string;

  /** Send a task request to a remote agent and return the response. */
  sendTask(agentUrl: string, request: TaskRequest): Promise<TaskResponse>;
}
