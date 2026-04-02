import { describe, it, expect } from "vitest";
import { piiFilter } from "../pii.js";

describe("pii filter", () => {
  it("has name 'pii'", () => {
    expect(piiFilter.name).toBe("pii");
  });

  it("allows text with no PII", () => {
    const result = piiFilter.filter("Hello, how are you?", "input");

    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.filtered).toBe("Hello, how are you?");
  });

  it("detects and redacts email addresses", () => {
    const result = piiFilter.filter(
      "Send an email to alice@example.com for more info",
      "output",
    );

    expect(result.filtered).toContain("[EMAIL_REDACTED]");
    expect(result.filtered).not.toContain("alice@example.com");
    expect(result.violations.some((v) => v.message.includes("email"))).toBe(true);
  });

  it("detects and redacts phone numbers", () => {
    const inputs = [
      "Call me at (555) 123-4567",
      "My number is 555-123-4567",
      "Reach me at 555.123.4567",
      "Call +1-555-123-4567",
    ];

    for (const input of inputs) {
      const result = piiFilter.filter(input, "output");
      expect(result.filtered).toContain("[PHONE_REDACTED]");
      expect(result.violations.some((v) => v.message.includes("phone"))).toBe(true);
    }
  });

  it("detects and redacts SSNs", () => {
    const result = piiFilter.filter("SSN: 123-45-6789", "output");

    expect(result.filtered).toContain("[SSN_REDACTED]");
    expect(result.violations.some((v) => v.message.includes("ssn"))).toBe(true);
  });

  it("detects and redacts credit card numbers", () => {
    const result = piiFilter.filter(
      "Card: 4111-1111-1111-1111",
      "output",
    );

    expect(result.filtered).toContain("[CC_REDACTED]");
    expect(result.violations.some((v) => v.message.includes("credit-card"))).toBe(true);
  });

  it("redacts multiple PII instances in the same input", () => {
    const result = piiFilter.filter(
      "Email alice@example.com or bob@test.org for help",
      "output",
    );

    expect(result.filtered).not.toContain("alice@example.com");
    expect(result.filtered).not.toContain("bob@test.org");
    expect(result.violations.filter((v) => v.message.includes("email"))).toHaveLength(2);
  });

  it("truncates detected values in violation messages for privacy", () => {
    const result = piiFilter.filter(
      "Email alice@example.com",
      "output",
    );

    const emailViolation = result.violations.find((v) => v.message.includes("email"));
    expect(emailViolation).toBeDefined();
    // Message should contain only first 4 chars followed by ****
    expect(emailViolation!.message).toContain("****");
    expect(emailViolation!.message).not.toContain("alice@example.com");
  });

  it("marks output PII as blocking severity", () => {
    const result = piiFilter.filter("Email: alice@example.com", "output");

    expect(result.violations[0].severity).toBe("block");
  });

  it("marks input PII as warning severity", () => {
    const result = piiFilter.filter("My email is alice@example.com", "input");

    expect(result.violations[0].severity).toBe("warn");
    expect(result.allowed).toBe(true); // Warnings don't block
  });
});
