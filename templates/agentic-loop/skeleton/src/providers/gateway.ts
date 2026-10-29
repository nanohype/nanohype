import { z } from "zod";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import type { Tool } from "../tools/registry.js";
import { formatTools } from "./messages-tools.js";
import { registerProvider } from "./registry.js";
import type {
  ContentBlock,
  LlmProvider,
  LlmResponse,
  Message,
  StreamChat,
  ToolCall,
} from "./types.js";

// ── Model Gateway Provider ──────────────────────────────────────────
//
// The Platform's ModelGateway: how an application on the nanohype
// substrate reaches a model. The eks-agent-platform operator runs one per
// Platform, an Envoy AI Gateway in the tenant's namespace that runs under
// the tenant's EKS Pod Identity, holds the Bedrock role, attaches the
// route's guardrail and rate limit, and signs each call. The operator's
// egress policy gives application pods a route to the gateway and to no
// model endpoint, so this is the provider that works on the substrate, and
// it holds and sends no credential of any kind.
//
// It speaks native Anthropic Messages at
// `<MODEL_GATEWAY_ENDPOINT>/anthropic/v1/messages`, which the gateway
// serves for every route whose ModelGateway status reports api Anthropic.
// MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway
// status.endpoint publishes it. The gateway serves each wire format under
// its own prefix, and a request outside one matches no route while the
// gateway reports healthy, so the root takes no path. Unset, it is the
// Service the operator creates for the Platform this project deploys
// under. Every request names one route as its model, MODEL_ROUTE (`default`)
// unless the instance sets another. The ModelGateway CR maps each route to
// a Bedrock model.
//
// Requests go out through `fetch`, not the Anthropic SDK. An SDK client
// given no credential resolves one from the environment and its config
// files and sends it, which here would hand a developer's personal key to
// whatever answers at the gateway address. The headers built below are
// the whole request. The system prompt goes out as one block carrying an
// ephemeral cache_control marker, which the gateway hands Bedrock as the
// prompt caching point.
//
// Tool use rides the same wire: the request carries the registry's tools
// as Messages tool definitions, and the reply's content blocks, tool_use
// blocks and any thinking blocks included, go back into the conversation
// as the assistant turn exactly as they arrived. A tool result goes back
// as a user turn carrying a tool_result block.
//
// Both request modes run through the provider's circuit breaker, which
// counts a request the gateway refuses or never answers. A request fails
// when its reply takes longer than DEFAULT_REQUEST_TIMEOUT_MS
// (`requestTimeoutMs` sets it per instance), and a stream when no event
// arrives for that long; either way the request's abort signal fires,
// which drops the connection.
//

/**
 * The gateway root when MODEL_GATEWAY_ENDPOINT is unset or empty: the
 * Service the eks-agent-platform operator creates for the Platform this
 * project deploys under, named `<platform>-gateway` in the Platform's
 * namespace `tenants-<platform>`, listening on 8080.
 */
export const DEFAULT_MODEL_GATEWAY_ENDPOINT =
  "http://__PLATFORM_NAME__-gateway.tenants-__PLATFORM_NAME__.svc.cluster.local:8080";

/** The route a request names when neither its caller nor MODEL_ROUTE set one. */
export const DEFAULT_MODEL_ROUTE = "default";

/** Where the gateway serves native Anthropic Messages, under its root. */
export const MESSAGES_PATH = "/anthropic/v1/messages";

/** The Messages API version every request declares. */
const ANTHROPIC_VERSION = "2023-06-01";

/** How much of a refusal's body an error message carries. */
const MAX_ERROR_DETAIL = 500;

/** A gateway answer other than a 2xx, or a stream that failed or ended early. */
export class ModelGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

/**
 * The gateway root `value` names, without a trailing slash, and
 * DEFAULT_MODEL_GATEWAY_ENDPOINT when unset or empty. It is an http or
 * https URL with no path, query or fragment.
 */
export function parseGatewayEndpoint(value: string | undefined): string {
  if (value === undefined || value === "") return DEFAULT_MODEL_GATEWAY_ENDPOINT;
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`MODEL_GATEWAY_ENDPOINT must be an http or https URL, got "${value}"`);
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error(
      `MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway status.endpoint publishes it, ` +
        `and takes no path, query or fragment, got "${value}"`,
    );
  }
  return value.replace(/\/+$/, "");
}

/** The gateway root MODEL_GATEWAY_ENDPOINT sets. */
export const MODEL_GATEWAY_ENDPOINT = parseGatewayEndpoint(process.env.MODEL_GATEWAY_ENDPOINT);

/** The route MODEL_ROUTE sets, and DEFAULT_MODEL_ROUTE when unset or empty. */
export const MODEL_ROUTE = process.env.MODEL_ROUTE || DEFAULT_MODEL_ROUTE;

