# @nanohype/tokens

The design tokens every nanohype interface renders from: colours for both
themes, a radius scale, the type stacks, and one motion scale.

## Use it

```css
/* your app's entry stylesheet */
@import "tailwindcss";
@import "@nanohype/tokens/tokens.css";
```

Every token is a Tailwind v4 `@theme` entry, so it arrives as a utility —
`--color-card` backs `bg-card`, `--radius-md` backs `rounded-md`,
`--duration-base` backs `duration-base`. Nothing else to configure.

The stylesheet ships the dark theme as the default and redefines the same colour
names under `html.light`, so a single class swap flips every `bg-`, `text-` and
`border-` utility. Set the class pre-paint from an inline script or the page
flashes the wrong theme on load.

For the values TypeScript needs — a chart series colour, a canvas fill, an
`<svg>` attribute — import them:

```ts
import { colors, duration, easing } from "@nanohype/tokens";

chart.setOption({ color: [colors.primary, colors.success, colors.warning] });
```

## Why the values exist twice

CSS custom properties are invisible to TypeScript. A charting library cannot
read a Tailwind utility, so without a typed mirror it ends up with `#3e8e82`
hardcoded somewhere the stylesheet does not know about — which is the drift a
token layer exists to prevent.

So the values live in `tokens.css` and in `tokens.ts`, and a parity test parses
the stylesheet and compares the two. A token in one and not the other fails the
build; so does a value that disagrees. Adding `--color-info` to the CSS and
forgetting the mirror would otherwise produce no error at all — a consumer
reaching for `colors.info` just gets `undefined` and paints nothing.

The test also holds the two themes to the same key set. A colour with no
`html.light` override keeps its dark value when the user flips the toggle: one
unreadable surface, and nothing to report it.

## Adding a token

Add it to `src/tokens.css`, add it to `src/tokens.ts`, run `npm test`. The test
tells you if you did one and not the other. Colours need both themes.
