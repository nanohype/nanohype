import { z } from "zod";
import { DEFAULT_REQUEST_TIMEOUT_MS, parseTimeoutMs } from "./resilience/request-timeout.js";

const envSchema = z.object({
  WIKI_DATA_DIR: z.string().default("./data"),
  WIKI_STORAGE_PROVIDER: z.string().default("__STORAGE_PROVIDER__"),
  WIKI_LLM_PROVIDER: z.string().default("__LLM_PROVIDER__"),
  WIKI_SOURCE_PROVIDER: z.string().default("__SOURCE_PROVIDER__"),
  ANTHROPIC_API_KEY: z.string().optional(),
  // How long the LLM provider waits on each attempt at a model call, in
  // milliseconds, read by parseTimeoutMs(): DEFAULT_REQUEST_TIMEOUT_MS when
  // unset or empty. resilience/request-timeout.ts gives the bound it puts on
  // an operation.
  LLM_REQUEST_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return parseTimeoutMs("LLM_REQUEST_TIMEOUT_MS", value, DEFAULT_REQUEST_TIMEOUT_MS);
      } catch (error) {
        ctx.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
      }
    }),
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
