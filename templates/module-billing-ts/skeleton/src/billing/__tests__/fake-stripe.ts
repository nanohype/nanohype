import Stripe from "stripe";
import type { Invoice } from "../types.js";

// ── Fake Stripe ────────────────────────────────────────────────────
//
// The transport the real Stripe SDK sends through in tests: a `fetch` that
// answers in-process, so the SDK encodes, keys, times out, and parses every
// request as it does against Stripe, and no request leaves the process.
//
// `fakeStripeApi` answers each request from a function. `fakeStripeAccount`
// keeps invoices, their lines, and idempotency keys the way a Stripe account
// does, for the charge paths that read back what an earlier charge wrote.
//

export interface SentRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: URLSearchParams;
}

export interface Answer {
  status?: number;
  body: unknown;
  /** Response headers beyond the content type and request ID every answer carries. */
  headers?: Record<string, string>;
}

/** A transport the SDK sends through, and every request it was handed. */
export interface FakeTransport {
  sent: SentRequest[];
  httpClient: Stripe.HttpClient;
}

/**
 * A Stripe API that answers from `answer` and records every request the SDK
 * sent it. An answer that throws is a request that never reached Stripe. An
 * answer that waits holds its request in flight while other requests run.
 */
export function fakeStripeApi(
  answer: (request: SentRequest) => Answer | Promise<Answer>,
): FakeTransport {
  const sent: SentRequest[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const request: SentRequest = {
      method: init?.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      headers: new Headers(init?.headers),
      body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
    };
    sent.push(request);
    const { status = 200, body, headers } = await answer(request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_fake", ...headers },
    });
  };
  return { sent, httpClient: Stripe.createFetchHttpClient(fetchFn as typeof fetch) };
}

/** A transport that fails the test if anything is sent through it. */
export function noNetwork(): FakeTransport {
  return fakeStripeApi((request) => {
    throw new Error(`unexpected Stripe request: ${request.method} ${request.path}`);
  });
}

/** A transport whose requests never answer, until the SDK's timeout aborts them. */
export function hangingStripeApi(): { sent: () => number; httpClient: Stripe.HttpClient } {
  let sent = 0;
  const fetchFn = (_input: unknown, init?: RequestInit) => {
    sent++;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  };
  return {
    sent: () => sent,
    httpClient: Stripe.createFetchHttpClient(fetchFn as typeof fetch),
  };
}

/** The answer Stripe gives a request it refuses. */
export function stripeRefusal(status: number, message: string, type = "invalid_request_error") {
  return { status, body: { error: { type, message } } };
}

/** The `metadata[...]` fields of a form-encoded body. */
function metadataOf(body: URLSearchParams): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [field, value] of body) {
    const name = /^metadata\[(.+)\]$/.exec(field)?.[1];
    if (name !== undefined) metadata[name] = value;
  }
  return metadata;
}

export interface FakeLine {
  id: string;
  /** The invoice item the line comes from; a line with none has no `parent`. */
  invoiceItem?: string;
  amount: number;
  description: string;
  metadata: Record<string, string>;
}

export interface FakeInvoice {
  id: string;
  customer: string;
  currency: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  autoAdvance: boolean;
  /** Unix seconds. */
  created: number;
  metadata: Record<string, string>;
  lines: FakeLine[];
}

/** The lines an invoice embeds; the rest are read from its lines endpoint. */
const EMBEDDED_LINES = 10;

/**
 * Decides what becomes of one request: `apply` lets Stripe act on it and
 * returns Stripe's answer. An intercept can answer without applying, apply
 * and answer, or apply and then throw — a response lost on the way back. One
 * that waits before applying holds the request in flight, so requests from
 * another charge land first.
 */
export type Intercept = (request: SentRequest, apply: () => Answer) => Answer | Promise<Answer>;

export interface FakeStripeAccount extends FakeTransport {
  /** Every invoice in the account, oldest first. */
  invoices: FakeInvoice[];

  /**
   * Drop every stored idempotency key, as Stripe may once a key is at least
   * 24 hours old.
   */
  forgetIdempotencyKeys(): void;

  /**
   * Put an invoice in the account as an earlier charge, or anyone, left it,
   * with automatic collection off unless `autoAdvance` turns it on.
   */
  seed(
    invoice: Omit<FakeInvoice, "id" | "autoAdvance" | "created" | "lines"> & {
      autoAdvance?: boolean;
      created?: number;
      lines?: FakeLine[];
    },
  ): FakeInvoice;

  /** The method, path and idempotency key of each request, in order. */
  calls(): (string | null)[][];
}

