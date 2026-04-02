# __EXTENSION_NAME__

__DESCRIPTION__

A Chrome extension (Manifest V3) with a React sidepanel for AI-powered interactions.

## Development

### Prerequisites

- Node.js >= 22
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

1. Right-click the extension icon and select "Options" (or navigate to the options page)
2. Enter your API key for the selected LLM provider
3. Choose your preferred model
4. Save settings

## Architecture

```
sidepanel (React UI)
    |
    | chrome.runtime.sendMessage
    v
background (service worker)
    |
    | HTTP API calls
    v
LLM provider (Anthropic / OpenAI)

content script (page injection)
    |
    | chrome.runtime.sendMessage
    v
background (service worker)
```

### Key directories

- `src/sidepanel/` — React app rendered in Chrome's side panel. Chat interface with message history and input.
- `src/background/` — Service worker that routes messages between UI and AI provider. Manages API calls and sidepanel lifecycle.
- `src/content/` — Content script injected into web pages. Handles text selection and shows an overlay with AI responses.
- `src/options/` — Options page for API key and provider configuration. Settings stored via `chrome.storage.local`.
- `src/lib/` — Shared utilities: AI provider abstraction, storage helpers, message type definitions.

## Adding features

### New message types

1. Add the type to `ExtensionMessage` in `src/lib/messaging.ts`
2. Add a handler in `src/background/index.ts`
3. Add a type-safe sender in `src/lib/messaging.ts`

### New AI providers

1. Add the provider to the `LlmProvider` type in `src/lib/storage.ts`
2. Implement the provider function in `src/lib/ai.ts`
3. Update the options page model list in `src/options/App.tsx`

### New permissions

Add permissions to `public/manifest.json` under the `permissions` array. See the [Chrome extension permissions reference](https://developer.chrome.com/docs/extensions/reference/permissions-list).

## Publishing

1. Run `npm run build`
2. Zip the `dist/` directory
3. Upload to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Fill in store listing details, screenshots, and privacy disclosures
5. Submit for review
