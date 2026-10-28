import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { billsSameContent, billsSameLine, type InvoiceContent } from "../invoicing/content.js";
import { logger } from "../logger.js";
import { CircuitBreaker } from "../resilience/circuit-breaker.js";
import type {
  BillingConfig,
  BillingWebhookEvent,
  ChargeContentChanged,
  ChargeFailed,
  ChargeOptions,
  ChargeResult,
  Customer,
  Invoice,
  LineItem,
  Subscription,
} from "../types.js";
import { ProviderConfigError } from "./errors.js";
import { registerProvider } from "./registry.js";
import {
  DEFAULT_STRIPE_CHARGE_LEAD_MS,
  DEFAULT_STRIPE_MAX_NETWORK_RETRIES,
  DEFAULT_STRIPE_TIMEOUT_MS,
  STRIPE_SECRET_KEY_PATTERN,
  StripeConfigSchema,
} from "./stripe-config.js";
import type { PaymentProvider } from "./types.js";

// ── Stripe Payment Provider ────────────────────────────────────────
//
// Factory that creates a Stripe-backed PaymentProvider. All mutable
// state (SDK client, webhook secret, circuit breaker) lives inside
// the factory closure — no module-level singletons.
//
// Key design decisions:
//   - Lazy client initialization — Stripe SDK only loaded when init()
//     is called, so the module can be imported without side effects
//   - Explicit request timeout and network retries, set from config
//   - Circuit breaker on all API calls, opened only by outages — a 4xx
//     is Stripe answering, and never counts against it
//   - chargeInvoice finds the Stripe invoice an earlier charge of the same
//     invoice ID wrote, checks it bills what this invoice bills, and
//     finishes it, and keys every POST that creates, fills, finalizes or
//     pays it by that ID, so a retried or regenerated charge resumes
//     instead of paying twice. Where its search could miss an earlier
//     charge, it refuses rather than charge again. It finalizes with
//     Stripe's automatic collection off, reads what it finalized back, and
//     turns collection on and pays only when that bills this invoice, so
//     Stripe collects no invoice that bills other content than the charge
//     that issued it was given
//   - Webhook verification via stripe.webhooks.constructEvent()
//

/**
 * Upper bound on the invoices listInvoices reads and chargeInvoice searches
 * for an earlier charge, and on the lines read per invoice.
 */
const MAX_LISTED = 1000;

/** The largest page Stripe's list endpoints return. */
const PAGE_SIZE = 100;

/**
 * How far before an invoice's charge window opens the search for its earlier
 * charge reaches: slack for a clock on this host that runs ahead of the one
 * Stripe stamps `created` with.
 */
const CLOCK_SKEW_SECONDS = 3600;

/** Invoice metadata key that carries the ID chargeInvoice was given. */
const INVOICE_ID_METADATA_KEY = "invoice_id";

/** Invoice metadata key that carries the digest of the content a draft was created for. */
const CONTENT_METADATA_KEY = "invoice_content";

/** Invoice-item metadata key that carries a line's metric name. */
const METRIC_METADATA_KEY = "metric";

/**
 * Invoice-item metadata key that carries a line's quantity. An item priced by
 * `amount` has a Stripe quantity of 1, whatever the line measured.
 */
const QUANTITY_METADATA_KEY = "quantity";

/**
 * Invoice-item metadata key that carries a line's unit price. An item priced
 * by `amount` has a Stripe unit amount equal to that amount, whatever the
 * line's own unit price.
 */
const UNIT_PRICE_METADATA_KEY = "unit_price";

/** Invoice-item metadata key that carries a line's index in `Invoice.lineItems`. */
const LINE_METADATA_KEY = "invoice_line";

interface ListPage<T> {
  data: T[];
  has_more: boolean;
}

/** Makes one Stripe call; every call this provider makes goes through one. */
type StripeCall = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * The idempotency key for one step of charging the invoice `invoiceId`:
 * `create`, `create-replacing-<draft>`, or a write to one Stripe invoice,
 * `<in_...>:item-<index>`, `<in_...>:finalize` or `<in_...>:pay`.
 */
function chargeKey(invoiceId: string, step: string): string {
  return `billing-invoice:${invoiceId}:${step}`;
}

/**
 * A digest of everything a charge writes to Stripe for the lines of
 * `invoice`: its currency and, per line in order, the description, metric,
 * quantity, unit price and amount. A draft carries the digest of the content
 * it was created for.
 */
function contentDigest(invoice: Invoice): string {
  const lines = invoice.lineItems.map((item) => [
    item.description,
    item.metric,
    item.quantity,
    item.unitPrice,
    item.amount,
  ]);
  return createHash("sha256")
    .update(JSON.stringify([invoice.currency, lines]))
    .digest("hex")
    .slice(0, 32);
}

