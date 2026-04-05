# Test Strategy Brief — __PROJECT_NAME__

## Context

You are developing a test strategy for **__PROJECT_NAME__**, a **__LANGUAGE__** codebase. The testing goal is: **__TESTING_GOAL__**.

Critical paths to prioritize: __CRITICAL_PATHS__

A test strategy is not a test plan. A test plan lists what to test. A test strategy defines *how* testing works as a system — what types of tests exist, what each layer is responsible for, what tools execute them, what coverage targets apply, how tests run in CI, and how the strategy evolves as the codebase grows. The strategy should be opinionated about tradeoffs: where to invest in test infrastructure, where to accept risk, and where the cost of testing exceeds the cost of failure.

The codebase uses __LANGUAGE__ as its primary language. Your tooling recommendations, code examples, and configuration guidance should be specific to the __LANGUAGE__ ecosystem. Do not recommend generic or language-agnostic approaches where language-specific best practices exist.

The testing trophy model applies here: a thin layer of static analysis at the base, a substantial body of integration tests in the middle, unit tests for pure logic and complex algorithms, and minimal end-to-end tests at the top covering critical user journeys. This is not the testing pyramid — the emphasis is on integration tests that exercise real module boundaries, not isolated unit tests with heavy mocking.

If critical paths are specified above, they represent the highest-value testing investment. These paths should have the densest test coverage, the most robust assertions, and dedicated regression suites. If no critical paths are specified, the strategy should include a methodology for identifying them (e.g., analyzing error logs, user analytics, or architecture diagrams).

## Brief

Produce a **test strategy document** for __PROJECT_NAME__.

Your analysis and recommendations should address:

- **Codebase analysis** — Characterize the codebase structure. Identify module boundaries, external dependencies, data flows, and integration points. Determine which areas are pure logic (high unit-test value) versus integration-heavy (high integration-test value) versus UI-facing (high e2e value).
- **Test layer definitions** — Define each test layer (static analysis, unit, integration, e2e) with explicit responsibilities, boundaries, and ownership. For each layer, specify: what it tests, what it explicitly does not test, acceptable execution time, and failure response (block merge, notify, alert).
- **Tooling recommendations** — Recommend specific tools for each test layer. Include test runners, assertion libraries, mocking/stubbing utilities, coverage reporters, and CI integration plugins. Justify each recommendation against alternatives in the __LANGUAGE__ ecosystem.
- **Coverage strategy** — Define coverage targets per layer and per module. Distinguish between line coverage, branch coverage, and behavioral coverage. Explain where coverage metrics are meaningful and where they are misleading. Set minimum thresholds that block CI without creating perverse incentives to write low-value tests.
- **Critical path testing** — Design dedicated test suites for critical paths. Specify the test types, data requirements, and assertions that ensure these paths work correctly under normal conditions, edge cases, and failure scenarios.
- **Test data management** — Define the strategy for test data: fixtures, factories, seeding, synthetic generation, and sanitized production snapshots. Address data isolation between test runs and data cleanup.
- **CI integration** — Design the test execution pipeline. Specify which tests run on pre-commit, on PR, on merge to main, and on scheduled cadence. Define parallelization strategy, caching, and timeout policies.
- **Flaky test policy** — Define how flaky tests are detected, quarantined, and resolved. Specify the maximum acceptable flake rate and the process for triaging flaky failures.

## Output Specification

Produce a Markdown document with the following structure:

- **Overview** — A concise summary of the strategy's philosophy, the testing trophy model as applied to this codebase, and the key tradeoffs made.
- **Codebase Characterization** — Module map, dependency graph summary, and classification of components by test-layer affinity.
- **Test Layers** — One section per layer (static analysis, unit, integration, e2e). Each section defines scope, tools, coverage targets, execution context, and example test patterns with __LANGUAGE__ code snippets.
- **Critical Path Suites** — Dedicated section detailing test design for each critical path, including scenario matrices and data requirements.
- **Test Data Strategy** — Approach to fixtures, factories, isolation, and cleanup.
- **CI Pipeline Design** — Stage-by-stage pipeline definition with triggers, parallelism, timeouts, and failure policies.
- **Flaky Test Management** — Detection, quarantine, and resolution workflow.
- **Metrics and Reporting** — What metrics to track, where to surface them, and how to use them for decision-making without creating Goodhart's Law problems.
- **Rollout Plan** — Phased adoption plan for teams that do not yet follow this strategy, starting with the highest-value investments.

## Quality Criteria

The strategy is complete and useful when:

- Every tooling recommendation names a specific library or tool with version constraints, not just a category
- Coverage targets are differentiated by module criticality — not a single blanket number across the codebase
- The CI pipeline design specifies concrete stage definitions that a platform engineer could implement directly
- Critical path test designs include both happy-path and failure-mode scenarios
- The flaky test policy includes a detection mechanism, not just a process for handling known flakes
- Test layer boundaries are explicit — for any given behavior, the strategy makes clear which layer is responsible for testing it
- The strategy addresses the cost of testing (maintenance burden, execution time, infrastructure) not just the benefit
- Code examples use idiomatic __LANGUAGE__ patterns and reference real libraries from the __LANGUAGE__ ecosystem
- The rollout plan is incremental and starts with quick wins that demonstrate value before requiring large infrastructure investment
