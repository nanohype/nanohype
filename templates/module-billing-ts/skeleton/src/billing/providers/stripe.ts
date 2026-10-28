import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { DEFAULT_STRIPE_MAX_NETWORK_RETRIES, DEFAULT_STRIPE_TIMEOUT_MS } from "../config.js";
import { logger } from "../logger.js";
import { CircuitBreaker } from "../resilience/circuit-breaker.js";
import type {
  BillingConfig,
  BillingWebhookEvent,
  ChargeFailed,
  ChargeOptions,
  ChargeResult,
  Customer,
  Invoice,
  LineItem,
  Subscription,
} from "../types.js";
import { registerProvider } from "./registry.js";
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
//     finishes it, and keys every write by that ID, so a retried or
//     regenerated charge resumes instead of paying twice
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
 * How far before an invoice was generated, or its period started, the search
 * for its earlier charge reaches: slack for a clock on this host that runs
 * ahead of Stripe's.
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
 * quantity and amount. A draft carries the digest of the content it was
 * created for.
 */
function contentDigest(invoice: Invoice): string {
  const lines = invoice.lineItems.map((item) => [
    item.description,
    item.metric,
    item.quantity,
    item.amount,
  ]);
  return createHash("sha256")
    .update(JSON.stringify([invoice.currency, lines]))
    .digest("hex")
    .slice(0, 32);
}

/**
 * The earliest `created` time, in Unix seconds, the search for an earlier
 * charge of `invoice` reads from: whichever is earlier of when the invoice
 * was generated and when its period started, less CLOCK_SKEW_SECONDS. That
 * finds every earlier charge of this invoice, which came after it was
 * generated, and every earlier charge of its period made once the period
 * had started, however much later the invoice was regenerated. undefined
 * when neither parses, and the search is bounded by MAX_LISTED alone.
 */
function chargedSince(invoice: Invoice): number | undefined {
  const instants = [invoice.periodStart, invoice.createdAt]
    .map((bound) => Date.parse(bound))
    .filter((ms) => !Number.isNaN(ms));
  if (instants.length === 0) return undefined;
  return Math.floor(Math.min(...instants) / 1000) - CLOCK_SKEW_SECONDS;
}

/**
 * True when a Stripe line bills what `item` bills: the same amount, and the
 * metric and quantity a charge wrote on it.
 */
function billsAs(line: Stripe.InvoiceLineItem, item: LineItem): boolean {
  return (
    line.amount === item.amount &&
    line.metadata[METRIC_METADATA_KEY] === item.metric &&
    line.metadata[QUANTITY_METADATA_KEY] === String(item.quantity)
  );
}

/**
 * How the lines on a Stripe invoice stand against `invoice`. `carried` holds
 * the index of each line that bills what `invoice` bills at that index.
 * `stray` says the Stripe invoice also carries a line that does not: one
 * that bills something else at its index, a second line at an index, or a
 * line with no index this invoice has, such as one added in the Dashboard.
 */
function lineState(
  invoice: Invoice,
  lines: Stripe.InvoiceLineItem[],
): { carried: Set<string>; stray: boolean } {
  const expected = new Map(invoice.lineItems.map((item, index) => [String(index), item]));
  const carried = new Set<string>();
  let stray = false;
  for (const line of lines) {
    const index = line.metadata[LINE_METADATA_KEY] ?? "";
    const item = expected.get(index);
    if (item === undefined || carried.has(index) || !billsAs(line, item)) {
      stray = true;
    } else {
      carried.add(index);
    }
  }
  return { carried, stray };
}

/** The ChargeFailed code for an error a charge's Stripe call threw. */
function failureCode(err: unknown, signal: AbortSignal | undefined): ChargeFailed["code"] {
  if (signal?.aborted && err === signal.reason) return "aborted";
  if (isStripeOutage(err)) return "unavailable";
  return (err as { statusCode: number }).statusCode === 402 ? "declined" : "rejected";
}

/**
 * The result a charge reports for the Stripe invoice it ends on. `collected`
 * is what this call collected, 0 when it made no payment.
 */