/** How long a call waits on its reply when nothing sets a timeout, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** A gateway call that outlasted its timeout. */
export class ModelGatewayTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`No answer from the model gateway within ${timeoutMs} ms`);
    this.name = "ModelGatewayTimeoutError";
  }
}

/**
 * `pending`, failing after `timeoutMs` with ModelGatewayTimeoutError and
 * aborting `controller`, which drops the connection the request holds.
 * The timer is cleared when `pending` settles first.
 */
async function within<T>(
  timeoutMs: number,
  controller: AbortController,
  pending: Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new ModelGatewayTimeoutError(timeoutMs);
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([pending, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

// Never trust the wire: validate before reading. A content block keeps
// every field it arrives with, so a thinking block's signature survives
// the trip back to the gateway.
const blockSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

const usageSchema = z
  .object({ input_tokens: z.number().nullable(), output_tokens: z.number().nullable() })
  .partial();

const messageSchema = z.object({
  content: z.array(blockSchema),
  stop_reason: z.string().nullable().optional(),
  usage: usageSchema.optional(),
});

const streamEventSchema = z.object({
  type: z.string(),
  index: z.number().optional(),
  message: z.object({ usage: usageSchema.optional() }).optional(),
  content_block: blockSchema.optional(),
  delta: z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      partial_json: z.string().optional(),
      thinking: z.string().optional(),
      signature: z.string().optional(),
      stop_reason: z.string().nullable().optional(),
    })
    .optional(),
  usage: usageSchema.optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

type Block = z.infer<typeof blockSchema>;
type StreamEvent = z.infer<typeof streamEventSchema>;
type Usage = z.infer<typeof usageSchema>;

/** The error a refusal carries: its status, and the message its body gives. */
async function refusal(res: Response): Promise<ModelGatewayError> {
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown };
    const message = parsed.error?.message ?? parsed.message;
    if (typeof message === "string") detail = message;
  } catch {
    // Not JSON: Envoy answers a routing or upstream failure in plain text.
  }
  const shown = detail.trim().slice(0, MAX_ERROR_DETAIL) || res.statusText;
  return new ModelGatewayError(res.status, `Model gateway answered ${res.status}: ${shown}`);
}

/** The LlmResponse a reply's content blocks, stop reason and usage make. */
function toResponse(
  content: Block[],
  stopReason: string | null | undefined,
  usage: Usage,
): LlmResponse {
  const blocks = content as ContentBlock[];
  const toolCalls: ToolCall[] = content
    .filter((block) => block.type === "tool_use")
    .map((block) => ({ id: block.id ?? "", name: block.name ?? "", input: block.input ?? {} }));
  return {
    content: blocks,
    toolCalls,
    stopReason: stopReason ?? "end_turn",
    rawAssistantMessage: { role: "assistant", content: blocks },
    usage: {
      inputTokens: usage.input_tokens ?? undefined,
      outputTokens: usage.output_tokens ?? undefined,
    },
  };
}

/**
 * The Messages events an SSE body carries, each read within `timeoutMs`,
 * and an error for a stream that reports one, carries an unreadable event,
 * or ends before message_stop.
 */
async function* messageEvents(
  body: ReadableStream<Uint8Array>,
  status: number,
  timeoutMs: number,
  controller: AbortController,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopped = false;

  function parse(line: string): StreamEvent | undefined {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.startsWith("data:")) return undefined;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed.slice(5).trim());
    } catch {
      throw new ModelGatewayError(status, "Model gateway sent an unreadable stream event");
    }
    const event = streamEventSchema.parse(raw);
    if (event.type === "error") {
      throw new ModelGatewayError(
        status,
        `Model gateway stream failed: ${event.error?.message ?? "no message"}`,
      );
    }
    if (event.type === "message_stop") stopped = true;
    return event;
  }

  try {
    while (true) {
      const { done, value } = await within(timeoutMs, controller, reader.read());
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parse(line);
        if (event) yield event;
      }
    }
    const last = parse(buffer + decoder.decode());
    if (last) yield last;
    if (!stopped) {
      throw new ModelGatewayError(status, "Model gateway stream ended before message_stop");
    }
  } finally {
    reader.releaseLock();
  }
}

export interface GatewayProviderOptions {
  /** The gateway root. MODEL_GATEWAY_ENDPOINT when unset. */
  endpoint?: string;
  /** The route every request names. MODEL_ROUTE when unset. */
  route?: string;
  /**
   * How long a call waits on the model, in milliseconds: a whole request,
   * or each wait for a stream's next event. DEFAULT_REQUEST_TIMEOUT_MS when
   * unset.
   */
  requestTimeoutMs?: number;
  /** The `fetch` requests go through. The global one when unset. */
  fetch?: typeof globalThis.fetch;
}

