// ── Module Audit Ledger — Main Exports ──────────────────────────────
//
// Public API. Import adapters so they self-register, then expose
// createAuditLedger as the primary entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { getProvider } from "./providers/index.js";
import { auditAppendTotal, auditQueryTotal } from "./metrics.js";
import type { AuditAdapter } from "./providers/types.js";
import type { AuditConfig, AuditEvent, QueryOptions } from "./types.js";

// Re-export everything consumers need.
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export { deriveEventId, eventIdOf } from "./event-id.js";
export type { AuditAdapter } from "./providers/types.js";
export type { AuditConfig, AuditEvent, QueryOptions } from "./types.js";

/** An event to append. timestamp + eventId are optional — the ledger fills them. */
export type AppendInput = Omit<AuditEvent, "timestamp" | "eventId"> & {
  timestamp?: string;
  eventId?: string;
};

// ── Audit Ledger Facade ─────────────────────────────────────────────

export interface AuditLedger {
  /** The underlying adapter instance. */
  adapter: AuditAdapter;

  /** Append one event (append-only). timestamp defaults to now() if omitted. */
  append(event: AppendInput): Promise<void>;

  /** Read a context's events, newest-first. Throws on write-only backends. */
  query(contextId: string, opts?: QueryOptions): Promise<AuditEvent[]>;

  /** Release the adapter's resources. */
  close(): Promise<void>;
}

const CreateSchema = z.object({
  providerName: z.string().min(1, "providerName must be a non-empty string"),
  config: z.object({}).passthrough(),
});

/**
 * Create an audit ledger backed by the named adapter. The adapter must already
 * be registered (built-ins self-register via the providers barrel).
 *
 *   const audit = await createAuditLedger("postgres", { connectionString });
 *   await audit.append({ contextId: incidentId, eventType: "APPROVED", actor, details });
 *   const trail = await audit.query(incidentId);
 *
 * Domain logic (approval gates, edit-distance scoring, PII scrubbing) is the
 * caller's responsibility — scrub `details` before appending; this module only
 * persists and reads events back.
 */
export async function createAuditLedger(
  providerName: string = "__AUDIT_PROVIDER__",
  config: AuditConfig = {},
): Promise<AuditLedger> {
  const parsed = CreateSchema.safeParse({ providerName, config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid audit config: ${issues}`);
  }

  validateBootstrap();

  const adapter = getProvider(providerName);
  await adapter.init(config);

  return {
    adapter,

    async append(input: AppendInput): Promise<void> {
      const event: AuditEvent = {
        ...input,
        timestamp: input.timestamp ?? new Date().toISOString(),
      };
      try {
        await adapter.append(event);
        auditAppendTotal.add(1, { provider: adapter.name, result: "ok" });
      } catch (err) {
        auditAppendTotal.add(1, { provider: adapter.name, result: "error" });
        throw err;
      }
    },

    async query(contextId: string, opts?: QueryOptions): Promise<AuditEvent[]> {
      const events = await adapter.queryByContext(contextId, opts);
      auditQueryTotal.add(1, { provider: adapter.name });
      return events;
    },

    async close(): Promise<void> {
      await adapter.close();
    },
  };
}
