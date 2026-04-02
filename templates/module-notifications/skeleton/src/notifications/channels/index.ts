// ── Channel Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in channel providers to
// self-register with the channel registry. Email is always included.
// SMS and push are conditionally included based on template variables.
//

import "./email/index.js";
import "./sms/index.js";
import "./push/index.js";

export { registerChannel, getChannel, listChannels } from "./registry.js";
export type { ChannelProvider } from "./types.js";
