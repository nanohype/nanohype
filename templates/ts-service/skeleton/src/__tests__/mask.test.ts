import { describe, it, expect } from "vitest";
import { maskSensitive, maskHeaders } from "../middleware/mask.js";

describe("maskSensitive", () => {
  it("masks bearer tokens but keeps the scheme", () => {
    expect(maskSensitive("Authorization: Bearer abc.def.ghi")).toBe(
      "Authorization: Bearer ***",
    );
  });

  it("masks passwords embedded in connection URLs", () => {
    expect(maskSensitive("postgres://user:s3cret@db:5432/app")).toBe(
      "postgres://***@db:5432/app",
    );
  });

  it("masks API-key-shaped substrings", () => {
    expect(maskSensitive("key=sk-livetoken123")).toBe("key=***");
    expect(maskSensitive("ghp_abc123 and xoxb-9-9")).toBe("*** and ***");
  });

  it("leaves benign strings untouched", () => {
    expect(maskSensitive("just a normal log line")).toBe("just a normal log line");
  });
});

describe("maskHeaders", () => {
  it("masks known sensitive headers", () => {
    const out = maskHeaders({
      authorization: "Bearer xyz",
      cookie: "sid=1",
      "x-api-key": "k",
    });
    expect(out.authorization).toBe("Bearer ***");
    expect(out.cookie).toBe("***");
    expect(out["x-api-key"]).toBe("***");
  });

  it("masks headers whose name contains a sensitive substring", () => {
    const out = maskHeaders({ "x-session-token": "t", "my-secret-thing": "s" });
    expect(out["x-session-token"]).toBe("***");
    expect(out["my-secret-thing"]).toBe("***");
  });

  it("preserves the Bearer scheme hint on sensitive non-auth headers", () => {
    expect(maskHeaders({ "x-proxy-token": "Bearer abc" })["x-proxy-token"]).toBe(
      "Bearer ***",
    );
  });

  it("passes non-sensitive headers through unchanged", () => {
    const out = maskHeaders({ "content-type": "application/json", accept: "*/*" });
    expect(out["content-type"]).toBe("application/json");
    expect(out.accept).toBe("*/*");
  });
});
