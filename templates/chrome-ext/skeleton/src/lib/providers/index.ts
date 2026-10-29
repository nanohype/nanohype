// The gateway provider calls a Platform's ModelGateway at the endpoint the
// options page sets, and holds no model credential.
import "./gateway.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { AiProvider, ChatMessage, ProviderSettings } from "./types.js";
