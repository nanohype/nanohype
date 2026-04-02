/**
 * Type-safe wrappers around chrome.storage.local for extension settings.
 */

export type LlmProvider = string;

export interface Settings {
  apiKey: string;
  provider: LlmProvider;
  model: string;
}

const STORAGE_KEY = "__PROJECT_NAME__:settings";

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  provider: "__LLM_PROVIDER__" as LlmProvider,
  model: "",
};

/**
 * Load settings from chrome.storage.local.
 * Returns defaults for any missing fields.
 */
export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
  };
}

/**
 * Persist settings to chrome.storage.local.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

/**
 * Get just the API key. Convenience wrapper for background script.
 */
export async function getApiKey(): Promise<string> {
  const settings = await getSettings();
  return settings.apiKey;
}
