// ── Signature Provider Barrel ────────────────────────────────────────
//
// Importing this module causes all built-in signature providers to
// self-register with the provider registry. Custom providers can be
// added by importing their module after this one.
//

import "./hmac-sha256.js";
import "./hmac-sha1.js";

export {
  registerSignatureProvider,
  getSignatureProvider,
  listSignatureProviders,
} from "./registry.js";
export type { SignatureProvider } from "./types.js";