/** The current time in Unix seconds, as Stripe stamps `created`. */
const now = () => Math.floor(Date.now() / 1000);

/**
 * A Stripe account holding invoices: create, list newest first with a
 * `created` lower bound, add and delete invoice items on a draft, delete a
 * draft, turn automatic collection on or off on a draft or open invoice,
 * finalize, pay, and page through lines. A paid invoice has automatic
 * collection off, as Stripe holds every paid, void or uncollectible one. A
 * write carrying an idempotency key Stripe has seen gets the stored answer
 * back, marked `Idempotent-Replayed: true`, without acting again, and one
 * that carries the key with other parameters or on another endpoint is
 * refused with an idempotency error, until `forgetIdempotencyKeys` drops
 * them as Stripe may once they are at least 24 hours old.
 */
export function fakeStripeAccount(
  intercept: Intercept = (_request, apply) => apply(),
): FakeStripeAccount {
  const invoices: FakeInvoice[] = [];
  const stored = new Map<string, { request: string; answer: Answer }>();
  let next = 0;
  const nextId = (prefix: string) => `${prefix}_${++next}`;

  const lineObject = (line: FakeLine) => ({
    id: line.id,
    object: "line_item",
    amount: line.amount,
    description: line.description,
    quantity: 1,
    pricing: { unit_amount_decimal: String(line.amount) },
    parent:
      line.invoiceItem === undefined
        ? null
        : {
            type: "invoice_item_details",
            invoice_item_details: { invoice_item: line.invoiceItem, proration: false },
          },
    metadata: line.metadata,
  });

  function page<T extends { id: string }>(items: T[], query: URLSearchParams, limit = 10) {
    const after = query.get("starting_after");
    const from = after === null ? 0 : items.findIndex((item) => item.id === after) + 1;
    const size = Number(query.get("limit") ?? limit);
    return {
      object: "list",
      data: items.slice(from, from + size),
      has_more: from + size < items.length,
    };
  }

  const total = (invoice: FakeInvoice) => invoice.lines.reduce((sum, l) => sum + l.amount, 0);

  const invoiceObject = (invoice: FakeInvoice) => ({
    id: invoice.id,
    object: "invoice",
    customer: invoice.customer,
    currency: invoice.currency,
    status: invoice.status,
    auto_advance: invoice.autoAdvance,
    metadata: invoice.metadata,
    total: total(invoice),
    amount_paid: invoice.status === "paid" ? total(invoice) : 0,
    period_start: invoice.created,
    period_end: invoice.created,
    created: invoice.created,
    lines: page(invoice.lines.map(lineObject), new URLSearchParams(), EMBEDDED_LINES),
  });

  function act(request: SentRequest): Answer {
    const { method, path, body, query } = request;
    if (path === "/v1/invoices" && method === "GET") {
      const since = Number(query.get("created[gte]") ?? 0);
      const theirs = invoices
        .filter((i) => i.customer === query.get("customer") && i.created >= since)
        .reverse();
      return { body: page(theirs.map(invoiceObject), query) };
    }
    if (path === "/v1/invoices" && method === "POST") {
      const invoice: FakeInvoice = {
        id: nextId("in"),
        customer: body.get("customer") ?? "",
        // Stripe holds a currency lowercased, however it was sent.
        currency: (body.get("currency") ?? "usd").toLowerCase(),
        status: "draft",
        autoAdvance: body.get("auto_advance") === "true",
        created: now(),
        metadata: metadataOf(body),
        lines: [],
      };
      invoices.push(invoice);
      return { body: invoiceObject(invoice) };
    }
    if (path === "/v1/invoiceitems" && method === "POST") {
      const invoice = invoices.find((i) => i.id === body.get("invoice"));
      if (invoice?.status !== "draft") {
        return stripeRefusal(400, "Invoice items can only be added to a draft invoice.");
      }
      const line = {
        id: nextId("il"),
        invoiceItem: nextId("ii"),
        amount: Number(body.get("amount")),
        description: body.get("description") ?? "",
        metadata: metadataOf(body),
      };
      invoice.lines.push(line);
      return { body: { id: line.invoiceItem, object: "invoiceitem", invoice: invoice.id } };
    }
    const item = /^\/v1\/invoiceitems\/([^/]+)$/.exec(path)?.[1];
    if (item !== undefined && method === "DELETE") {
      const invoice = invoices.find((i) => i.lines.some((line) => line.invoiceItem === item));
      if (invoice === undefined) return stripeRefusal(404, `No such invoiceitem: '${item}'`);
      if (invoice.status !== "draft") {
        return stripeRefusal(400, "Invoice items can only be deleted from a draft invoice.");
      }
      invoice.lines = invoice.lines.filter((line) => line.invoiceItem !== item);
      return { body: { id: item, object: "invoiceitem", deleted: true } };
    }
    const [, id, action] = /^\/v1\/invoices\/([^/]+)(?:\/(finalize|pay|lines))?$/.exec(path) ?? [];
    if (id === undefined) throw new Error(`unexpected Stripe request: ${method} ${path}`);
    const invoice = invoices.find((i) => i.id === id);
    if (invoice === undefined) return stripeRefusal(404, `No such invoice: '${id}'`);
    if (action === "lines") return { body: page(invoice.lines.map(lineObject), query) };
    if (action === undefined && method === "DELETE") {
      if (invoice.status !== "draft") {
        return stripeRefusal(400, "You can only delete draft invoices.");
      }
      invoices.splice(invoices.indexOf(invoice), 1);
      return { body: { id: invoice.id, object: "invoice", deleted: true } };
    }
    // Stripe takes `auto_advance` on a draft or open invoice only.
    if (action === undefined && method === "POST") {
      if (invoice.status !== "draft" && invoice.status !== "open") {
        return stripeRefusal(400, `auto_advance cannot be updated on a ${invoice.status} invoice.`);
      }
      const autoAdvance = body.get("auto_advance");
      if (autoAdvance !== null) invoice.autoAdvance = autoAdvance === "true";
      return { body: invoiceObject(invoice) };
    }
    if (action === "finalize") {
      if (invoice.status !== "draft") {
        return stripeRefusal(400, `This invoice is already ${invoice.status}.`);
      }
      invoice.status = total(invoice) === 0 ? "paid" : "open";
      invoice.autoAdvance = invoice.status === "open" && body.get("auto_advance") === "true";
      return { body: invoiceObject(invoice) };
    }
    if (invoice.status !== "open") {
      return stripeRefusal(400, `Invoice is already ${invoice.status}.`);
    }
    invoice.status = "paid";
    invoice.autoAdvance = false;
    return { body: invoiceObject(invoice) };
  }

  /**
   * Stripe acting on a request, or replaying what it answered that key
   * before, marked as a replay. A key Stripe holds is bound to the endpoint
   * and parameters it was first sent with, and comes back refused with any
   * others.
   */
  function apply(request: SentRequest): Answer {
    const key = request.headers.get("idempotency-key");
    if (key === null) return act(request);
    const sent = `${request.method} ${request.path} ${request.body}`;
    const replay = stored.get(key);
    if (replay !== undefined && replay.request !== sent) {
      return stripeRefusal(
        400,
        `Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than '${key}' if you meant to execute a different request.`,
        "idempotency_error",
      );
    }
    if (replay !== undefined) {
      return { ...replay.answer, headers: { "idempotent-replayed": "true" } };
    }
    const answer = structuredClone(act(request));
    stored.set(key, { request: sent, answer });
    return answer;
  }

  const api = fakeStripeApi((request) => intercept(request, () => apply(request)));

  return {
    ...api,
    invoices,
    forgetIdempotencyKeys: () => stored.clear(),
    seed({ created = now(), lines = [], ...invoice }) {
      const seeded: FakeInvoice = {
        autoAdvance: false,
        ...invoice,
        created,
        lines,
        id: nextId("in"),
      };
      invoices.push(seeded);
      return seeded;
    },
    calls: () => api.sent.map((r) => [r.method, r.path, r.headers.get("idempotency-key")]),
  };
}

/** The lines chargeInvoice writes for `invoice`, as Stripe holds them. */
export function chargedLines(invoice: Pick<Invoice, "lineItems">): FakeLine[] {
  return invoice.lineItems.map((item, index) => ({
    id: `il_seeded_${index}`,
    invoiceItem: `ii_seeded_${index}`,
    amount: item.amount,
    description: item.description,
    metadata: {
      metric: item.metric,
      quantity: String(item.quantity),
      unit_price: String(item.unitPrice),
      invoice_line: String(index),
    },
  }));
}

/** Sign `event` as Stripe signs a webhook, with the body as it is sent. */
export function signedEvent(event: object, secret: string, timestamp?: number) {
  const payload = JSON.stringify(event, null, 2);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
  return { payload, header };
}

/** A Stripe event envelope around `object`. */
export function stripeEvent(type: string, object: object, id = "evt_fake") {
  return {
    id,
    object: "event",
    api_version: "2026-01-01",
    created: 1_700_000_000,
    livemode: false,
    type,
    data: { object },
  };
}