/**
 * The earliest `created` time, in Unix seconds, the search for an earlier
 * charge of `invoice` reads from: the start of its period, less `lookbackMs`
 * and CLOCK_SKEW_SECONDS. chargeInvoice charges nothing before the period
 * start less the charge lead, and init refuses a `lookbackMs` below the
 * lead, so every charge of the invoice's ID lands inside the window.
 *
 * The window hangs from the period rather than from when the invoice was
 * generated. An invoice regenerated for the same period carries a later
 * `createdAt`, so a window from it misses a charge made from the first one,
 * as one billed in advance of its period is. undefined when the period start
 * does not parse, and the search is bounded by MAX_LISTED alone.
 */
function chargedSince(invoice: Invoice, lookbackMs: number): number | undefined {
  const start = Date.parse(invoice.periodStart);
  if (Number.isNaN(start)) return undefined;
  return Math.floor((start - lookbackMs) / 1000) - CLOCK_SKEW_SECONDS;
}

/**
 * A Stripe line as the LineItem it bills. A line a charge wrote carries the
 * metric, quantity and unit price of the line it was written from in its
 * metadata, and reads back as that line: an item priced by `amount` has a
 * Stripe quantity of 1 and a unit amount equal to its amount, which describe
 * nothing the line measured. A line no charge wrote, such as a subscription
 * line or one added in the Dashboard, reads with an empty metric and with
 * Stripe's own quantity and unit amount.
 */
function lineItemOf(line: Stripe.InvoiceLineItem): LineItem {
  const quantity = line.metadata?.[QUANTITY_METADATA_KEY];
  const unitPrice = line.metadata?.[UNIT_PRICE_METADATA_KEY];
  return {
    description: line.description ?? "",
    metric: line.metadata?.[METRIC_METADATA_KEY] ?? "",
    quantity: quantity === undefined ? (line.quantity ?? 0) : Number(quantity),
    // pricing.unit_amount_decimal is a decimal string with up to 12 places;
    // LineItem.unitPrice holds an integer minor-unit amount.
    unitPrice:
      unitPrice === undefined
        ? Math.round(Number(line.pricing?.unit_amount_decimal ?? 0))
        : Number(unitPrice),
    amount: line.amount,
  };
}

/**
 * How the lines on a Stripe draft stand against `invoice`. `carried` holds
 * the index of each line that bills what `invoice` bills at that index.
 * `stray` says the draft also carries a line that does not: one that bills
 * something else at its index, a second line at an index, or a line with no
 * index this invoice has, such as one added in the Dashboard.
 */
function lineState(
  invoice: Invoice,
  lines: Stripe.InvoiceLineItem[],
): { carried: Set<string>; stray: boolean } {
  const expected = new Map(invoice.lineItems.map((item, index) => [String(index), item]));
  const carried = new Set<string>();
  let stray = false;
  for (const line of lines) {
    const index = line.metadata?.[LINE_METADATA_KEY] ?? "";
    const item = expected.get(index);
    if (item === undefined || carried.has(index) || !billsSameLine(lineItemOf(line), item)) {
      stray = true;
    } else {
      carried.add(index);
    }
  }
  return { carried, stray };
}

/**
 * What an issued Stripe invoice bills, each line at the `invoice_line` index
 * it carries, so it compares line for line with the invoice a charge wrote it
 * for. undefined when its lines are not one charge's: unless each index from
 * 0 to the last line is carried by exactly one line, some line has no index,
 * one past the end, or one another line carries too.
 */
function chargedContent(
  charged: Stripe.Invoice,
  lines: Stripe.InvoiceLineItem[],
): InvoiceContent | undefined {
  const atIndex = lines.map((_, index) =>
    lines.filter((line) => line.metadata?.[LINE_METADATA_KEY] === String(index)),
  );
  if (atIndex.some((at) => at.length !== 1)) return undefined;
  return { currency: charged.currency, lineItems: atIndex.map(([line]) => lineItemOf(line!)) };
}

/** The HTTP status a failed Stripe call was answered with; undefined when none came back. */
function statusOf(err: unknown): unknown {
  return (err as { statusCode?: unknown } | null | undefined)?.statusCode;
}

/**
 * A charge's read of the lines on a Stripe invoice issued under its invoice
 * ID stopped at MAX_LISTED. The lines past the bound could bill anything, so
 * the charge can neither report that invoice as billing this one's content
 * nor finish it.
 */
class LinesExhausted extends Error {}

/** The ChargeFailed code for an error a charge's Stripe call threw. */
function failureCode(err: unknown, signal: AbortSignal | undefined): ChargeFailed["code"] {
  if (signal?.aborted && err === signal.reason) return "aborted";
  if (err instanceof LinesExhausted) return "lookup_exhausted";
  if (isStripeOutage(err)) return "unavailable";
  const status = statusOf(err);
  if (status === 429) return "rate_limited";
  return status === 402 ? "declined" : "rejected";
}

