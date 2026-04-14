import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../logger.js";

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const intercept = (chunk: unknown): boolean => {
    if (typeof chunk === "string") lines.push(chunk);
    return true;
  };
  process.stdout.write = intercept as typeof process.stdout.write;
  process.stderr.write = intercept as typeof process.stderr.write;
  return {
    lines,
    restore: () => {
      process.stdout.write = orig;
      process.stderr.write = origErr;
    },
  };
}

describe("logger redaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never emits accessToken in log output", () => {
    const cap = captureStdout();
    try {
      logger.warn("refresh failed", {
        accessToken: "supersecret-access",
        refreshToken: "supersecret-refresh",
        userId: "u1",
      });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join("");
    expect(joined).not.toContain("supersecret-access");
    expect(joined).not.toContain("supersecret-refresh");
    expect(joined).toContain("[redacted]");
    expect(joined).toContain("u1");
  });

  it("redacts nested access_token / refresh_token snake_case", () => {
    const cap = captureStdout();
    try {
      logger.info("token grant parsed", {
        provider: "google",
        raw: {
          access_token: "leaked-one",
          refresh_token: "leaked-two",
          scope: "openid",
        },
      });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join("");
    expect(joined).not.toContain("leaked-one");
    expect(joined).not.toContain("leaked-two");
    expect(joined).toContain("openid");
    expect(joined).toContain("google");
  });

  it("redacts code and codeVerifier", () => {
    const cap = captureStdout();
    try {
      logger.debug("exchange", {
        code: "auth-code-xyz",
        codeVerifier: "verifier-abc",
        clientSecret: "shh",
      });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join("");
    expect(joined).not.toContain("auth-code-xyz");
    expect(joined).not.toContain("verifier-abc");
    expect(joined).not.toContain("shh");
  });

  it("preserves non-sensitive fields through arrays", () => {
    const cap = captureStdout();
    try {
      logger.info("providers listed", { items: [{ name: "notion" }, { name: "google" }] });
    } finally {
      cap.restore();
    }
    const joined = cap.lines.join("");
    expect(joined).toContain("notion");
    expect(joined).toContain("google");
  });
});
