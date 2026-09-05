# __EXTENSION_NAME__

__DESCRIPTION__

## Development

### Prerequisites

- Node.js >= 22
- VS Code >= 1.96

### Setup

```bash
npm install
```

### Build

```bash
# One-time build
npm run build

# Watch mode (rebuilds on file changes)
npm run watch
```

### Running

1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. Run commands from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):
   - `__EXTENSION_NAME__: Run Example Command`
# #if IncludeWebview && IncludeAi
   - `__EXTENSION_NAME__: Open Webview Panel`
# #endif

### Type Checking

```bash
npm run typecheck
```

# #if IncludeWebview && IncludeAi
### Webview chat

`__EXTENSION_NAME__: Open Webview Panel` opens the React panel. A message typed
there is sent to the extension host, answered by the configured AI provider,
and rendered back in the panel.

Two settings choose the provider:

| Setting | Default | Meaning |
| --- | --- | --- |
| `__PROJECT_NAME__.provider` | `anthropic` | Any name registered in `src/ai/providers` |
| `__PROJECT_NAME__.model` | *(empty)* | Model id; empty uses the provider's default |

The API key is held in VS Code's SecretStorage, not in settings or the
environment. The first message prompts for it and stores it.
# #endif

## Packaging and Publishing

```bash
# Package as .vsix
npm run package

# Publish to marketplace (requires vsce login)
npm run publish
```

## Architecture

- **esbuild** bundles the extension host from `src/extension.ts`
- Extension host runs in Node.js (CommonJS)
# #if IncludeWebview && IncludeAi
- The webview is bundled separately and runs in the browser (IIFE bundle with React)
- Communication between extension host and webview via `postMessage`, typed in `src/webview/protocol.ts`
# #endif
# #if IncludeAi
- AI providers use a self-registering registry pattern (add new providers by implementing `AiProvider` and calling `registerProvider`)
# #endif
