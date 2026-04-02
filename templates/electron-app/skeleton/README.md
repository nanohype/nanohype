# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

Electron desktop app with process isolation:

- **Main process** — Node.js runtime, holds API keys, handles AI provider calls
- **Renderer process** — React 19 chat UI, no access to secrets
- **IPC bridge** — contextBridge + preload script connects renderer to main

API keys are resolved from environment variables in the main process.
The renderer communicates through `window.electronAPI.sendMessage()`.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22

## Getting Started

```bash
# Install dependencies
npm install

# Copy env file and add your API key
cp .env.example .env

# Start in development (main + renderer)
npm run dev

# In another terminal, start Electron
npm start
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start main (esbuild watch) + renderer (Vite dev) |
| `npm run build` | Production build (main + renderer) |
| `npm start` | Launch Electron with built main process |
| `npm test` | Run tests with Vitest |
| `npm run lint` | Lint with ESLint |

## Project Structure

```
src/
  main/
    index.ts               # BrowserWindow, app lifecycle, graceful shutdown
    bootstrap.ts           # Unresolved placeholder guard
    config.ts              # Zod-validated environment config
    preload.ts             # contextBridge API exposure
    ipc-handlers.ts        # AI call IPC handler
    providers/
      types.ts             # AiProvider interface
      registry.ts          # Provider registry
      anthropic.ts         # Anthropic provider
      openai.ts            # OpenAI provider
      index.ts             # Barrel (triggers registration)
  renderer/
    index.html             # Renderer entry
    main.tsx               # React root
    App.tsx                # Main app component
    components/
      Chat.tsx             # Chat interface
      Message.tsx          # Message display
    styles/
      globals.css          # Design tokens
  __tests__/
    ipc.test.ts            # Registry and IPC tests
```

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Configure production API keys for your LLM provider
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Set `NODE_ENV=production` for production builds
- [ ] Code-sign the application for macOS / Windows distribution
- [ ] Configure auto-update endpoint if using electron-updater
- [ ] Enable context isolation and sandbox (already set by default)
- [ ] Audit CSP headers in the renderer HTML
- [ ] Set up crash reporting and error telemetry

## Adding a Provider

1. Create `src/main/providers/your-provider.ts`
2. Implement the `AiProvider` interface
3. Call `registerProvider("name", new YourProvider())` at module level
4. Import the file in `src/main/providers/index.ts`
5. Add the env var mapping in `src/main/ipc-handlers.ts`
