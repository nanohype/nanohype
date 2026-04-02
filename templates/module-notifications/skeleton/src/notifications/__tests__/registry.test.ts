import { describe, it, expect } from "vitest";
import {
  registerChannel,
  getChannel,
  listChannels,
} from "../channels/registry.js";
import type { ChannelProvider } from "../channels/types.js";
import type { NotificationChannel } from "../types.js";

/**
 * Build a minimal stub provider for testing the registry in isolation.
 */
function stubProvider(name: string, channel: NotificationChannel = "email"): ChannelProvider {
  return {
    name,
    channel,
    async send() {
      return { success: true, messageId: "stub-id" };
    },
    async sendBatch() {
      return [];
    },
  };
}

describe("channel provider registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a provider and retrieves it by channel and name", () => {
    const name = unique();
    const provider = stubProvider(name, "email");

    registerChannel(provider);

    expect(getChannel("email", name)).toBe(provider);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getChannel("email", "nonexistent-provider")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate channel:provider key", () => {
    const name = unique();
    registerChannel(stubProvider(name, "email"));

    expect(() => registerChannel(stubProvider(name, "email"))).toThrow(
      /already registered/,
    );
  });

  it("allows same provider name on different channels", () => {
    const name = unique();
    const emailProvider = stubProvider(name, "email");
    const smsProvider = stubProvider(name, "sms");

    registerChannel(emailProvider);
    registerChannel(smsProvider);

    expect(getChannel("email", name)).toBe(emailProvider);
    expect(getChannel("sms", name)).toBe(smsProvider);
  });

  it("lists all registered channel:provider keys", () => {
    const a = unique();
    const b = unique();

    registerChannel(stubProvider(a, "email"));
    registerChannel(stubProvider(b, "sms"));

    const keys = listChannels();
    expect(keys).toContain(`email:${a}`);
    expect(keys).toContain(`sms:${b}`);
  });
});
