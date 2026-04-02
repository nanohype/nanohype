import { describe, it, expect } from "vitest";

/**
 * Protocol type and transport registry tests.
 *
 * Tests A2A protocol types, the transport registry, and the
 * server task handling logic.
 */

import { getTransport, listTransports } from "../protocol/transport/index.js";
import { handleTask } from "../protocol/server.js";
import type { Task, TaskRequest, AgentCard } from "../protocol/types.js";

describe("Transport Registry", () => {
  it("lists registered transports", () => {
    const transports = listTransports();
    expect(transports).toContain("http");
    expect(transports).toContain("websocket");
  });

  it("retrieves a transport by name", () => {
    const transport = getTransport("http");
    expect(transport).toBeDefined();
    expect(transport.name).toBe("http");
  });

  it("throws for unknown transport", () => {
    expect(() => getTransport("carrier-pigeon")).toThrow(/Unknown A2A transport/);
  });
});

describe("A2A Protocol Types", () => {
  it("creates a valid task structure", () => {
    const task: Task = {
      id: "task-1",
      status: "pending",
      skill: "echo",
      input: {
        role: "user",
        content: "hello",
        timestamp: new Date().toISOString(),
      },
      messages: [],
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(task.id).toBe("task-1");
    expect(task.status).toBe("pending");
    expect(task.skill).toBe("echo");
  });

  it("creates a valid agent card structure", () => {
    const card: AgentCard = {
      name: "test-agent",
      description: "A test agent",
      url: "http://localhost:3000",
      skills: [
        {
          name: "echo",
          description: "Echoes input",
          inputTypes: ["text/plain"],
          outputTypes: ["text/plain"],
        },
      ],
      version: "0.1.0",
      protocol: "a2a/v1",
    };

    expect(card.name).toBe("test-agent");
    expect(card.skills).toHaveLength(1);
    expect(card.protocol).toBe("a2a/v1");
  });
});

describe("A2A Server", () => {
  it("handles a task request with a known skill", async () => {
    const request: TaskRequest = {
      skill: "echo",
      input: { content: "hello world" },
    };

    const response = await handleTask(request);
    expect(response.task).toBeDefined();
    expect(response.task.status).toBe("completed");
    expect(response.task.skill).toBe("echo");
    expect(response.task.artifacts.length).toBeGreaterThan(0);
    expect(response.task.artifacts[0]?.content).toContain("hello world");
  });

  it("handles a task request with an unknown skill", async () => {
    const request: TaskRequest = {
      skill: "nonexistent",
      input: { content: "test" },
    };

    const response = await handleTask(request);
    expect(response.task.status).toBe("failed");
  });
});
