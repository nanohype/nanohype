# __EXTENSION_NAME__

__DESCRIPTION__

A Chrome extension (Manifest V3) with a React sidepanel for AI-powered interactions.

## Development

### Prerequisites

- Node.js >= 26
- Google Chrome (or Chromium-based browser)

### Setup

```bash
npm install
```

### Build

```bash
# Development build (watch mode)
npm run dev

# Production build
npm run build
```

### Load in Chrome

1. Run `npm run build` (or `npm run dev` for watch mode)
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked" and select the `dist/` directory
5. The extension icon appears in the toolbar — click it to open the sidepanel

### Configure

The extension calls a Platform's ModelGateway and holds no model credential; the gateway holds the Bedrock role. It sends the gateway no credential either, so point it at an endpoint the network restricts. For development, forward the gateway Service to this machine:

```bash
kubectl -n tenants-<platform> port-forward svc/<platform>-gateway 8080:8080
```

1. Right-click the extension icon and select "Options" (or navigate to the options page)
2. Set the model gateway endpoint to the gateway root — `http://localhost:8080` for the port-forward above, or an https address
3. Set the route the ModelGateway declares for the extension (`default` when left empty)
4. Save settings, and grant the host permission Chrome asks for on that origin

## Architecture

```
sidepanel (React UI)
    |
    | chrome.runtime.sendMessage
    v
background (service worker)
    |
    | HTTP, no credential
    v
Platform ModelGateway (holds the Bedrock role)

content script (page injection)
    |
    | chrome.runtime.sendMessage
    v
background (service worker)
```

### Key directories

- `src/sidepanel/` — React app rendered in Chrome's side panel. Chat interface with message history and input.
- `src/background/` — Service worker that routes messages between UI and AI provider. Calls the model gateway and manages the sidepanel lifecycle.
- `src/content/` — Content script injected into web pages. Handles text selection and shows an overlay with AI responses.
- `src/options/` — Options page for the gateway endpoint and route. Settings stored via `chrome.storage.local`.
- `src/lib/` — Shared utilities: AI provider abstraction, storage helpers, message type definitions.

## Adding features

### New message types

1. Add the type to `ExtensionMessage` in `src/lib/messaging.ts`
2. Add a handler in `src/background/index.ts`
3. Add a type-safe sender in `src/lib/messaging.ts`

### New AI providers

1. Implement `AiProvider` from `src/lib/providers/types.ts` in a file under `src/lib/providers/`, calling `registerProvider()` as `gateway.ts` does
2. Import it from `src/lib/providers/index.ts`
3. Pass its name to `sendMessage()` in `src/lib/ai.ts`

### New permissions

Add permissions to the `permissions` array in the `manifest-from-bundle` plugin in `vite.config.ts`. The manifest is emitted from the build so it cannot name a file the build did not produce. See the [Chrome extension permissions reference](https://developer.chrome.com/docs/extensions/reference/permissions-list).

## Publishing

1. Run `npm run build`
2. Zip the `dist/` directory
3. Upload to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Fill in store listing details, screenshots, and privacy disclosures
5. Submit for review