function outcome(invoice: Invoice, charged: Stripe.Invoice, collected: number): ChargeResult {
  logger.info("Stripe invoice charged", {
    invoiceId: invoice.id,
    externalId: charged.id,
    status: charged.status,
    collected,
  });
  switch (charged.status) {
    case "paid":
      return { ok: true, externalId: charged.id, collected };
    // Stripe answers a payment that fails with an error, so an invoice still
    // open after one is a payment that has not settled, such as a bank debit.
    case "open":
      return {
        ok: false,
        code: "payment_pending",
        externalId: charged.id,
        error: `Stripe invoice ${charged.id} is open with its payment not settled`,
      };
    default:
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
  const status = (err as { statusCode?: unknown } | null | undefined)?.statusCode;
  return !(typeof status === "number" && status >= 400 && status < 500);
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

  const breaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30_000,
    halfOpenMaxAttempts: 2,
    isFailure: isStripeOutage,
  });

  const withBreaker: StripeCall = (fn) => breaker.execute(fn);

  function requireClient(): Stripe {
    if (!client) throw new Error("Stripe provider not initialized");
    return client;
  }

  /**
   * Every line of an invoice: the page embedded in it, then the rest. Paging
   * starts from the embedded page, so every page fetched here has a cursor.
   */
  async function invoiceLines(
    stripe: Stripe,
    invoice: Stripe.Invoice,
    call: StripeCall,
  ): Promise<Stripe.InvoiceLineItem[]> {
    const { items, truncated } = await collectPages(
      (startingAfter) =>
        call(() =>
          stripe.invoices.listLineItems(invoice.id, {
            limit: PAGE_SIZE,
            starting_after: startingAfter,
          }),
        ),
      { first: invoice.lines ?? { data: [], has_more: false } },
    );
    if (truncated) {
      logger.warn("Stripe invoice lines truncated", { externalId: invoice.id, limit: MAX_LISTED });
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
   * chargedSince(invoice), so a charge reads only the invoices a customer
   * gets in that window: one list call when there are fewer than PAGE_SIZE
   * of them. They are read newest first through `invoices.list` rather than
   * `invoices.search`: Stripe documents search as unfit for read-after-write,
   * its index trailing writes by up to a minute and by up to an hour during an
   * outage, and a retry after a timeout reads seconds after the write it is
   * looking for. The read stops after MAX_LISTED invoices, so an earlier
   * charge is found when it is among the customer's newest MAX_LISTED in that
   * window.
   */
  async function earlierCharge(
    stripe: Stripe,
    invoice: Invoice,
    call: StripeCall,
  ): Promise<Stripe.Invoice | undefined> {
    const ours = (candidate: Stripe.Invoice) =>
      candidate.metadata?.[INVOICE_ID_METADATA_KEY] === invoice.id;
    const since = chargedSince(invoice);
    const { items, truncated } = await collectPages(
      customerInvoices(stripe, invoice.customerId, call, since),
      { until: ours },
    );
    if (truncated) {
      logger.warn("Stripe invoice lookup stopped at its bound with no earlier charge found", {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        since,
        limit: MAX_LISTED,
      });
    }
    return items.find(ours);
  }

  /** Pays an open Stripe invoice, keyed by the invoice ID and that Stripe invoice. */
  function payInvoice(stripe: Stripe, invoice: Invoice, open: Stripe.Invoice, call: StripeCall) {
    return call(() =>
      stripe.invoices.pay(open.id, {}, { idempotencyKey: chargeKey(invoice.id, `${open.id}:pay`) }),
    );
  }

  /**
   * Resume from an invoice an earlier charge issued. An open or paid one is
   * checked against `invoice` line for line before anything else: one that
   * bills other content is reported and left as it is, since paying it, or
   * reporting it paid, would leave the difference unbilled. A void or
   * uncollectible one takes no payment.
   */
  async function resumeIssued(
    stripe: Stripe,
    invoice: Invoice,
    issued: Stripe.Invoice,
    call: StripeCall,
  ): Promise<ChargeResult> {
    if (issued.status !== "open" && issued.status !== "paid") return outcome(invoice, issued, 0);

    const lines = await invoiceLines(stripe, issued, call);
    const { carried, stray } = lineState(invoice, lines);
    if (
      stray ||
      carried.size !== invoice.lineItems.length ||
      issued.currency !== invoice.currency.toLowerCase()
    ) {
      const billedAmount = lines.reduce((sum, line) => sum + line.amount, 0);
      logger.warn("Stripe invoice an earlier charge issued bills other content", {
        invoiceId: invoice.id,
        externalId: issued.id,
        billedAmount,
        totalAmount: invoice.totalAmount,
      });
      return {
        ok: false,
        code: "invoice_content_changed",
        externalId: issued.id,
        billedAmount,
        error: `Stripe invoice ${issued.id} bills ${billedAmount} ${issued.currency} for invoice ${invoice.id}, which totals ${invoice.totalAmount} ${invoice.currency}`,
      };
    }

    if (issued.status === "paid") return outcome(invoice, issued, 0);
    const paid = await payInvoice(stripe, invoice, issued, call);
    return outcome(invoice, paid, paid.amount_paid);
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
      const lines = await invoiceLines(stripe, earlier, call);
      const { carried, stray } = lineState(invoice, lines);
      if (!stray && earlier.metadata?.[CONTENT_METADATA_KEY] === digest) {
        return { draft: earlier, carried };
      }
      const items = lines.flatMap((line) => line.parent?.invoice_item_details?.invoice_item ?? []);
      for (const item of items) {
        await call(() => stripe.invoiceItems.del(item));
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
          // of it. Finalizing turns it on.
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
   * it with automatic collection on. Every write is keyed by the invoice ID
   * and the draft, so a draft that replaced another gets keys of its own.
   */
  async function finishDraft(
    stripe: Stripe,
    invoice: Invoice,
    draft: Stripe.Invoice,
    carried: Set<string>,
    call: StripeCall,
  ): Promise<Stripe.Invoice> {
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
        { auto_advance: true },
        { idempotencyKey: chargeKey(invoice.id, `${draft.id}:finalize`) },
      ),
    );
  }

  return {
    name: "stripe",

    async init(config: BillingConfig): Promise<void> {
      const secretKey = config.stripe?.secretKey ?? process.env.STRIPE_SECRET_KEY;

      if (!secretKey) {
        throw new Error(
          "Stripe secret key is required. Set config.stripe.secretKey or STRIPE_SECRET_KEY env var.",
        );
      }

      webhookSecret = config.stripe?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;

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
        // BillingConfig types the client by the two methods the SDK calls on
        // it, so the provider-agnostic types import nothing from the SDK;
        // createBillingService checks both are there before a provider starts.
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
      // reported as invoice_content_changed. A draft is finished when it was
      // created for this content and replaced when it was not. Only when there
      // is no earlier charge is a Stripe invoice created.
      //
      // Every POST is also keyed by the invoice ID and its step, and every
      // write to a Stripe invoice by that invoice as well. Stripe holds a key
      // for at least 24 hours and replays the stored response, failures
      // included, so two charges that both miss the lookup still create one
      // invoice and pay it once, though each reports the payment as its own,
      // and a declined payment stays declined for this invoice ID while
      // Stripe holds its key. Collecting it after that is Stripe's automatic
      // collection on the open invoice, which reports through `invoice.paid`
      // and `invoice.payment_failed`.
      let externalId: string | undefined;

      try {
        const earlier = await earlierCharge(stripe, invoice, step);
        externalId = earlier?.id;
        if (earlier !== undefined && earlier.status !== "draft") {
          return await resumeIssued(stripe, invoice, earlier, step);
        }

        const { draft, carried, replaced } = await draftToFinish(stripe, invoice, earlier, step);
        externalId = draft.id;
        if (replaced !== undefined) {
          // Emptied, and older than its replacement, which the lookup reads
          // first, so a charge that stops here leaves nothing that bills.
          await step(() => stripe.invoices.del(replaced));
          logger.warn("Stripe draft replaced: it was created for other content", {
            invoiceId: invoice.id,
            replaced,
            externalId,
          });
        }
        const finalized = await finishDraft(stripe, invoice, draft, carried, step);
        // Stripe marks an invoice that owes nothing paid when it finalizes it.
        if (finalized.status !== "open") return outcome(invoice, finalized, finalized.amount_paid);
        const paid = await payInvoice(stripe, invoice, finalized, step);
        return outcome(invoice, paid, paid.amount_paid);
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
        throw new Error(
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
        const lines = await invoiceLines(stripe, inv, withBreaker);
        invoices.push({
          // An invoice chargeInvoice wrote lists under the ID it was charged
          // under, so it matches the invoice generateInvoice returned; any
          // other invoice lists under its Stripe ID.
          id: inv.metadata?.[INVOICE_ID_METADATA_KEY] ?? inv.id,
          customerId,
          periodStart: new Date((inv.period_start ?? 0) * 1000).toISOString(),
          periodEnd: new Date((inv.period_end ?? 0) * 1000).toISOString(),
          lineItems: lines.map((line) => ({
            description: line.description ?? "",
            metric: line.metadata?.[METRIC_METADATA_KEY] ?? "",
            quantity: line.quantity ?? 0,
            // pricing.unit_amount_decimal is a decimal string with up to 12
            // places; LineItem.unitPrice holds an integer minor-unit amount.
            unitPrice: Math.round(Number(line.pricing?.unit_amount_decimal ?? 0)),
            amount: line.amount,
          })),
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
