# nanohype

The CLI for the [nanohype](https://github.com/nanohype/nanohype) template
catalog — scaffold a template or a composite into a new project.

```sh
npx nanohype list
npx nanohype scaffold agentic-loop --var ProjectName=my-agent
npx nanohype scaffold --composite ai-chatbot --var ProjectName=my-bot
```

## What this package is

A thin entry point. The CLI, the rendering contract and the catalog loaders all
live in [`@nanohype/sdk`](https://www.npmjs.com/package/@nanohype/sdk), which
this package depends on and delegates to.

It exists because npm's unscoped namespace is separate from the `@nanohype`
scope: owning the scope does not reserve the bare name, and `npx nanohype` is
what people reach for. Running the SDK directly works identically:

```sh
npx @nanohype/sdk list
```

## What nanohype is

A public, tool-agnostic template catalog for AI-focused projects, plus the
platform contracts a factory needs to ship them: templates, composites, the
published standards, and the Platform Reference.

Full documentation at [github.com/nanohype/nanohype](https://github.com/nanohype/nanohype).

## License

Apache-2.0
