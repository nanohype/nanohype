# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

Electron desktop app with process isolation:

- **Main process** — Node.js runtime, signs and sends AI provider calls
- **Renderer process** — React 19 chat UI, no access to credentials
- **IPC bridge** — contextBridge + preload script connects renderer to main

The bedrock provider calls Bedrock's Converse API under the AWS SDK's
default credential chain: the AWS profile the main process starts with.
The provider signs with whatever that profile resolves, so make it an IAM
Identity Center sign-in (`aws sso login --profile <profile>`) or an
assumed role (`role_arn`), which hand the app temporary credentials for
the role; a profile holding an access key of its own signs every call
with that long-lived key. The app stores no credential and no provider
key.
The renderer communicates through `window.electronAPI.sendMessage()`.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 26
- An AWS profile whose role may call `bedrock:InvokeModel` on the model's
  inference profile in the region `AWS_REGION` names, and on the foundation
  model it routes to, in every one of the profile's destination regions

## Getting Started

```bash
# Install dependencies
npm install

# Start in development (main + renderer)
npm run dev

# In another terminal, start Electron under the AWS profile it signs with
AWS_PROFILE=your-profile AWS_REGION=us-east-1 npm start
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start main (esbuild watch) + renderer (Vite dev) |
| `npm run build` | Production build (main + renderer) |
| `npm start` | Launch Electron with built main process |
| `npm test` | Run tests with Vitest |
| `npm run lint` | Lint with Biome |

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
      bedrock.ts           # Bedrock provider (Converse, default credential chain)
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
    ipc.test.ts            # Registry and IPC handler tests
    bedrock.test.ts        # Bedrock provider against a loopback server
```

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Grant the AWS role the app runs under `bedrock:InvokeModel` on the inference profile it names and on the foundation model it routes to, in every one of the profile's destination regions, and nothing wider
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
3. Call `registerProvider("name", () => yourProvider)` at module level
4. Import the file in `src/main/providers/index.ts`
5. Authenticate it the way the bedrock provider does, through an IAM role
   the main process assumes, never a key in the environment or the app
