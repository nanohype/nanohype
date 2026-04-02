/**
 * Transport abstraction layer.
 *
 * Importing this module registers all built-in transports as a side
 * effect, making them available through getTransport() / listTransports().
 * The active transport is selected at runtime by passing the transport
 * name (set via the __TRANSPORT__ placeholder) to getTransport().
 */

// Side-effect imports: each module calls registerTransport() at load time
import "./http.js";
import "./websocket.js";

// Re-export the public API
export { registerTransport, getTransport, listTransports } from "./registry.js";
export type { A2ATransport } from "./types.js";
