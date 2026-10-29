import { parseGatewayEndpoint } from "../lib/providers/gateway.js";
import type { Settings } from "../lib/storage.js";
import { DEFAULT_SETTINGS } from "../lib/storage.js";

/** What saving the options page's settings needs from the browser. */
export interface SaveDependencies {
  /** Asks the user for a host permission on `origin`, and resolves whether they granted it. */
  requestOrigin(origin: string): Promise<boolean>;
  /** Stores the settings. */
  saveSettings(settings: Settings): Promise<void>;
}

/** The settings a save stored, or the problem the options page shows instead. */
export type SaveOutcome = { saved: Settings } | { problem: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Checks the endpoint the options page holds, asks for a host permission on
 * its origin, and stores the settings. It never rejects: a refused endpoint,
 * a permission the user denies, a permission request that fails and a
 * storage write that fails each come back as the problem the page shows.
 *
 * The service worker reaches the gateway only with a host permission for its
 * origin, and the manifest declares the loopback origins as optional, so a
 * save asks for exactly the one it stores. Chrome takes a permission request
 * only during a user gesture, so nothing is awaited before it: the request
 * goes out while the click that called this is being handled.
 */
export async function saveGatewaySettings(
  input: Settings,
  deps: SaveDependencies,
): Promise<SaveOutcome> {
  let endpoint: string;
  try {
    endpoint = parseGatewayEndpoint(input.endpoint);
  } catch (err) {
    return { problem: messageOf(err) };
  }
  const origin = `${new URL(endpoint).origin}/*`;
  let granted: boolean;
  try {
    granted = await deps.requestOrigin(origin);
  } catch (err) {
    return { problem: `Chrome could not ask for access to ${origin}: ${messageOf(err)}` };
  }
  if (!granted) {
    return { problem: "The extension needs access to the gateway endpoint to call it." };
  }
  const settings = { endpoint, route: input.route.trim() || DEFAULT_SETTINGS.route };
  try {
    await deps.saveSettings(settings);
  } catch (err) {
    return { problem: `The settings could not be saved: ${messageOf(err)}` };
  }
  return { saved: settings };
}
