# Design Principles

Foundational principles for the __PROJECT_NAME__ design system. These guide every component, pattern, and token decision.

## Clarity over decoration

Every visual element serves a purpose. Remove anything that doesn't help the user understand content or complete a task. Prefer whitespace and typography hierarchy over ornamental borders or background fills.

## Consistency builds trust

Reuse existing patterns before creating new ones. When users encounter familiar layouts and interactions, they build confidence in the product. Deviations from the system require explicit justification and documentation.

## Accessibility is non-negotiable

All components meet WCAG 2.1 AA as a baseline. Color is never the sole means of conveying information. Interactive elements have visible focus indicators and support keyboard navigation. Touch targets meet minimum size requirements.

## Responsive by default

Components adapt to their container, not to fixed breakpoints. Design for the smallest viable viewport first, then enhance for larger screens. No component should assume a specific screen width.

## Content-first hierarchy

Layout decisions follow content structure. Typography scale, spacing tokens, and color contrast ratios are tuned to make content scannable. Headlines, body text, and supporting elements have clear visual weight.

## Motion with purpose

Animation communicates state changes — entering, exiting, loading, succeeding, failing. Keep durations under 300ms for micro-interactions. Respect `prefers-reduced-motion` at the system level.

## Applying these principles

When designing a new component or pattern:

1. **Check the catalog** — does an existing component solve this problem?
2. **Start with content** — write the real text before choosing a layout
3. **Test at extremes** — minimum content, maximum content, narrow viewport, wide viewport
4. **Verify accessibility** — run axe or Lighthouse, test with keyboard, check contrast
5. **Document decisions** — record why this pattern exists in the component catalog entry
