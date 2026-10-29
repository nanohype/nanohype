// ── Provider Barrel ─────────────────────────────────────────────────
//
// Importing this module causes every provider the project includes to
// self-register with the provider registry. Custom providers can be added
// by calling registerProvider() after this import.
//
// The gateway and mock providers ship with every project, and the bedrock
// provider with IncludeBedrock, for an application off the substrate. None
// holds a provider key. A project generated without bedrock carries neither
// its file nor its import below, so the barrel registers exactly the
// providers the project ships.
//

// Scaffolded with DefaultProvider:IncludeBedrock = __PROVIDER_CHECK__.
import "./gateway.js";
// #if IncludeBedrock
import "./bedrock.js";
// #endif
import "./mock.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { LlmProvider, LlmProviderFactory } from "./types.js";
