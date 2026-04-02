import { describe, it, expect } from "vitest";
import { interpolate, renderTemplate } from "../template.js";
import type { NotificationTemplate } from "../types.js";

describe("template rendering", () => {
  describe("interpolate", () => {
    it("replaces a single variable", () => {
      const result = interpolate("Hello {{name}}", { name: "Alice" });

      expect(result).toBe("Hello Alice");
    });

    it("replaces multiple variables", () => {
      const result = interpolate("{{greeting}}, {{name}}!", {
        greeting: "Hi",
        name: "Bob",
      });

      expect(result).toBe("Hi, Bob!");
    });

    it("preserves unmatched placeholders", () => {
      const result = interpolate("Hello {{name}}, your code is {{code}}", {
        name: "Charlie",
      });

      expect(result).toBe("Hello Charlie, your code is {{code}}");
    });

    it("returns the original string when no variables match", () => {
      const result = interpolate("No variables here", { name: "test" });

      expect(result).toBe("No variables here");
    });

    it("handles empty variables map", () => {
      const result = interpolate("Hello {{name}}", {});

      expect(result).toBe("Hello {{name}}");
    });

    it("replaces the same variable multiple times", () => {
      const result = interpolate("{{x}} and {{x}} again", { x: "value" });

      expect(result).toBe("value and value again");
    });

    it("handles empty string values", () => {
      const result = interpolate("Hello {{name}}", { name: "" });

      expect(result).toBe("Hello ");
    });
  });

  describe("renderTemplate", () => {
    it("renders a template with subject and body", () => {
      const template: NotificationTemplate = {
        name: "welcome",
        channel: "email",
        subject: "Welcome, {{name}}!",
        body: "Hi {{name}}, thanks for joining {{app}}.",
      };

      const notification = renderTemplate(
        template,
        { name: "Alice", app: "Acme" },
        "alice@example.com",
      );

      expect(notification.channel).toBe("email");
      expect(notification.to).toBe("alice@example.com");
      expect(notification.subject).toBe("Welcome, Alice!");
      expect(notification.body).toBe("Hi Alice, thanks for joining Acme.");
    });

    it("renders a template without subject", () => {
      const template: NotificationTemplate = {
        name: "alert",
        channel: "sms",
        body: "Alert: {{message}}",
      };

      const notification = renderTemplate(
        template,
        { message: "Server is down" },
        "+15551234567",
      );

      expect(notification.channel).toBe("sms");
      expect(notification.to).toBe("+15551234567");
      expect(notification.subject).toBeUndefined();
      expect(notification.body).toBe("Alert: Server is down");
    });

    it("passes through the from field", () => {
      const template: NotificationTemplate = {
        name: "test",
        channel: "email",
        subject: "Test",
        body: "Body",
      };

      const notification = renderTemplate(template, {}, "to@test.com", "from@test.com");

      expect(notification.from).toBe("from@test.com");
    });

    it("sets from to undefined when not provided", () => {
      const template: NotificationTemplate = {
        name: "test",
        channel: "email",
        body: "Body",
      };

      const notification = renderTemplate(template, {}, "to@test.com");

      expect(notification.from).toBeUndefined();
    });
  });
});
