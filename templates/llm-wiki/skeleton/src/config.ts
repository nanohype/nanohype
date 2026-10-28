import { z } from "zod";

/** An empty environment value reads as unset. */
function unsetWhenEmpty(value: unknown): unknown {
  return value === "" ? undefined : value;
}

const envSchema = z.object({
  WIKI_DATA_DIR: z.string().default("./data"),
  WIKI_STORAGE_PROVIDER: z.string().default("__STORAGE_PROVIDER__"),
  WIKI_LLM_PROVIDER: z.string().default("__LLM_PROVIDER__"),
  WIKI_SOURCE_PROVIDER: z.string().default("__SOURCE_PROVIDER__"),
  ANTHROPIC_API_KEY: z.string().optional(),
  // How long the LLM provider waits for one model call before it abandons
  // it, in milliseconds, so a hung connection fails into its circuit
  // breaker instead of holding the operation. Unset or empty is 30000.
  LLM_REQUEST_TIMEOUT_MS: z.preprocess(
    unsetWhenEmpty,
    z.coerce.number().int().positive().default(30_000),
  ),
  WIKI_API_PORT: z.coerce.number().default(3000),
  WIKI_API_KEY: z.string().optional(),
  WIKI_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}

/** Reset cached config. Intended for testing only. */
export function resetConfig(): void {
  _config = null;
}