/**
 * The result a charge reports for `charged`, a Stripe invoice issued under
 * `invoice`'s ID and carrying `lines`, when it bills other content than
 * `invoice`; undefined when it bills the same. Paying it, or reporting it
 * paid, would leave the difference unbilled with nothing to say so.
 */
function contentChanged(
  invoice: Invoice,
  charged: Stripe.Invoice,
  lines: Stripe.InvoiceLineItem[],
): ChargeContentChanged | undefined {
  const content = chargedContent(charged, lines);
  if (content !== undefined && billsSameContent(content, invoice)) return undefined;

  const billedAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  logger.warn("Stripe invoice issued under this invoice ID bills other content", {
    invoiceId: invoice.id,
    externalId: charged.id,
    status: charged.status,
    billedAmount,
    totalAmount: invoice.totalAmount,
  });
  return {
    ok: false,
    code: "invoice_content_changed",
    externalId: charged.id,
    billedAmount,
    error: `Stripe invoice ${charged.id} bills ${billedAmount} ${charged.currency} for invoice ${invoice.id}, which totals ${invoice.totalAmount} ${invoice.currency}`,
  };
}

/**
 * True when Stripe answered a request with the response it stored for an
 * earlier request carrying the same idempotency key, which it marks
 * `Idempotent-Replayed: true`. The SDK's Node client hands back the
 * response's headers as an object and its fetch client as `Headers`;
 * `new Headers` reads either.
 */
function replayed(response: Stripe.Response<unknown>): boolean {
  return new Headers(response.lastResponse.headers).get("idempotent-replayed") === "true";
}

/**
 * What the Stripe call that left `charged` paid collected: the amount paid, or
 * 0 when Stripe replayed an earlier request's answer, since that request made
 * the payment.
 */
function collectedBy(charged: Stripe.Response<Stripe.Invoice>): number {
  return replayed(charged) ? 0 : charged.amount_paid;
}

/**
 * The result a charge reports for the Stripe invoice it ends on. `collected`
 * is what this call collected, 0 when it made no payment.
 */
function outcome(invoice: Invoice, charged: Stripe.Invoice, collected: number): ChargeResult {
  const fields = { invoiceId: invoice.id, externalId: charged.id, status: charged.status };
  switch (charged.status) {
    case "paid":
      logger.info("Stripe invoice charged", { ...fields, collected });
      return { ok: true, externalId: charged.id, collected };
    // Stripe answers a payment that fails with an error, so an invoice still
    // open after one is a payment that has not settled, such as a bank debit.
    case "open":
      logger.info("Stripe invoice payment pending", fields);
      return {
        ok: false,
        code: "payment_pending",
        externalId: charged.id,
        error: `Stripe invoice ${charged.id} is open with its payment not settled`,
      };
    default:
      logger.warn("Stripe invoice closed without payment", fields);
      return {
        ok: false,
        code: "invoice_closed",
        externalId: charged.id,
        error: `Stripe invoice ${charged.id} is ${charged.status}`,
      };
  }
}

/**
 * True when a failed Stripe call is evidence that Stripe is unavailable: a
 * connection failure or timeout, which carries no HTTP status, or a 5xx. A 4xx
 * — a declined card, an invalid request, a rejected key, a rate limit — is
 * Stripe answering. Counting it would let a run of declined cards as long as
 * the breaker's failureThreshold open it and block every customer's billing
 * for the reset window.
 */
export function isStripeOutage(err: unknown): boolean {
  const status = statusOf(err);
  return !(typeof status === "number" && status >= 400 && status < 500);
}

/**
 * Make a DELETE through `call`, reading a 404 as done. A DELETE carries no
 * idempotency key, so a retry of one Stripe already applied, its answer lost
 * to a timeout or a closed connection, finds nothing left to delete.
 */
async function deleteThrough(call: StripeCall, del: () => Promise<unknown>): Promise<void> {
  try {
    await call(del);
  } catch (err) {
    if (statusOf(err) !== 404) throw err;
  }
}

/**
 * Read a Stripe list to its end, to MAX_LISTED items, or to the first page
 * holding an item `until` accepts, whichever comes first, cursoring with
 * `starting_after` on the last item's ID. `first` is a page already in hand,
 * such as the lines embedded in an invoice. `truncated` says the bound, not
 * the end of the list, stopped the read.
 */
async function collectPages<T extends { id?: string }>(
  fetchPage: (startingAfter: string | undefined) => Promise<ListPage<T>>,
  { first, until }: { first?: ListPage<T>; until?: (item: T) => boolean } = {},
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let page = first ?? (await fetchPage(undefined));

  for (;;) {
    items.push(...page.data);
    if (until !== undefined && page.data.some(until)) return { items, truncated: false };
    if (items.length >= MAX_LISTED) {
      return {
        items: items.slice(0, MAX_LISTED),
        truncated: page.has_more || items.length > MAX_LISTED,
      };
    }

    const cursor = page.data.at(-1)?.id;
    if (!page.has_more || cursor === undefined) return { items, truncated: false };
    page = await fetchPage(cursor);
  }
}

