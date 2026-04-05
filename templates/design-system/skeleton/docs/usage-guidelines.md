# Usage Guidelines

How to consume and contribute to the __PROJECT_NAME__ design system.

## Getting started

The design system is the single source of truth for UI decisions. Before building a new component or page, check whether the system already provides what you need.

### For designers

1. Open the __DESIGN_TOOLKIT__ library and enable the __PROJECT_NAME__ component library
2. Use components from the library rather than detaching or recreating them
3. Apply color and typography from the shared styles — never hard-code hex values
4. When a new pattern is needed, propose it as an addition to the system rather than a one-off

### For engineers

1. Import tokens from the design tokens package rather than defining raw values
2. Use the component catalog as the spec — each entry defines props, states, and variants
3. Follow the naming conventions defined in the catalog (kebab-case for tokens, PascalCase for components)
4. When implementing a new component, update the catalog status from `proposed` to `in-progress`

## Component lifecycle

| Status | Meaning |
|---|---|
| `proposed` | Identified as needed, not yet designed |
| `draft` | Design in progress, not ready for use |
| `review` | Design complete, awaiting team review |
| `stable` | Approved for production use |
| `deprecated` | Scheduled for removal, use the noted replacement |

## Token usage

Tokens are the atomic values of the system — colors, spacing, typography, shadows, radii. Always reference tokens by their semantic name, not their raw value.

**Do:**
```css
color: var(--color-text-primary);
padding: var(--space-md);
```

**Don't:**
```css
color: #1a1a1a;
padding: 16px;
```

## Contributing a new component

1. **Open an issue** describing the use case and why existing components don't cover it
2. **Draft the design** in __DESIGN_TOOLKIT__ using existing tokens and patterns
3. **Add a catalog entry** with anatomy, variants, and accessibility notes
4. **Get review** from the design system team before implementation
5. **Implement and test** against the catalog spec, then update status to `stable`

## Color scheme

This system supports __COLOR_SCHEME__ mode. Components should respect the active scheme via semantic token references. Never hard-code colors that only work in one mode.

## When to break the rules

Sometimes the system doesn't cover a specific need. When that happens:

- Document the deviation and the rationale
- File it as a potential addition to the system
- Use tokens for everything you can, even in one-off patterns
- Revisit after launch to see if the pattern should be formalized
