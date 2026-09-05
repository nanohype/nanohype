# __PROJECT_NAME__

__DESCRIPTION__

A Next.js application with streaming AI chat, built with [Tailwind CSS](https://tailwindcss.com) and a pluggable AI provider registry.

## Getting Started

```bash
cp .env.example .env.local
# Add your API keys to .env.local
npm install
npm run dev
```

The app starts on `http://localhost:3000`. Open `/chat` to try the AI chat interface.

### With Docker

```bash
docker compose up
```

## Project Layout

```
src/
  app/
    layout.tsx                # Root layout
    page.tsx                  # Landing page
    api/
      chat/
        route.ts              # Streaming AI chat endpoint
    chat/
      page.tsx                # Chat page
  components/
    chat/
      ChatWindow.tsx          # Chat container with input
      Message.tsx             # Single message display
  lib/
    ai/
      providers/
        types.ts              # AiProvider interface
        registry.ts           # Provider registry
        anthropic.ts          # Anthropic provider
        openai.ts             # OpenAI provider
        index.ts              # Barrel (triggers registration)
      stream.ts               # Streaming response helpers
    db/                       # (optional) Database
      schema.ts               # Drizzle schema
      client.ts               # Database client
    auth/                     # (optional) Auth
      options.ts              # Providers, pages, callbacks
      config.ts               # NextAuth handlers and helpers
  logger.ts                   # Structured JSON logger
```

## AI Providers

The provider registry follows a plug-in pattern. Each provider self-registers at import time.

### Adding a Provider

1. Create a new file in `src/lib/ai/providers/` implementing the `AiProvider` interface
2. Call `registerProvider()` at the module level to self-register
3. Import the new provider file in `src/lib/ai/providers/index.ts`

### Switching Providers

Set `LLM_PROVIDER` in your `.env.local`, or pass `provider` in the chat request body:

```bash
LLM_PROVIDER=openai
```

## Database Setup

Set `DATABASE_URL` in `.env.local`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/__PROJECT_NAME__
```

Edit `src/lib/db/schema.ts` to define tables, then generate and run migrations:

```bash
npm run db:generate
npm run db:migrate
```

## Auth

`src/lib/auth/options.ts` holds `authOptions` — add providers (GitHub, Google, Credentials) to its `providers` array, and set the sign-in page and callbacks alongside them. `src/lib/auth/config.ts` passes that object to `NextAuth()` and exports what it builds: `handlers`, `auth`, `signIn`, `signOut`.

The split is what makes the options reachable on their own: `NextAuth()` reads the environment and constructs handlers at import, so a module that calls it cannot be loaded just to inspect a value.

Generate the auth secret:

```bash
npx auth secret
```

## Pairs With

- **module-auth-ts** — Extended auth providers and flows
- **module-database-ts** — Extended database patterns
- **k8s-deploy** — Deploy to a Kubernetes cluster

## Nests Inside

- **monorepo** — Add as a package in a nanohype monorepo workspace
