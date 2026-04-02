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
   - `__EXTENSION_NAME__: Open Webview Panel`

### Type Checking

```bash
npm run lint
```

## Packaging and Publishing

```bash
# Package as .vsix
npm run package

# Publish to marketplace (requires vsce login)
npm run publish
```

## Architecture

- **esbuild** bundles the extension host and webview separately
- Extension host runs in Node.js (CommonJS)
- Webview runs in browser (IIFE bundle with React)
- Communication between extension host and webview via `postMessage`
- AI providers use a self-registering registry pattern (add new providers by implementing `AiProvider` and calling `registerProvider`)
