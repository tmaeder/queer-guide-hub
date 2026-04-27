# A11y Manual Test Runbook

WCAG 2.2 AA manual-check pass for Events list, Event detail, Header, and mobile drawer. Run before every release touching navigation or events UI.

## Keyboard-only

- Tab from URL bar → logo → search → hamburger (mobile) or desktop nav → main content.
- `Enter` opens hamburger drawer. `Escape` closes. Focus returns to the hamburger trigger.
- Tab through an event card → title link, favorite, more-actions, tickets CTA. Every stop has a visible focus ring.
- `Space`/`Enter` activates buttons. No keyboard trap anywhere.

## Screen readers

### VoiceOver + Safari (macOS)
- Cmd+F5 → rotor → "Buttons" → "Get tickets, button" appears on event cards.
- Drawer opens → announced as "Navigation, dialog".
- Hamburger announces "Open menu, collapsed" / "expanded" state.

### NVDA + Firefox (Windows)
- Focus hamburger → "Open menu, button, collapsed". Enter → "Navigation, dialog".
- Inline event-card links announce venue + city separately.

### iOS VoiceOver (Safari)
- Rotor → "Buttons" → ticket CTA reads.
- Drawer swipe gesture closes.

## Target size (WCAG 2.5.8 AA — 24×24 min)

- Hamburger ≥ 44×44 (we ship 48).
- Icon-only buttons (`size="icon"`) ≥ 44×44.
- Footer utility buttons ≥ 36×36 with 8px clearance from surrounding controls.

## Focus visibility (WCAG 2.4.7)

- Brand ring in both light and dark: contrast ≥ 3:1 against surface.
- Focus ring renders on `:focus-visible` only (mouse click does not flash ring).

## Automated

```bash
E2E_BASE_URL=http://localhost:8080 npx playwright test e2e/a11y-events.spec.ts e2e/a11y-header.spec.ts e2e/a11y-admin.spec.ts e2e/focus-visible.spec.ts
# Standalone production scan
BASE_URL=https://queer.guide node scripts/a11y-axe-scan.mjs
```

Block on `serious` / `critical` axe violations. `link-in-text-block` is disabled intentionally (design system strict-flat removes underlines — colour-only differentiation is accepted).

## Sign-off

| Role | Name | Date |
|------|------|------|
| Engineering | Claude (a11y audit pass) | 2026-04-25 |
| Design |  |  |
| QA |  |  |