/**
 * A gateway provider with its own circuit breaker. The registered
 * `gateway` provider is one of these, built with no options.
 */
export function createGatewayProvider(options: GatewayProviderOptions = {}): LlmProvider {
  const endpoint =
    options.endpoint === undefined
      ? MODEL_GATEWAY_ENDPOINT
      : parseGatewayEndpoint(options.endpoint);
  const route = options.route || MODEL_ROUTE;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const cb = createCircuitBreaker();

  /** The Messages request body for one turn of the loop. */
  function messagesBody(systemPrompt: string, messages: Message[], tools: Tool[]) {
    return {
      model: route,
      max_tokens: 4096,
      ...(systemPrompt
        ? {
            system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          }
        : {}),
      messages: messages.map(({ role, content }) => ({ role, content })),
      ...(tools.length > 0 ? { tools: formatTools(tools) } : {}),
    };
  }

  /** POSTs `body` to the gateway's Messages endpoint, and fails on a refusal. */
  async function post(body: object, signal: AbortSignal): Promise<Response> {
    const send = options.fetch ?? globalThis.fetch;
    const res = await send(`${endpoint}${MESSAGES_PATH}`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await refusal(res);
    return res;
  }

  return {
    async sendMessage(
      systemPrompt: string,
      messages: Message[],
      tools: Tool[],
    ): Promise<LlmResponse> {
      const body = messagesBody(systemPrompt, messages, tools);
      const reply = await cb.execute(() => {
        const controller = new AbortController();
        return within(
          timeoutMs,
          controller,
          (async () => messageSchema.parse(await (await post(body, controller.signal)).json()))(),
        );
      });
      return toResponse(reply.content, reply.stop_reason, reply.usage ?? {});
    },

    streamChat(systemPrompt: string, messages: Message[], tools: Tool[]): StreamChat {
      const body = { ...messagesBody(systemPrompt, messages, tools), stream: true };

      let resolveResponse!: (value: LlmResponse) => void;
      let rejectResponse!: (reason: unknown) => void;
      const response = new Promise<LlmResponse>((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
      });
      // A caller that only iterates sees the failure there; this keeps the
      // unread response promise from reporting it a second time.
      response.catch(() => undefined);

      async function* chunks(): AsyncGenerator<string> {
        const controller = new AbortController();
        try {
          // The breaker guards the request until the gateway answers it.
          const res = await cb.execute(() =>
            within(timeoutMs, controller, post(body, controller.signal)),
          );
          if (!res.body) throw new ModelGatewayError(res.status, "Model gateway sent no stream");

          const blocks: Block[] = [];
          const partialJson = new Map<number, string>();
          let stopReason: string | null | undefined;
          let usage: Usage = {};

          for await (const event of messageEvents(res.body, res.status, timeoutMs, controller)) {
            const index = event.index ?? 0;
            if (event.type === "message_start") {
              usage = { ...usage, ...event.message?.usage };
            } else if (event.type === "content_block_start" && event.content_block) {
              blocks[index] = { ...event.content_block };
            } else if (event.type === "content_block_delta" && event.delta) {
              const block = blocks[index];
              const delta = event.delta;
              if (delta.type === "text_delta" && delta.text !== undefined) {
                if (block) block.text = (block.text ?? "") + delta.text;
                yield delta.text;
              } else if (delta.type === "input_json_delta") {
                partialJson.set(index, (partialJson.get(index) ?? "") + (delta.partial_json ?? ""));
              } else if (delta.type === "thinking_delta" && block) {
                block.thinking = `${String(block.thinking ?? "")}${delta.thinking ?? ""}`;
              } else if (delta.type === "signature_delta" && block) {
                block.signature = delta.signature;
              }
            } else if (event.type === "content_block_stop") {
              const json = partialJson.get(index);
              const block = blocks[index];
              if (json !== undefined && block) {
                try {
                  block.input = json ? (JSON.parse(json) as Record<string, unknown>) : {};
                } catch {
                  throw new ModelGatewayError(
                    res.status,
                    "Model gateway sent unreadable tool input",
                  );
                }
              }
            } else if (event.type === "message_delta") {
              stopReason = event.delta?.stop_reason ?? stopReason;
              for (const [key, value] of Object.entries(event.usage ?? {})) {
                if (value != null) usage = { ...usage, [key]: value };
              }
            }
          }

          resolveResponse(toResponse(blocks.filter(Boolean), stopReason, usage));
        } catch (err) {
          rejectResponse(err);
          throw err;
        } finally {
          controller.abort();
        }
      }

      return {
        [Symbol.asyncIterator]: () => chunks(),
        response,
      };
    },

    makeToolResultMessage(toolCallId: string, result: string): Message {
      return {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolCallId, content: result }],
      };
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker holds across requests.
const gatewayProvider = createGatewayProvider();
registerProvider("gateway", () => gatewayProvider);
