# `src/components/ui/` — design system primitives

These are shadcn/ui-style components built on Radix primitives and
styled with Tailwind. Import from `@/components/ui/<name>`.

## Rules

- **Import from `@/components/ui/<name>`** for the wrapped primitives
  (Button, Card, Badge, Input, Dialog, Alert, Avatar, etc.).
- **Stay flat.** All wrappers must satisfy `flat-compliance.test.tsx`:
  `borderRadius: 0`, `boxShadow: 'none'`, no borders. If a design
  needs a shadow, the design is wrong, not the component.
- **No hardcoded colors.** Use CSS custom properties
  (`hsl(var(--foreground))`, `bg-foreground`, …). The ESLint
  `no-restricted-syntax` rule warns on hex/rgb/hsl literals.

## Naming convention

File casing is intentional, not drift — it signals the component's origin:

- **`kebab-case.tsx`** (e.g. `button.tsx`, `hover-card.tsx`, `accordion.tsx`) —
  vendored shadcn/Radix primitives. Keep the upstream name so re-syncing stays
  trivial.
- **`PascalCase.tsx`** (e.g. `Eyebrow.tsx`, `Rail.tsx`, `MotionCard.tsx`,
  `StepperShell.tsx`, `Image.tsx`) — bespoke Queer Guide components with no
  shadcn upstream.

New file → kebab if you're adding/porting a shadcn primitive, Pascal if it's
ours. Every component ships a sibling `<name>.md` documenting purpose, props,
states, a11y, and a usage example.

## Where to look

- `card.tsx` — Card, CardHeader, CardImage. CardImage owns the
  brand-color image fallback used by every list page.
- `button.tsx` — variants × sizes.
- `EmptyState.tsx` — the standard for "no data" / "filtered to zero"
  states. Always pass an icon.
- `__tests__/flat-compliance.test.tsx` — guard against anyone
  resurrecting radii or shadows.
