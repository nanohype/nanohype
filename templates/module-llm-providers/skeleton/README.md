# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createProviderRegistry } from "./llm-providers/index.js";

const registry = createProviderRegistry({ defaultProvider: "__DEFAULT_PROVIDER__" });

// Simple chat
const response = await registry.chat([
  { role: "user", content: "Explain quantum computing in one paragraph." },
]);
console.log(response.text);
console.log(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
console.log(`Cost: $${response.cost.toFixed(6)}`);

// Stream a response
const stream = registry.streamChat([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Write a haiku about TypeScript." },
]);

for await (const chunk of stream) {
  if (chunk.done) break;
  process.stdout.write(chunk.text);
}

const final = await stream.response;
console.log(`\nTotal tokens: ${final.usage.outputTokens}`);
```

## Providers

| Provider | SDK | Default Model | Auth | Included |
|----------|-----|---------------|------|----------|
| `gateway` | native fetch | route `default` (`MODEL_ROUTE`) | none: the Platform's ModelGateway holds the Bedrock role | Always |
| `mock` | none | mock-model | none | Always |
| `anthropic` | @anthropic-ai/sdk | claude-sonnet-5 | `ANTHROPIC_API_KEY` | `IncludeKeyProviders` |
| `openai` | openai | gpt-4o | `OPENAI_API_KEY` | `IncludeKeyProviders` |
| `groq` | groq-sdk | llama-3.3-70b-versatile | `GROQ_API_KEY` | `IncludeKeyProviders` |
| `bedrock` | @aws-sdk/client-bedrock-runtime | us.anthropic.claude-sonnet-5 | AWS credential chain | `IncludeBedrock` |
| `vertex` | @google/genai (Vertex AI backend) | gemini-2.0-flash | Google ADC | `IncludeVertex` |
| `huggingface` | @huggingface/inference | meta-llama/Llama-3.3-70B-Instruct | `HF_TOKEN` | `IncludeHuggingFace` |
| `ollama` | native fetch | llama3.2 | none (local) | `IncludeOllama` |

### Where each provider runs

On the nanohype substrate an application holds no model credential. The `gateway` provider calls the Platform's `ModelGateway`, the Envoy AI Gateway the eks-agent-platform operator runs in the tenant's namespace under the tenant's EKS Pod Identity. The gateway holds the Bedrock role, attaches the route's guardrail and rate limit, and signs the call; the operator's egress policy gives application pods a route to it and to no model endpoint. So `gateway` is the provider a tenant runs on, and it sends no key, token or signature.

It speaks native Anthropic Messages at `<MODEL_GATEWAY_ENDPOINT>/anthropic/v1/messages`, the wire format the gateway serves for every anthropic-family route that does not pin another. `MODEL_GATEWAY_ENDPOINT` is the gateway root as `ModelGateway` `status.endpoint` publishes it, and takes no path; unset, it is `http://__PLATFORM_NAME__-gateway.tenants-__PLATFORM_NAME__.svc.cluster.local:8080`, the Service the operator creates for this project's Platform. A request's `model` is a route name on the `ModelGateway` CR: `opts.model`, or `MODEL_ROUTE` (`default`) when that is unset. The CR maps the route to a Bedrock model, so changing models is a CR edit and this code is untouched. A non-2xx answer, an `error` event, and a stream that ends before `message_stop` all fail with `ModelGatewayError`, which carries the gateway's status. `createGatewayProvider({ endpoint, route, requestTimeoutMs, fetch })`, from `./llm-providers/providers/gateway.js`, builds an instance with its own settings.

Every other provider runs off the substrate. `anthropic`, `openai`, `groq` and `huggingface` authenticate with a provider key, which the LLM policy permits only for a provider the intake brief names, read from the environment or the OS keychain and never committed; generate with `IncludeKeyProviders` (or `IncludeHuggingFace`) to ship them. `bedrock` calls Bedrock directly over the AWS credential chain (an ECS task role, a local AWS profile), `vertex` uses Google ADC, and `ollama` a local server.

### Sampling parameters

Each provider decides which of the caller's `temperature` and `topP` its request carries. A provider that can send something other than the caller's values declares what it sends through its `sampling(opts)` hook, and one without the hook sends the caller's values when they are set and its own default `temperature` otherwise.

| Provider | `temperature` | `topP` |
|----------|---------------|--------|
| `openai`, `groq`, `vertex`, `huggingface`, `ollama` | The caller's value, and 1 when the caller sets none | The caller's value, when set |
| `anthropic`, `gateway` | Never: the Messages API rejects `temperature`, `top_p` and `top_k` at any value, and every route `gateway` reaches serves Claude | Never |
| `bedrock` | Per model id, under `samplingParameters` | As `temperature` |
| `mock` | Not read | Not read |

The `bedrock` provider's `samplingParameters` takes one of three values. `auto`, the default, sends the caller's values only to a model id that names a family other than Claude. A model id names its family through its provider segment — `anthropic.claude-…`, `us.anthropic.claude-…`, or either as the resource of a `foundation-model/` or `inference-profile/` ARN — and every other model id names none and is treated as Claude: an ARN of any other resource type (an application inference profile, provisioned model, imported model, custom model, custom model deployment, prompt or prompt router) or an id with no provider segment. `send` sends the caller's values to every model id, which is how an ARN serving another family receives them, and `omit` sends them to none. `BEDROCK_SAMPLING_PARAMETERS` sets it for the registered `bedrock` provider and is read when the provider's module loads, so a value other than `auto`, `send` or `omit` fails the import. `createBedrockProvider({ samplingParameters })`, imported from `./llm-providers/providers/bedrock.js`, sets it on a provider you register yourself.

`auto` sends no `temperature` to Claude Haiku 4.5 or Claude Sonnet 4.5, though Bedrock accepts one from either. A classification or routing call that wants temperature 0 from one of them runs under `send` and leaves `topP` unset, because those models reject `temperature` and `top_p` together.

The `anthropic`, `gateway` and `bedrock` providers log the first request whose caller-set values they drop, once per instance, at debug level. The registered instance lives as long as the process, so that is once per process.

## Streaming

Every provider supports streaming via `streamChat()`. The returned `StreamResponse` is an `AsyncIterable<StreamChunk>` with a `response` promise that resolves with the whole reply before the final `done` chunk arrives, and rejects when the stream fails or the consumer stops reading before the reply finishes:

```typescript
import { getProvider } from "./llm-providers/providers/index.js";

const provider = getProvider("gateway");
const stream = provider.streamChat([
  { role: "user", content: "Count to 10" },
]);

for await (const chunk of stream) {
  if (chunk.done) break;
  process.stdout.write(chunk.text);
}

// Full response available after streaming
const response = await stream.response;
console.log(response.usage);
```

## Token Counting

Approximate token counting via js-tiktoken (cl100k_base encoding):

```typescript
import { countTokens } from "./llm-providers/tokens/counter.js";

const tokens = countTokens("Hello, world!");
console.log(`${tokens} tokens`);

// With model-specific encoding
const gpt4Tokens = countTokens("Hello, world!", "gpt-4o");
```

## Gateway Adapter

Bridge any `LlmProvider` into the `GatewayProvider` shape expected by `module-llm-gateway`:

```typescript
import { getProvider } from "./llm-providers/providers/index.js";
import { createGatewayAdapter } from "./llm-providers/adapters/gateway.js";

const provider = getProvider("gateway");
const gatewayProvider = createGatewayAdapter(provider);

// Now usable with module-llm-gateway's registerProvider()
// gatewayProvider satisfies the GatewayProvider interface structurally
```

The adapter passes a provider's `sampling(opts)` hook through as the gateway's `sampling` hook, narrowed to `temperature`, so the gateway's response cache does not split on a temperature the provider drops.

## Custom Providers

Register a new provider factory:

```typescript
import { registerProvider } from "./llm-providers/providers/index.js";
import type { LlmProvider } from "./llm-providers/providers/types.js";

function createMyProvider(): LlmProvider {
  return {
    name: "my-provider",
    pricing: { input: 1, output: 2 },

    async chat(messages, opts) {
      // Your implementation here
      return {
        text: "response",
        model: opts?.model ?? "my-model",
        provider: "my-provider",
        usage: { inputTokens: 10, outputTokens: 20 },
        latencyMs: 100,
        cost: 0.00005,
      };
    },

    streamChat(messages, opts) {
      // Your streaming implementation
      // Return an AsyncIterable<StreamChunk> with a response promise
    },

    countTokens(text) {
      return Math.ceil(text.length / 4);
    },
  };
}

registerProvider("my-provider", createMyProvider);
```

## Architecture

- **Factory-based registry** -- `registerProvider(name, factory)` stores a factory function, and `getProvider(name)` calls it on every lookup. Each built-in provider registers a factory that returns one instance for the life of the process, so its SDK client is built once and its circuit breaker and log-once state see every request. Every provider module except `mock` also exports a factory that builds an independent instance to register under another name with its own options: `createGatewayProvider()` from `./llm-providers/providers/gateway.js`, `createAnthropicProvider()` from `./llm-providers/providers/anthropic.js`, and `createOpenAIProvider()`, `createGroqProvider()`, `createBedrockProvider()`, `createVertexProvider()`, `createHuggingFaceProvider()` and `createOllamaProvider()` from the matching `providers/<name>.js` module.
- **Lazy SDK initialization** -- an SDK client is built on the instance's first request, not at import time. Importing a provider module registers its instance and reads its environment settings (`LLM_REQUEST_TIMEOUT_MS`, or `OLLAMA_REQUEST_TIMEOUT_MS` for `ollama`, `MODEL_GATEWAY_ENDPOINT` and `MODEL_ROUTE` for `gateway`, and `BEDROCK_SAMPLING_PARAMETERS` for `bedrock`), so an invalid value fails the import rather than the first request.
- **Per-instance circuit breakers** -- each provider instance owns its circuit breaker, and runs both request modes through it: a request is one call, and a stream is one call from its opening until it ends, fails, times out or its consumer stops reading. Every caller of a registered provider shares that instance, so its breaker opens on failures from any of them, and an open breaker refuses a stream before it sends a request.
- **Request timeouts** -- every provider that calls a model bounds its calls by a request timeout, so a hung connection fails into the circuit breaker instead of holding the caller. It is `LLM_REQUEST_TIMEOUT_MS` (120s by default) for every provider but `ollama`, which reads `OLLAMA_REQUEST_TIMEOUT_MS` (600s by default) because local inference runs far slower than a hosted endpoint; each `create*Provider()` takes `requestTimeoutMs` to set it per instance. A request that does not stream has to finish its whole reply within the timeout, and the 120s default covers the 4096-token `maxTokens` default at about 34 tokens a second, so a caller that raises `maxTokens` raises the timeout with it, or streams. A stream fails when no event arrives for one timeout, so a long reply that keeps arriving is never cut off. The `anthropic`, `openai` and `groq` SDK clients give each attempt of a request the timeout and retry a timed-out attempt once, so an endpoint that never answers holds the caller for two timeouts plus the SDK's backoff; a caller's own client options can set `maxRetries`, and `timeout`, which then bounds each wait for a stream's next event too. The `gateway`, `bedrock`, `vertex`, `huggingface` and `ollama` providers give up on a request, retries included, at one timeout. Every provider aborts the request of a call it gives up on, which drops its connection. A value that is not a whole number of milliseconds from 1 to 2147483647 fails the import.
- **Unified streaming** -- all providers implement `streamChat()` returning `StreamResponse`, an `AsyncIterable<StreamChunk>` with a `response` promise. Every provider that calls a model builds it with `guardStream()` from `resilience/stream-guard.ts`, which carries the breaker and timeout rules above. The streaming adapter normalizes raw string iterables into the standard chunk format.
- **Gateway bridge** -- `createGatewayAdapter()` wraps any `LlmProvider` into the `GatewayProvider` shape using structural typing (no compile-time dependency on module-llm-gateway).
- **OTel metrics** -- request totals, duration, and token usage are recorded as OTel counters and histograms. No-ops when no SDK is configured.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.
- **Zod config validation** -- `createProviderRegistry()` validates configuration at construction time, catching errors early.

## Production Readiness

- [ ] On the substrate, deploy with the `gateway` provider and confirm `MODEL_GATEWAY_ENDPOINT` matches the Platform's `ModelGateway` `status.endpoint` (see `.env.example`); set no provider key
- [ ] Off the substrate, set a provider key only for a provider the intake brief names, from the environment or the OS keychain, never committed
- [ ] Choose appropriate default model for your use case and budget
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Wire in OpenTelemetry SDK for metrics collection
- [ ] Monitor `llm_provider_request_total` and `llm_provider_duration_ms` dashboards
- [ ] Set circuit breaker thresholds appropriate for your traffic volume
- [ ] Review token counting accuracy for your specific models
- [ ] Test failover behavior when a provider is unavailable
- [ ] Consider using the gateway adapter with module-llm-gateway for routing

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

Apache-2.0
