import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { GatewayConfig, RouteRule } from "./types.js";

// ── Gateway Configuration ───────────────────────────────────────────
//
// Validates configuration from environment variables and an optional
// routes.json file. Environment variables control server-level settings.
// Route rules come from GATEWAY_ROUTES_FILE (defaults to routes.json
// in the working directory) or can be passed programmatically.
//

const rateLimitSchema = z.object({
  limit: z.number().int().positive(),
  window: z.number().int().positive(),
});

const corsSchema = z.object({
  origins: z.array(z.string()),
  methods: z.array(z.string()).optional(),
  allowHeaders: z.array(z.string()).optional(),
  exposeHeaders: z.array(z.string()).optional(),
  maxAge: z.number().int().positive().optional(),
});

const transformSchema = z.object({
  setRequestHeaders: z.record(z.string()).optional(),
  removeRequestHeaders: z.array(z.string()).optional(),
  setResponseHeaders: z.record(z.string()).optional(),
  removeResponseHeaders: z.array(z.string()).optional(),
});

const canarySchema = z.object({
  primary: z.string().url(),
  canary: z.string().url(),
  canaryPercent: z.number().min(0).max(100),
});

const routeSchema = z.object({
  path: z.string().min(1),
  methods: z.array(z.string().toUpperCase()).default([]),
  upstream: z.union([z.string().url(), canarySchema]),
  auth: z.enum(["jwt", "api-key", "none"]).default("none"),
  rateLimit: rateLimitSchema.optional(),
  cors: corsSchema.optional(),
  transform: transformSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  stripPrefix: z.boolean().optional(),
});

const envSchema = z.object({
  PORT: z
    .string()
    .default("8080")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  JWT_SECRET: z.string().optional(),

  JWKS_URL: z.string().url().optional(),

  API_KEYS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",").map((k) => k.trim()) : undefined)),

  DEFAULT_TIMEOUT_MS: z
    .string()
    .default("30000")
    .transform(Number)
    .pipe(z.number().int().positive()),

  HEALTH_CHECK_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val === "true"),

  GATEWAY_ROUTES_FILE: z.string().optional(),
});

/**
 * Load route rules from a JSON file. Returns an empty array if the
 * file does not exist. Throws on parse or validation errors.
 */
function loadRoutesFile(filePath: string): RouteRule[] {
  if (!existsSync(filePath)) return [];

  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const routes = z.array(routeSchema).parse(parsed);
  return routes;
}

/**
 * Build the gateway configuration from environment variables and an
 * optional routes file. Programmatic routes can be merged in via the
 * `extraRoutes` parameter.
 */
export function loadConfig(extraRoutes?: RouteRule[]): GatewayConfig {
  const envResult = envSchema.safeParse(process.env);

  if (!envResult.success) {
    console.error("[config] Invalid gateway configuration:");
    for (const issue of envResult.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const env = envResult.data;
  const routesFile = env.GATEWAY_ROUTES_FILE ?? resolve("routes.json");
  const fileRoutes = loadRoutesFile(routesFile);
  const routes = [...fileRoutes, ...(extraRoutes ?? [])];

  return {
    port: env.PORT,
    routes,
    jwtSecret: env.JWT_SECRET,
    jwksUrl: env.JWKS_URL,
    apiKeys: env.API_KEYS,
    defaultTimeoutMs: env.DEFAULT_TIMEOUT_MS,
    healthCheckEnabled: env.HEALTH_CHECK_ENABLED,
    logLevel: env.LOG_LEVEL,
  };
}
