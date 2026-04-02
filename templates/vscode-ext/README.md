# vscode-ext

VS Code extension with optional React webview panel and AI provider integration. Built with esbuild for fast bundling.

## What you get

- Extension activation with command registration
- esbuild dual-entry build (Node CJS for host, browser IIFE for webview)
- Optional React webview panel with VS Code theme integration
- Optional AI provider registry (Anthropic, OpenAI) with same pattern as other templates
- GitHub Actions CI with VSIX packaging

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `ExtensionName` | string | — | Display name in VS Code |
| `Publisher` | string | — | VS Code marketplace publisher ID |
| `Description` | string | `A VS Code extension` | Extension description |
| `ActivationEvent` | string | `onStartupFinished` | When the extension activates |
| `IncludeWebview` | bool | `true` | Include React webview panel |
| `IncludeAi` | bool | `true` | Include AI provider integration |

## Project layout

```text
<ProjectName>/
  src/
    extension.ts          # Activate/deactivate
    commands/
      example.ts          # Example command
    webview/              # (optional) React webview
      panel.ts
      app/
        App.tsx
    ai/                   # (optional) AI providers
      providers/          # Registry pattern
      client.ts
```

## Pairs with

- [mcp-server-ts](../mcp-server-ts/) -- connect to MCP tool servers
- [prompt-library](../prompt-library/) -- load versioned prompts

## Nests inside

- [monorepo](../monorepo/)
