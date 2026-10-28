import Stripe from "stripe";

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
}

/** A transport the SDK sends through, and every request it was handed. */
export interface FakeTransport {
  sent: SentRequest[];
  httpClient: Stripe.HttpClient;
}

/**
 * A Stripe API that answers from `answer` and records every request the SDK
 * sent it. An answer that throws is a request that never reached Stripe.
 */
export function fakeStripeApi(answer: (request: SentRequest) => Answer): FakeTransport {
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
    const { status = 200, body } = answer(request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_fake" },
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
  metadata: Record<string, string>;
  lines: FakeLine[];
}

/** The lines an invoice embeds; the rest are read from its lines endpoint. */
const EMBEDDED_LINES = 10;

/**
 * Decides what becomes of one request: `apply` lets Stripe act on it and
 * returns Stripe's answer. An intercept can answer without applying, apply
 * and answer, or apply and then throw — a response lost on the way back.
 */
export type Intercept = (request: SentRequest, apply: () => Answer) => Answer;

export interface FakeStripeAccount extends FakeTransport {
  /** Every invoice in the account, oldest first. */
  invoices: FakeInvoice[];

  /** Drop every stored idempotency key, as Stripe does after 24 hours. */
  forgetIdempotencyKeys(): void;

  /** Put an invoice in the account as an earlier charge, or anyone, left it. */
  seed(
    invoice: Omit<FakeInvoice, "id" | "autoAdvance" | "lines"> & { lines?: FakeLine[] },
  ): FakeInvoice;

  /** The method, path and idempotency key of each request, in order. */
  calls(): (string | null)[][];
}

/**
 * A Stripe account holding invoices: create, list newest first, add invoice
 * items to a draft, finalize, pay, and page through lines. A write carrying
 * an idempotency key Stripe has seen gets the stored answer back without
 * acting again, until `forgetIdempotencyKeys` drops them as Stripe does after
 * 24 hours.
 */
export function fakeStripeAccount(
  intercept: Intercept = (_request, apply) => apply(),
): FakeStripeAccount {
  const invoices: FakeInvoice[] = [];
  const stored = new Map<string, Answer>();
  let next = 0;
  const nextId = (prefix: string) => `${prefix}_${++next}`;

  const lineObject = (line: FakeLine) => ({
    id: line.id,
    object: "line_item",
    amount: line.amount,
    description: line.description,
    quantity: 1,
    pricing: { unit_amount_decimal: String(line.amount) },
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
    period_start: 1_700_000_000,
    period_end: 1_700_000_000,
    created: 1_700_000_000,
    lines: page(invoice.lines.map(lineObject), new URLSearchParams(), EMBEDDED_LINES),
  });

  function act(request: SentRequest): Answer {
    const { method, path, body, query } = request;
    if (path === "/v1/invoices" && method === "GET") {
      const theirs = invoices.filter((i) => i.customer === query.get("customer")).reverse();
      return { body: page(theirs.map(invoiceObject), query) };
    }
    if (path === "/v1/invoices" && method === "POST") {
      const invoice: FakeInvoice = {
        id: nextId("in"),
        customer: body.get("customer") ?? "",
        currency: body.get("currency") ?? "usd",
        status: "draft",
        autoAdvance: body.get("auto_advance") === "true",
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
        amount: Number(body.get("amount")),
        description: body.get("description") ?? "",
        metadata: metadataOf(body),
      };
      invoice.lines.push(line);
      return { body: { id: nextId("ii"), object: "invoiceitem", invoice: invoice.id } };
    }
    const [, id, action] = /^\/v1\/invoices\/([^/]+)\/(finalize|pay|lines)$/.exec(path) ?? [];
    const invoice = invoices.find((i) => i.id === id);
    if (invoice === undefined) {
      throw new Error(`unexpected Stripe request: ${method} ${path}`);
    }
    if (action === "lines") return { body: page(invoice.lines.map(lineObject), query) };
    if (action === "finalize") {
      if (invoice.status !== "draft") {
        return stripeRefusal(400, `This invoice is already ${invoice.status}.`);
      }
      invoice.autoAdvance = body.get("auto_advance") === "true";
      invoice.status = total(invoice) === 0 ? "paid" : "open";
      return { body: invoiceObject(invoice) };
    }
    if (invoice.status !== "open") {
      return stripeRefusal(400, `Invoice is already ${invoice.status}.`);
    }
    invoice.status = "paid";
    return { body: invoiceObject(invoice) };
  }

  /** Stripe acting on a request, or replaying what it answered that key before. */
  function apply(request: SentRequest): Answer {
    const key = request.headers.get("idempotency-key");
    if (key === null) return act(request);
    const replay = stored.get(key);
    if (replay !== undefined) return replay;
    const answer = structuredClone(act(request));
    stored.set(key, answer);
    return answer;
  }

  const api = fakeStripeApi((request) => intercept(request, () => apply(request)));

  return {
    ...api,
    invoices,
    forgetIdempotencyKeys: () => stored.clear(),
    seed(invoice) {
      const seeded: FakeInvoice = { autoAdvance: false, lines: [], ...invoice, id: nextId("in") };
      invoices.push(seeded);
      return seeded;
    },
    calls: () => api.sent.map((r) => [r.method, r.path, r.headers.get("idempotency-key")]),
  };
}

/** A line as chargeInvoice writes it for `Invoice.lineItems[index]`. */
export function chargedLine(index: number, amount = 100, metric = "api_calls"): FakeLine {
  return {
    id: `il_seeded_${index}`,
    amount,
    description: `line ${index}`,
    metadata: { metric, invoice_line: String(index) },
  };
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
