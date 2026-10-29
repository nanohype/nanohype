# __EXTENSION_NAME__

__DESCRIPTION__

## Development

### Prerequisites

- Node.js >= 26 to build and test (the extension itself runs on the Node release VS Code ships)
- VS Code >= 1.125

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

Four settings choose the provider and how it reaches a model:

| Setting | Default | Meaning |
| --- | --- | --- |
| `__PROJECT_NAME__.provider` | `bedrock` | Any name registered in `src/ai/providers` |
| `__PROJECT_NAME__.model` | *(empty)* | Bedrock inference-profile ID; empty uses `us.anthropic.claude-sonnet-5` |
| `__PROJECT_NAME__.awsProfile` | *(empty)* | AWS profile to sign with; empty uses the AWS SDK's default credential chain |
| `__PROJECT_NAME__.awsRegion` | *(empty)* | Region Bedrock is called in; empty uses `AWS_REGION`, then `us-east-1` |

The bedrock provider calls Bedrock's Converse API under the IAM role the AWS
SDK's credential chain resolves for that profile, such as an IAM Identity
Center sign-in (`aws sso login --profile <profile>`). The chain hands the
extension temporary credentials, so it holds no provider key in settings,
SecretStorage or the environment. The profile's role needs
`bedrock:InvokeModel` on the inference profile the model setting names.
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
- AI providers use a self-registering registry pattern (add new providers by implementing `AiProvider` and calling `registerProvider`); a provider authenticates through an IAM role it assumes, as the bedrock one does, never a key
# #endif
