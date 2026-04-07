# electron-app

Electron desktop application with a React 19 renderer for AI-powered chat. Main process handles API keys and AI calls via IPC, keeping secrets out of the renderer.

## What you get

- Electron 33 with main/renderer process separation
- React 19 chat UI in the renderer with armature design tokens
- IPC bridge via contextBridge + preload for secure AI calls
- esbuild for main process bundling, Vite for renderer
- Anthropic and OpenAI provider abstraction with pluggable registry
- Optional auto-update support via electron-updater
- Optional test setup with Vitest

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | `my-electron-app` | Kebab-case project name |
| `Description` | string | `Desktop app with AI` | App description |
| `LlmProvider` | string | `anthropic` | Default provider: anthropic or openai |
| `IncludeAutoUpdate` | bool | `false` | Include auto-update support |
| `IncludeTests` | bool | `true` | Include test setup |

## Project layout

```text
<ProjectName>/
  src/
    main/
      index.ts               # BrowserWindow, IPC handlers
      preload.ts             # contextBridge exposure
      ipc-handlers.ts        # AI call handler
      providers/
        types.ts             # AiProvider interface
        registry.ts          # Provider registry
        anthropic.ts         # Anthropic provider
        openai.ts            # OpenAI provider
        index.ts             # Barrel (triggers registration)
    renderer/
      index.html             # Renderer entry HTML
      main.tsx               # React root mount
      App.tsx                # Main app component
      components/
        Chat.tsx             # Chat interface
        Message.tsx          # Message display
      styles/
        globals.css          # Armature design tokens
    __tests__/               # (optional) Tests
      ipc.test.ts
  package.json
  tsconfig.json
  vite.config.ts
  esbuild.config.mjs
```

## Pairs with

- [mcp-server-ts](../mcp-server-ts/) -- connect to MCP tool servers
- [module-database](../module-database/) -- local SQLite or shared DB
- [module-storage](../module-storage/) -- file storage integration

## Nests inside

- [monorepo](../monorepo/)