function createStripeProvider(): PaymentProvider {
  let client: Stripe | null = null;
  let webhookSecret: string | null = null;
  let chargeLeadMs = DEFAULT_STRIPE_CHARGE_LEAD_MS;
  let lookbackMs = DEFAULT_STRIPE_CHARGE_LEAD_MS;

  const breaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30_000,
    halfOpenMaxAttempts: 2,
    isFailure: isStripeOutage,
  });

  const withBreaker: StripeCall = (fn) => breaker.execute(fn);

  function requireClient(): Stripe {
    if (!client) throw new ProviderConfigError("Stripe provider not initialized");
    return client;
  }

  /**
   * Every line of an invoice, to MAX_LISTED: the page embedded in it, then
   * the rest. Paging starts from the embedded page, so every page fetched
   * here has a cursor.
   */
  function invoiceLines(stripe: Stripe, invoice: Stripe.Invoice, call: StripeCall) {
    return collectPages(
      (startingAfter) =>
        call(() =>
          stripe.invoices.listLineItems(invoice.id, {
            limit: PAGE_SIZE,
            starting_after: startingAfter,
          }),
        ),
      { first: invoice.lines ?? { data: [], has_more: false } },
    );
  }

  /**
   * Every line of `charged`, a Stripe invoice under the ID of `invoice`: one
   * an earlier charge wrote, or the one this charge finalized. A read the
   * bound stops throws LinesExhausted, which the charge reports as
   * lookup_exhausted: it cannot compare lines it has not read.
   */
  async function comparableLines(
    stripe: Stripe,
    invoice: Invoice,
    charged: Stripe.Invoice,
    call: StripeCall,
  ): Promise<Stripe.InvoiceLineItem[]> {
    const { items, truncated } = await invoiceLines(stripe, charged, call);
    if (truncated) {
      throw new LinesExhausted(
        `Read ${MAX_LISTED} of Stripe invoice ${charged.id}'s lines without reaching its last, so it cannot be compared with invoice ${invoice.id}; compare the two in Stripe`,
      );
    }
    return items;
  }

  /**
   * Fetches one page of a customer's invoices, newest first, created at or
   * after `since` when it is given.
   */
  function customerInvoices(stripe: Stripe, customerId: string, call: StripeCall, since?: number) {
    return (startingAfter: string | undefined) =>
      call(() =>
        stripe.invoices.list({
          customer: customerId,
          limit: PAGE_SIZE,
          ...(since === undefined ? {} : { created: { gte: since } }),
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        }),
      );
  }

  /**
   * The Stripe invoice an earlier charge of `invoice` wrote, found by the ID
   * in its `invoice_id` metadata among the customer's invoices created since
   * `since`, so a charge reads only the invoices a customer gets in that
   * window: one list call when there are fewer than PAGE_SIZE of them. They
   * are read newest first through `invoices.list` rather than
   * `invoices.search`: Stripe documents search as unfit for read-after-write,
   * its index trailing writes by up to a minute and by up to an hour during an
   * outage, and a retry after a timeout reads seconds after the write it is
   * looking for. The read stops after MAX_LISTED invoices; `exhausted` says
   * it stopped there with no earlier charge found, so one may lie past it.
   */
  async function earlierCharge(
    stripe: Stripe,
    invoice: Invoice,
    since: number | undefined,
    call: StripeCall,
  ): Promise<{ earlier?: Stripe.Invoice; exhausted: boolean }> {
    const ours = (candidate: Stripe.Invoice) =>
      candidate.metadata?.[INVOICE_ID_METADATA_KEY] === invoice.id;
    const { items, truncated } = await collectPages(
      customerInvoices(stripe, invoice.customerId, call, since),
      { until: ours },
    );
    return { earlier: items.find(ours), exhausted: truncated };
  }

  /** Pays an open Stripe invoice, keyed by the invoice ID and that Stripe invoice. */
  function payInvoice(stripe: Stripe, invoice: Invoice, open: Stripe.Invoice, call: StripeCall) {
    return call(() =>
      stripe.invoices.pay(open.id, {}, { idempotencyKey: chargeKey(invoice.id, `${open.id}:pay`) }),
    );
  }

  /**
   * Turns on Stripe's automatic collection on `open`, an open Stripe invoice
   * issued under `invoice`'s ID whose finalized lines bill what `invoice`
   * bills, unless it is on already, and pays it. A charge finalizes with
   * automatic collection off and turns it on only here, so Stripe collects
   * no invoice whose lines no charge has found to bill its own invoice, such
   * as one a concurrent charge of the ID emptied in part before it was
   * finalized. Collection stays on after a declined payment, and Stripe
   * retries it.
   *
   * The update is not keyed by the invoice ID. Setting `auto_advance` is
   * idempotent on its own, and Stripe answers a key it holds with the
   * response it stored, failures included, so a keyed update that failed
   * would fail the same way for every later charge of the ID while Stripe
   * holds the key. Stripe refuses `auto_advance` with a 400 on an invoice
   * that is no longer open, as one a concurrent charge of the same content
   * has paid, so a 400 lets the payment go ahead: it is keyed, and reports
   * what became of the invoice.
   */
  async function collect(
    stripe: Stripe,
    invoice: Invoice,
    open: Stripe.Invoice,
    call: StripeCall,
  ): Promise<ChargeResult> {
    if (open.auto_advance !== true) {
      try {
        await call(() => stripe.invoices.update(open.id, { auto_advance: true }));
      } catch (err) {
        if (statusOf(err) !== 400) throw err;
      }
    }
    const paid = await payInvoice(stripe, invoice, open, call);
    return outcome(invoice, paid, collectedBy(paid));
  }

  /**
   * Resume from an invoice an earlier charge issued. A void or uncollectible
   * one takes no payment and is reported before any line is read. An open or
   * paid one is checked against `invoice` line for line before anything
   * else, and one that bills other content is reported and left as it is.
   */
  async function resumeIssued(
    stripe: Stripe,
    invoice: Invoice,
    issued: Stripe.Invoice,
    call: StripeCall,
  ): Promise<ChargeResult> {
    if (issued.status !== "open" && issued.status !== "paid") return outcome(invoice, issued, 0);

    const lines = await comparableLines(stripe, invoice, issued, call);
    const changed = contentChanged(invoice, issued, lines);
    if (changed !== undefined) return changed;

    if (issued.status === "paid") return outcome(invoice, issued, 0);
    return collect(stripe, invoice, issued, call);
  }

  /**
   * The draft this charge adds its lines to, the indexes of the lines it
   * already carries, and the stale draft it replaces, if any. A draft an
   * earlier charge left is kept when it was created for this content and
   * carries no stray line. Any other draft has billed nobody, so it is
   * replaced: its lines are deleted, and a draft is created under a key that
   * names the one it replaces. Every later write goes to the new draft under
   * keys of its own, so none reuses a key a stale line was written under. The
   * lines are deleted here because Stripe documents no fate for the items on
   * a deleted draft; the emptied draft is the caller's to delete.
   */
  async function draftToFinish(
    stripe: Stripe,
    invoice: Invoice,
    earlier: Stripe.Invoice | undefined,
    call: StripeCall,
  ): Promise<{ draft: Stripe.Invoice; carried: Set<string>; replaced?: string }> {
    const digest = contentDigest(invoice);
    let replacing: string | undefined;

    if (earlier !== undefined) {
      const lines = await comparableLines(stripe, invoice, earlier, call);
      const { carried, stray } = lineState(invoice, lines);
      if (!stray && earlier.metadata?.[CONTENT_METADATA_KEY] === digest) {
        return { draft: earlier, carried };
      }
      const items = lines.flatMap((line) => line.parent?.invoice_item_details?.invoice_item ?? []);
      for (const item of items) {
        await deleteThrough(call, () => stripe.invoiceItems.del(item));
      }
      replacing = earlier.id;
    }

    const draft = await call(() =>
      stripe.invoices.create(
        {
          customer: invoice.customerId,
          currency: invoice.currency,
          // Off while lines are added: Stripe finalizes a draft that has
          // automatic advancement on about an hour after creating it, so a
          // charge interrupted before its last line would be finalized short
          // of it. It stays off through finalizing, and collect turns it on.
          auto_advance: false,
          // The digest makes the create's parameters name its content, so a
          // create of this ID for other content cannot reuse the key: Stripe
          // refuses it instead of handing back the earlier charge's invoice.
          metadata: { [INVOICE_ID_METADATA_KEY]: invoice.id, [CONTENT_METADATA_KEY]: digest },
        },
        {
          idempotencyKey: chargeKey(
            invoice.id,
            replacing === undefined ? "create" : `create-replacing-${replacing}`,
          ),
        },
      ),
    );

    return { draft, carried: new Set(), replaced: replacing };
  }

  /**
   * Add the lines of `invoice` that `draft` does not carry yet, then finalize
   * it with automatic collection off: a charge of the ID for other content
   * can delete lines from the draft until it is finalized, so collection
   * waits for the charge to read the finalized lines back. Every write is
   * keyed by the invoice ID and the draft, so a draft that replaced another
   * gets keys of its own.
   */
  async function finishDraft(
    stripe: Stripe,
    invoice: Invoice,
    draft: Stripe.Invoice,
    carried: Set<string>,
    call: StripeCall,
  ): Promise<Stripe.Response<Stripe.Invoice>> {
    for (const [index, item] of invoice.lineItems.entries()) {
      if (carried.has(String(index))) continue;
      await call(() =>
        stripe.invoiceItems.create(
          {
            customer: invoice.customerId,
            invoice: draft.id,
            amount: item.amount,
            currency: invoice.currency,
            description: item.description,
            metadata: {
              [METRIC_METADATA_KEY]: item.metric,
              [QUANTITY_METADATA_KEY]: String(item.quantity),
              [UNIT_PRICE_METADATA_KEY]: String(item.unitPrice),
              [LINE_METADATA_KEY]: String(index),
            },
          },
          { idempotencyKey: chargeKey(invoice.id, `${draft.id}:item-${index}`) },
        ),
      );
    }
    return call(() =>
      stripe.invoices.finalizeInvoice(
        draft.id,
        { auto_advance: false },
        { idempotencyKey: chargeKey(invoice.id, `${draft.id}:finalize`) },
      ),
    );
  }

  return {
    name: "stripe",

    async init(config: BillingConfig): Promise<void> {
      const secretKey = config.stripe?.secretKey ?? process.env.STRIPE_SECRET_KEY;

      if (!secretKey) {
        throw new ProviderConfigError(
          "Stripe secret key is required. Set config.stripe.secretKey or STRIPE_SECRET_KEY env var.",
        );
      }
      // The config schema checks a key the config carries; this also checks
      // one read from the environment.
      if (!STRIPE_SECRET_KEY_PATTERN.test(secretKey)) {
        throw new ProviderConfigError(
          "Stripe secret key must be a secret key (sk_...) or restricted key (rk_...). Check config.stripe.secretKey or the STRIPE_SECRET_KEY env var.",
        );
      }

      // createBillingService validates the stripe block before any provider
      // starts. A provider started on its own, through getProvider("stripe"),
      // is held to the same schema here: a `lookbackMs` below the lead, among
      // the values it refuses, would hide earlier charges from the search.
      const parsed = StripeConfigSchema.safeParse(config.stripe ?? {});
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((issue) => `stripe.${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        throw new ProviderConfigError(`Invalid billing config: ${issues}`);
      }

      webhookSecret = config.stripe?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;
      chargeLeadMs = config.stripe?.chargeLeadMs ?? DEFAULT_STRIPE_CHARGE_LEAD_MS;
      lookbackMs = config.stripe?.lookbackMs ?? chargeLeadMs;

      // Lazy load the Stripe SDK
      //
      // No `apiVersion` is passed. `Stripe.LatestApiVersion` is `typeof
      // ApiVersion` — the single version string the installed SDK was generated
      // against — and the constructor option is typed as exactly that, so the
      // only value that compiles is the one the client already falls back to.
      // Writing it out cannot change which `Stripe-Version` is sent; it can only
      // stop compiling on the next SDK release, on a tree nobody edited.
      const { default: StripeSdk } = await import("stripe");
      client = new StripeSdk(secretKey, {
        timeout: config.stripe?.timeoutMs ?? DEFAULT_STRIPE_TIMEOUT_MS,
        maxNetworkRetries: config.stripe?.maxNetworkRetries ?? DEFAULT_STRIPE_MAX_NETWORK_RETRIES,
        // StripeConfig types the client by the two methods the SDK calls on
        // it, so the config types import nothing from the SDK; the schema
        // check above refuses a client without both.
        httpClient: config.stripe?.httpClient as Stripe.HttpClient | undefined,
      });

      logger.info("Stripe provider initialized");
    },

    async createCustomer(
      email: string,
      name: string,
      metadata?: Record<string, string>,
    ): Promise<Customer> {
      const stripe = requireClient();

      const stripeCustomer = await withBreaker(() =>
        stripe.customers.create({ email, name, metadata }),
      );

      logger.info("Stripe customer created", { externalId: stripeCustomer.id });

      return {
        id: stripeCustomer.id,
        email: stripeCustomer.email ?? email,
        name: stripeCustomer.name ?? name,
        externalId: stripeCustomer.id,
        metadata: metadata ?? {},
      };
    },

    async createSubscription(customerId: string, planId: string): Promise<Subscription> {
      const stripe = requireClient();

      const stripeSub = await withBreaker(() =>
        stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: planId }],
        }),
      );

      logger.info("Stripe subscription created", { externalId: stripeSub.id });

      const period = stripeSub.items.data[0];
      if (!period) throw new Error("Stripe returned a subscription with no items");

      return {
        id: stripeSub.id,
        customerId,
        planId,
        status: mapStripeSubStatus(stripeSub.status),
        // A subscription's billing period lives on its items, because a
        // subscription with staggered items has more than one. A single-price
        // subscription — what this provider creates — has exactly one item,
        // so its period is the subscription's.
        currentPeriodStart: new Date(period.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(period.current_period_end * 1000).toISOString(),
        externalId: stripeSub.id,
      };
    },

    async chargeInvoice(invoice: Invoice, options: ChargeOptions = {}): Promise<ChargeResult> {
      const stripe = requireClient();
      const { signal } = options;

      // A charge made before the window opens could sit outside the search a
      // later charge of this ID makes, so it is refused before anything is
      // written. The search reaches back `lookbackMs`, which init refuses
      // below the lead. A period start that does not parse opens no window,
      // and the search then runs back to MAX_LISTED invoices with no time
      // bound.
      const opens = Date.parse(invoice.periodStart) - chargeLeadMs;
      if (Date.now() < opens) {
        logger.warn("Stripe charge refused before its window opens", {
          invoiceId: invoice.id,
          periodStart: invoice.periodStart,
          chargeLeadMs,
        });
        return {
          ok: false,
          code: "before_charge_window",
          error: `Invoice ${invoice.id} can be charged from ${new Date(opens).toISOString()}, stripe.chargeLeadMs (${chargeLeadMs}) before its period starts at ${invoice.periodStart}`,
        };
      }

      // No call starts once the signal has aborted. The SDK takes no signal,
      // so a call already in flight runs on: each attempt to timeoutMs,
      // retried up to maxNetworkRetries times (once after a closed connection
      // even at 0) with up to 5 seconds of backoff before each retry. The
      // charge settles when that call does.
      const step: StripeCall = (fn) => {
        signal?.throwIfAborted();
        return withBreaker(fn);
      };

      // An earlier charge of this invoice ID — a retry after a timeout, a
      // crash, or a lost response, or an invoice regenerated for the same
      // customer and period — left a Stripe invoice carrying the ID in its
      // metadata, and the charge resumes from it. An issued invoice has to
      // bill what this invoice bills, line for line: one that does is paid if
      // it is open and reported if it is paid, and one that does not is
      // reported as invoice_content_changed and left as it is. Stripe's
      // automatic collection is on only for an invoice a charge found billing
      // its own invoice (collect). A draft is finished when it was created
      // for this content and replaced when it was not. A Stripe
      // invoice is created only when the search found no earlier charge and
      // read the whole window doing so; a search cut short at MAX_LISTED
      // reports lookup_exhausted unless the caller assumes the ID uncharged.
      // An invoice under this ID with more than MAX_LISTED lines is reported
      // as lookup_exhausted too, since its lines cannot be compared.
      //
      // Every POST but collect's update is also keyed by the invoice ID and
      // its step, and every such write to a Stripe invoice by that invoice as
      // well. Stripe holds a key for at least 24 hours and replays the stored
      // response, failures included, so two charges that both miss the lookup
      // still create one invoice and pay it once, and the one whose payment
      // Stripe replayed reports nothing collected. A declined payment stays
      // declined for this invoice ID while Stripe holds its key. Collecting
      // it after that is Stripe's automatic collection on the open invoice,
      // which reports through `invoice.paid` and `invoice.payment_failed`. A
      // DELETE carries no key; a retried one Stripe already applied answers
      // 404, read as done.
      let externalId: string | undefined;

      try {
        const since = chargedSince(invoice, lookbackMs);
        const { earlier, exhausted } = await earlierCharge(stripe, invoice, since, step);
        if (exhausted) {
          logger.warn("Stripe invoice lookup stopped at its bound with no earlier charge found", {
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            since,
            limit: MAX_LISTED,
            assumeUncharged: options.assumeUncharged === true,
          });
          if (!options.assumeUncharged) {
            return {
              ok: false,
              code: "lookup_exhausted",
              error: `Read ${MAX_LISTED} of customer ${invoice.customerId}'s Stripe invoices, newest first, without finding an earlier charge of invoice ${invoice.id}; charge it with assumeUncharged once Stripe holds no invoice with metadata invoice_id ${invoice.id}`,
            };
          }
        }
        externalId = earlier?.id;
        if (earlier !== undefined && earlier.status !== "draft") {
          return await resumeIssued(stripe, invoice, earlier, step);
        }

        const { draft, carried, replaced } = await draftToFinish(stripe, invoice, earlier, step);
        externalId = draft.id;
        if (replaced !== undefined) {
          // Emptied, and older than its replacement, which the lookup reads
          // first, so a charge that stops here leaves nothing that bills.
          await deleteThrough(step, () => stripe.invoices.del(replaced));
          logger.warn("Stripe draft replaced: it was created for other content", {
            invoiceId: invoice.id,
            replaced,
            externalId,
          });
        }
        const finalized = await finishDraft(stripe, invoice, draft, carried, step);
        // A charge of this ID for other content can delete the draft's lines
        // between this charge's read of them and its finalize, and Stripe then
        // finalizes what is left. A finalized invoice cannot change, so
        // its lines are read back once, and it is collected, or reported
        // paid, only when they bill this invoice. One that does not is left
        // open with Stripe's automatic collection off, as it was finalized.
        const lines = await comparableLines(stripe, invoice, finalized, step);
        const changed = contentChanged(invoice, finalized, lines);
        if (changed !== undefined) return changed;
        // Stripe marks an invoice that owes nothing paid when it finalizes it.
        if (finalized.status !== "open") return outcome(invoice, finalized, collectedBy(finalized));
        return await collect(stripe, invoice, finalized, step);
      } catch (err) {
        const code = failureCode(err, signal);
        const error = err instanceof Error ? err.message : String(err);
        logger.error("Stripe charge failed", { invoiceId: invoice.id, externalId, code, error });
        return { ok: false, code, externalId, error };
      }
    },

    async handleWebhook(payload: string, signature: string): Promise<BillingWebhookEvent> {
      const stripe = requireClient();

      if (!webhookSecret) {
        throw new ProviderConfigError(
          "Stripe webhook secret is required. Set config.stripe.webhookSecret or STRIPE_WEBHOOK_SECRET env var.",
        );
      }

      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

      logger.info("Stripe webhook verified", { type: event.type, id: event.id });

      return {
        id: event.id,
        type: event.type,
        payload: webhookPayload(event),
        timestamp: new Date(event.created * 1000).toISOString(),
      };
    },

    async listInvoices(customerId: string): Promise<Invoice[]> {
      const stripe = requireClient();

      const { items, truncated } = await collectPages(
        customerInvoices(stripe, customerId, withBreaker),
      );
      if (truncated) {
        logger.warn("Stripe invoice listing truncated", { customerId, limit: MAX_LISTED });
      }

      const invoices: Invoice[] = [];
      for (const inv of items) {
        const { items: lines, truncated: linesTruncated } = await invoiceLines(
          stripe,
          inv,
          withBreaker,
        );
        if (linesTruncated) {
          logger.warn("Stripe invoice lines truncated", { externalId: inv.id, limit: MAX_LISTED });
        }
        invoices.push({
          // An invoice chargeInvoice wrote lists under the ID it was charged
          // under, with the lines it was charged with, so it matches the
          // invoice generateInvoice returned and can be passed back as
          // `billed`; any other invoice lists under its Stripe ID.
          id: inv.metadata?.[INVOICE_ID_METADATA_KEY] ?? inv.id,
          customerId,
          periodStart: new Date((inv.period_start ?? 0) * 1000).toISOString(),
          periodEnd: new Date((inv.period_end ?? 0) * 1000).toISOString(),
          lineItems: lines.map(lineItemOf),
          totalAmount: inv.total,
          currency: inv.currency ?? "usd",
          status: mapStripeInvoiceStatus(inv.status),
          createdAt: new Date(inv.created * 1000).toISOString(),
          externalId: inv.id,
        });
      }
      return invoices;
    },

    async close(): Promise<void> {
      client = null;
      webhookSecret = null;
      logger.info("Stripe provider closed");
    },
  };
}

