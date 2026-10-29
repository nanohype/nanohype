# chrome-ext

Chrome extension (Manifest V3) with a React sidepanel for AI-powered interactions. Built with Vite for fast development and multi-entry compilation.

## What you get

- React 19 sidepanel with streaming chat interface
- Background service worker for API routing and extension lifecycle
- Vite 6 build with multi-entry compilation (sidepanel, background, content, options)
- A `gateway` provider that calls a Platform's ModelGateway and holds no model credential
- Type-safe Chrome messaging and storage wrappers
- Optional content script for page text selection
- Optional options page that sets the gateway endpoint and route
- Manifest V3 with sidePanel, storage, and activeTab permissions

## Variables

| Variable               | Type   | Default                          | Description                                             |
| ---------------------- | ------ | -------------------------------- | ------------------------------------------------------- |
| `ProjectName`          | string | `my-extension`                   | Kebab-case project name                                 |
| `ExtensionName`        | string | `My Extension`                   | Display name in Chrome                                  |
| `Description`          | string | `An AI-powered Chrome extension` | Extension description                                   |
| `IncludeContentScript` | bool   | `true`                           | Include content script                                  |
| `IncludeOptions`       | bool   | `true`                           | Include the options page that sets the gateway endpoint |
| `LlmProvider`          | string | `gateway`                        | `gateway`, or a custom provider in `src/lib/providers/` |

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
    options/               # (optional) Gateway endpoint and route settings
      App.tsx
    lib/
      ai.ts                # LLM provider abstraction
      providers/
        gateway.ts         # Platform ModelGateway provider, no credential
      storage.ts           # Chrome storage helpers
      messaging.ts         # Type-safe messaging
  public/
    manifest.json          # Manifest V3
    icons/
```

## Model access

The extension reaches a model only through a Platform's ModelGateway, and holds no model credential: a browser has no AWS credential chain to assume an IAM role through, and the gateway, running under its tenant's EKS Pod Identity, holds the Bedrock role. The options page sets the gateway root and the route each request names, and asks for a host permission on that one origin when it saves. The extension sends the gateway no credential, so the endpoint is one the network restricts: a `kubectl port-forward` to the gateway Service on `localhost`, or an https address only the organization's network reaches. Plain http is refused for any host other than `localhost` and `127.0.0.1`.

## Pairs with

- [mcp-server-ts](../mcp-server-ts/) -- connect to MCP tool servers
- [ts-service](../ts-service/) -- backend API for the extension

## Nests inside

- [monorepo](../monorepo/)
