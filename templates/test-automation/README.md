# test-automation

Scaffolds a test automation framework using Playwright for browser testing with page object model, data factories, CI configuration, and structured reporting.

## What you get

- Playwright test configuration with parallel execution and HTML reporting
- Page object model with a base page class and example login page
- Test fixtures for shared setup, authentication, and page injection
- Data factory pattern for generating test data with sensible defaults
- Example spec demonstrating fixtures, page objects, and assertions
- Optional GitHub Actions workflow for CI test runs with artifact upload

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `Framework` | string | `playwright` | Test framework |
| `Language` | string | `typescript` | Programming language |
| `IncludeCi` | bool | `true` | Include GitHub Actions workflow |

## Project layout

```text
<ProjectName>/
  package.json                 # Dependencies and scripts
  tsconfig.json                # TypeScript strict mode config
  playwright.config.ts         # Playwright runner configuration
  src/
    fixtures/
      base.ts                  # Shared test fixtures
    factories/
      user.factory.ts          # User data factory
    pages/
      login.page.ts            # Login page object
    specs/
      example.spec.ts          # Example test spec
  .github/
    workflows/
      test.yml                 # CI workflow (conditional)
```

## Pairs with

- [test-plan](../test-plan/) -- test planning and strategy
- [ts-service](../ts-service/) -- TypeScript service under test
- [next-app](../next-app/) -- Next.js application under test
- [go-service](../go-service/) -- Go service under test

## Nests inside

- [monorepo](../monorepo/)
