import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "@/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("outputs JSON with timestamp, level, and message", () => {
    logger.info("test message");

    expect(console.log).toHaveBeenCalledTimes(1);
    const output = JSON.parse(vi.mocked(console.log).mock.calls[0][0]);
    expect(output).toHaveProperty("timestamp");
    expect(output).toHaveProperty("level", "info");
    expect(output).toHaveProperty("message", "test message");
  });

  it("includes extra data fields", () => {
    logger.info("with data", { requestId: "abc-123" });

    const output = JSON.parse(vi.mocked(console.log).mock.calls[0][0]);
    expect(output).toHaveProperty("requestId", "abc-123");
  });

  it("uses console.error for error level", () => {
    logger.error("something failed");

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });
});
