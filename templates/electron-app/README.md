# electron-app

Electron desktop application with a React 19 renderer for AI-powered chat. The main process calls Bedrock under the AWS SDK's default credential chain and serves the renderer over IPC, so the renderer never holds a credential.

## What you get

- Electron 45 with main/renderer process separation
- React 19 chat UI in the renderer with CSS-variable design tokens
- IPC bridge via contextBridge + preload for secure AI calls
- esbuild for main process bundling, Vite for renderer
- A Bedrock provider (Converse, cross-region inference-profile IDs) in a pluggable registry, signing with the AWS profile the app runs under and holding no provider key
- Optional auto-update support via electron-updater
- Optional test setup with Vitest

## Variables

| Variable            | Type   | Default               | Description                                |
| ------------------- | ------ | --------------------- | ------------------------------------------ |
| `ProjectName`       | string | `my-electron-app`     | Kebab-case project name                    |
| `Description`       | string | `Desktop app with AI` | App description                            |
| `LlmProvider`       | string | `bedrock`             | Default provider: bedrock, or a custom one |
| `IncludeAutoUpdate` | bool   | `false`               | Include auto-update support                |
| `IncludeTests`      | bool   | `true`                | Include test setup                         |

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
        bedrock.ts           # Bedrock provider (Converse, default credential chain)
        index.ts             # Barrel (triggers registration)
    renderer/
      index.html             # Renderer entry HTML
      main.tsx               # React root mount
      App.tsx                # Main app component
      components/
        Chat.tsx             # Chat interface
        Message.tsx          # Message display
      styles/
        globals.css          # Global styles / design tokens
    __tests__/               # (optional) Tests
      ipc.test.ts
      bedrock.test.ts
  package.json
  tsconfig.json
  vite.config.ts
  esbuild.config.mjs
```

## Pairs with

- [mcp-server-ts](../mcp-server-ts/) -- connect to MCP tool servers
- [module-database-ts](../module-database-ts/) -- local SQLite or shared DB
- [module-storage-ts](../module-storage-ts/) -- file storage integration

## Nests inside

- [monorepo](../monorepo/)
