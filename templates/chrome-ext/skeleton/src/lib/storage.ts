/**
 * Type-safe wrappers around chrome.storage.local for extension settings.
 *
 * The settings name where the extension's model calls go and hold no
 * credential: the gateway it calls holds the model access.
 */

export interface Settings {
  /** The ModelGateway root the extension calls. Empty until the options page sets it. */
  endpoint: string;
  /** The ModelGateway route a request names as its model. */
  route: string;
}

const STORAGE_KEY = "__PROJECT_NAME__:settings";

export const DEFAULT_SETTINGS: Settings = {
  endpoint: "",
  route: "default",
};

/**
 * Load settings from chrome.storage.local.
 * Returns defaults for any missing fields.
 */
export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
  return {
    endpoint: stored?.endpoint ?? DEFAULT_SETTINGS.endpoint,
    route: stored?.route ?? DEFAULT_SETTINGS.route,
  };
}

/**
 * Persist settings to chrome.storage.local.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}
