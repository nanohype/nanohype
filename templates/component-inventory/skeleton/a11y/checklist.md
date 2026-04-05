# Accessibility Checklist

Per-component accessibility audit checklist for the __PROJECT_NAME__ design system. Every component must pass all applicable criteria before reaching `stable` status.

## Audit process

1. Run automated tooling (axe-core, Lighthouse) on the component in isolation
2. Walk through each checklist item manually
3. Test with at least one screen reader (VoiceOver, NVDA, or JAWS)
4. Record results in the component's inventory entry under `last_audit`
5. File issues for any failures before promoting to the next lifecycle stage

## Keyboard navigation

- [ ] All interactive elements are reachable via Tab in a logical order
- [ ] Focus is visible with a clear indicator that meets 3:1 contrast ratio
- [ ] Enter and/or Space activate buttons and controls
- [ ] Escape closes overlays, dropdowns, and modals
- [ ] Arrow keys navigate within composite widgets (tabs, menus, radio groups)
- [ ] Focus is trapped inside modals and dialogs when open
- [ ] Focus returns to the trigger element when an overlay is dismissed

## Screen reader support

- [ ] All elements have accessible names (visible label, aria-label, or aria-labelledby)
- [ ] Role is communicated correctly (button, link, textbox, dialog, etc.)
- [ ] State changes are announced (expanded/collapsed, checked/unchecked, selected)
- [ ] Error messages are associated with their input via aria-describedby
- [ ] Live regions (aria-live) are used for dynamic content updates
- [ ] Decorative images have empty alt text or role="presentation"
- [ ] Data tables have proper th scope and caption elements

## Color and contrast

- [ ] Text meets 4.5:1 contrast ratio against its background (normal text)
- [ ] Large text (18px+ bold, 24px+ regular) meets 3:1 contrast ratio
- [ ] Non-text elements (icons, borders, focus rings) meet 3:1 contrast ratio
- [ ] Information is not conveyed by color alone — use icons, text, or patterns
- [ ] Component works correctly in both light and dark modes (if applicable)
- [ ] Component is usable in Windows High Contrast Mode

## Touch and pointer

- [ ] Touch targets are at least 44x44 CSS pixels
- [ ] Targets have sufficient spacing to prevent accidental activation
- [ ] Hover-revealed content is also accessible via focus or long press
- [ ] Drag-and-drop interactions have a keyboard alternative

## Motion and animation

- [ ] Animations respect prefers-reduced-motion media query
- [ ] No content flashes more than three times per second
- [ ] Auto-playing content can be paused, stopped, or hidden
- [ ] Animation durations are under 300ms for micro-interactions

## Content and structure

- [ ] Heading hierarchy is logical (no skipped levels)
- [ ] Lists use semantic markup (ul, ol, dl)
- [ ] Form fields have visible labels (not placeholder-only)
- [ ] Required fields are indicated both visually and programmatically
- [ ] Error messages describe the problem and suggest a fix
- [ ] Language is set on the root element and overridden for foreign-language content

## Component-specific notes

Use this section to record any component-specific accessibility considerations that don't fit the general checklist above.

| Component | Notes | Last audited | Pass/Fail |
|---|---|---|---|
| Button | Icon-only variants need aria-label | 2025-01-15 | Pass |
| Input | Error messages wired via aria-describedby | 2025-01-15 | Pass |
| DataTable | Row selection announcement needs work | - | Pending |
| Toast | Auto-dismiss timing must be configurable | - | Pending |
