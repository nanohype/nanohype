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

| Provider | SDK | Default Model | Auth | Always Included |
|----------|-----|---------------|------|-----------------|
| `anthropic` | @anthropic-ai/sdk | claude-sonnet-5 | `ANTHROPIC_API_KEY` | Yes |
| `openai` | openai | gpt-4o | `OPENAI_API_KEY` | Yes |
| `groq` | groq-sdk | llama-3.3-70b-versatile | `GROQ_API_KEY` | Yes |
| `mock` | none | mock-model | none | Yes |
| `bedrock` | @aws-sdk/client-bedrock-runtime | us.anthropic.claude-sonnet-5 | IAM / AWS credentials | Conditional |
| `vertex` | @google-cloud/vertexai | gemini-2.0-flash | Google ADC | Conditional |
| `huggingface` | @huggingface/inference | meta-llama/Llama-3.3-70B-Instruct | `HF_TOKEN` | Conditional |
| `ollama` | native fetch | llama3.2 | none (local) | Conditional |

### Sampling parameters

Each provider decides which of the caller's `temperature` and `topP` its request carries. A provider that can send something other than the caller's values declares what it sends through its `sampling(opts)` hook, and one without the hook sends the caller's values whenever they are set.

| Provider | `temperature` | `topP` |
|----------|---------------|--------|
| `openai`, `groq`, `vertex`, `huggingface`, `ollama` | The caller's value, and 1 when the caller sets none | The caller's value, when set |
| `anthropic` | Never: the Messages API rejects `temperature`, `top_p` and `top_k` at any value | Never |
| `bedrock` | Per model id, under `samplingParameters` | As `temperature` |
| `mock` | Not read | Not read |

The `bedrock` provider's `samplingParameters` takes one of three values. `auto`, the default, sends the caller's values only to a model id that names a family other than Claude. A model id names its family through its provider segment — `anthropic.claude-…`, `us.anthropic.claude-…`, or either as the resource of a `foundation-model/` or `inference-profile/` ARN — and every other model id names none and is treated as Claude: an ARN of any other resource type (an application inference profile, provisioned model, imported model, custom model, custom model deployment, prompt or prompt router) or an id with no provider segment. `send` sends the caller's values to every model id, which is how an ARN serving another family receives them, and `omit` sends them to none. `BEDROCK_SAMPLING_PARAMETERS` sets it for the registered `bedrock` provider and is read when the provider's module loads, so a value other than `auto`, `send` or `omit` fails the import. `createBedrockProvider({ samplingParameters })`, imported from `./llm-providers/providers/bedrock.js`, sets it on a provider you register yourself.

`auto` sends no `temperature` to Claude Haiku 4.5 or Claude Sonnet 4.5, though Bedrock accepts one from either. A classification or routing call that wants temperature 0 from one of them runs under `send` and leaves `topP` unset, because those models reject `temperature` and `top_p` together.

The `anthropic` and `bedrock` providers log the first request whose caller-set values they drop, once per instance, at debug level. The registered instance lives as long as the process, so that is once per process.

## Streaming

Every provider supports streaming via `streamChat()`. The returned `StreamResponse` is an `AsyncIterable<StreamChunk>` with a `response` promise that resolves once the stream completes:

```typescript
import { getProvider } from "./llm-providers/providers/index.js";

const provider = getProvider("anthropic");
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

const provider = getProvider("anthropic");
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

- **Factory-based registry** -- `registerProvider(name, factory)` stores a factory function, and `getProvider(name)` calls it on every lookup. Each built-in provider registers a factory that returns one instance for the life of the process, so its SDK client is built once and its circuit breaker and log-once state see every request. Every provider module except `mock` also exports a factory that builds an independent instance to register under another name with its own options: `createAnthropicProvider()` from `./llm-providers/providers/anthropic.js`, and `createOpenAIProvider()`, `createGroqProvider()`, `createBedrockProvider()`, `createVertexProvider()`, `createHuggingFaceProvider()` and `createOllamaProvider()` from the matching `providers/<name>.js` module.
- **Lazy SDK initialization** -- an SDK client is built on the instance's first request, not at import time. Importing a provider module registers its instance and reads its environment settings (`LLM_REQUEST_TIMEOUT_MS`, and `BEDROCK_SAMPLING_PARAMETERS` for `bedrock`), so an invalid value fails the import rather than the first request.
- **Per-instance circuit breakers** -- each provider instance owns its circuit breaker. Every caller of a registered provider shares that instance, so its breaker opens on failures from any of them.
- **Request timeouts** -- every provider that calls a model bounds its calls by `LLM_REQUEST_TIMEOUT_MS` (30s by default), so a hung connection fails into the circuit breaker instead of holding the caller. The `anthropic`, `openai` and `groq` SDK clients apply it to each attempt and retry a timed-out attempt once, so an endpoint that never answers holds the caller for two timeouts plus the SDK's backoff; a caller's own client options can set `timeout` and `maxRetries`. The `bedrock`, `vertex`, `huggingface` and `ollama` providers abandon the whole call, retries included, at one timeout, so a local Ollama model that takes longer than that to finish a reply needs a larger setting. A value that is not a positive whole number fails the import.
- **Unified streaming** -- all providers implement `streamChat()` returning `StreamResponse`, an `AsyncIterable<StreamChunk>` with a `response` promise. The streaming adapter normalizes raw string iterables into the standard chunk format.
- **Gateway bridge** -- `createGatewayAdapter()` wraps any `LlmProvider` into the `GatewayProvider` shape using structural typing (no compile-time dependency on module-llm-gateway).
- **OTel metrics** -- request totals, duration, and token usage are recorded as OTel counters and histograms. No-ops when no SDK is configured.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.
- **Zod config validation** -- `createProviderRegistry()` validates configuration at construction time, catching errors early.

## Production Readiness

- [ ] Set API keys for all providers you use (see `.env.example`)
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
