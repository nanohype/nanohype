# chrome-ext

Chrome extension (Manifest V3) with a React sidepanel for AI-powered interactions. Built with Vite for fast development and multi-entry compilation.

## What you get

- React 19 sidepanel with streaming chat interface
- Background service worker for API routing and extension lifecycle
- Vite 6 build with multi-entry compilation (sidepanel, background, content, options)
- Anthropic and OpenAI provider abstraction with streaming
- Type-safe Chrome messaging and storage wrappers
- Optional content script for page text selection
- Optional options page for API key and settings management
- Manifest V3 with sidePanel, storage, and activeTab permissions

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | `my-extension` | Kebab-case project name |
| `ExtensionName` | string | `My Extension` | Display name in Chrome |
| `Description` | string | `An AI-powered Chrome extension` | Extension description |
| `IncludeContentScript` | bool | `true` | Include content script |
| `IncludeOptions` | bool | `true` | Include options page |
| `LlmProvider` | string | `anthropic` | Default provider: anthropic or openai |

## Project layout

```text
<ProjectName>/
  src/
    sidepanel/
      App.tsx              # Main sidepanel React app
      components/
        Chat.tsx           # Chat interface
        Message.tsx        # Message display
    background/
      index.ts             # Service worker
    content/               # (optional) Content script
      index.ts
      styles.css
    options/               # (optional) Settings page
      App.tsx
    lib/
      ai.ts                # LLM provider abstraction
      storage.ts           # Chrome storage helpers
      messaging.ts         # Type-safe messaging
  public/
    manifest.json          # Manifest V3
    icons/
```

## Pairs with

- [mcp-server-ts](../mcp-server-ts/) -- connect to MCP tool servers
- [ts-service](../ts-service/) -- backend API for the extension

## Nests inside

- [monorepo](../monorepo/)