/**
 * The object a verified event describes. On a `customer.subscription.*` event
 * the subscription's raw Stripe status is replaced by the mapped one, so a
 * handler reads the same statuses createSubscription returns and a status this
 * module does not recognize cannot read as entitled.
 */
function webhookPayload(event: Stripe.Event): unknown {
  const object = event.data.object;
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = object as Stripe.Subscription;
    return { ...subscription, status: mapStripeSubStatus(subscription.status) };
  }
  return object;
}

const SUBSCRIPTION_STATUSES = {
  active: true,
  trialing: true,
  incomplete: true,
  incomplete_expired: true,
  past_due: true,
  unpaid: true,
  paused: true,
  canceled: true,
} satisfies Record<Subscription["status"], true>;

// A status this table does not know maps to `incomplete`, never `active`:
// a subscription whose state cannot be read grants no access to the plan.
function mapStripeSubStatus(status: Stripe.Subscription.Status): Subscription["status"] {
  if (Object.hasOwn(SUBSCRIPTION_STATUSES, status)) return status as Subscription["status"];
  logger.warn("Unrecognized Stripe subscription status read as incomplete", { status });
  return "incomplete";
}

const INVOICE_STATUSES = {
  draft: true,
  open: true,
  paid: true,
  void: true,
  uncollectible: true,
} satisfies Record<Invoice["status"], true>;

function mapStripeInvoiceStatus(status: Stripe.Invoice.Status | null): Invoice["status"] {
  if (status !== null && Object.hasOwn(INVOICE_STATUSES, status)) {
    return status as Invoice["status"];
  }
  return "draft";
}

// Self-register factory
registerProvider("stripe", createStripeProvider);

export { createStripeProvider };
