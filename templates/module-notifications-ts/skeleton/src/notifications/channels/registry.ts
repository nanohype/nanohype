import type { ChannelProvider } from "./types.js";

// ── Channel Registry ────────────────────────────────────────────────
//
// Central registry for channel providers. Each provider module
// self-registers by calling registerChannel() at import time.
// Providers are keyed by "channel:providerName" (e.g. "email:resend").
// Consumer code calls getChannel() to obtain the active provider.
//

const channels = new Map<string, ChannelProvider>();

function key(channel: string, providerName: string): string {
  return `${channel}:${providerName}`;
}

export function registerChannel(provider: ChannelProvider): void {
  const k = key(provider.channel, provider.name);
  if (channels.has(k)) {
    throw new Error(`Channel provider "${k}" is already registered`);
  }
  channels.set(k, provider);
}

export function getChannel(channel: string, providerName: string): ChannelProvider {
  const k = key(channel, providerName);
  const provider = channels.get(k);
  if (!provider) {
    const available = Array.from(channels.keys()).join(", ") || "(none)";
    throw new Error(
      `Channel provider "${k}" not found. Available: ${available}`,
    );
  }
  return provider;
}

export function listChannels(): string[] {
  return Array.from(channels.keys());
}
