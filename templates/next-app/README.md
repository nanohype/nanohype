# next-app

Next.js 15 application with App Router, streaming AI chat, Tailwind CSS, and a pluggable provider registry.

## What you get

- Next.js 15 App Router with React 19 and server components
- Streaming AI chat endpoint with pluggable provider registry (Anthropic, OpenAI)
- Chat UI components with real-time message streaming
- Tailwind CSS for styling
- Structured JSON logger
- Authentication with NextAuth.js (conditional)
- Database with Drizzle ORM and Postgres (conditional)
- Docker multi-stage build and Compose (conditional)
- ESLint, Prettier, and Vitest (conditional)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `An AI-powered web application` | Project description |
| `LlmProvider` | string | `anthropic` | Default LLM provider |
| `IncludeAuth` | bool | `true` | Include NextAuth.js authentication |
| `IncludeDatabase` | bool | `true` | Include Drizzle ORM + Postgres |
| `IncludeDocker` | bool | `true` | Include Dockerfile and Compose |
| `IncludeTests` | bool | `true` | Include Vitest test suite |

## Project layout

```text
<ProjectName>/
  src/
    app/
      layout.tsx              # Root layout with Tailwind
      page.tsx                # Landing page
      api/
        chat/
          route.ts            # Streaming AI chat endpoint
      chat/
        page.tsx              # Chat page with streaming UI
    components/
      chat/
        ChatWindow.tsx        # Chat container with input and messages
        Message.tsx           # Single message display
    lib/
      ai/
        providers/
          types.ts            # AiProvider interface
          registry.ts         # Provider registry
          anthropic.ts        # Anthropic provider
          openai.ts           # OpenAI provider
          index.ts            # Barrel (triggers self-registration)
        stream.ts             # Streaming response helpers
      db/                     # (optional) Drizzle ORM
        schema.ts
        client.ts
      auth/                   # (optional) NextAuth.js
        config.ts
    logger.ts                 # Structured JSON logger
  public/
  next.config.js
  tailwind.config.ts
  postcss.config.js
  eslint.config.js
  vitest.config.ts            # (optional)
  Dockerfile                  # (optional)
  docker-compose.yml          # (optional)
  .env.example
```

## Pairs with

- [module-auth-ts](../module-auth-ts/) -- extended auth providers
- [module-database-ts](../module-database-ts/) -- extended database layer
- [infra-vercel](../infra-vercel/) -- deploy to Vercel
- [infra-aws](../infra-aws/) -- deploy to AWS

## Nests inside

- [monorepo](../monorepo/)
