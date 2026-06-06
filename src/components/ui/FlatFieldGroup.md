# `FlatFieldGroup` / `FlatField`

Source: [`FlatFieldGroup.tsx`](./FlatFieldGroup.tsx)

## Purpose

A card-less form section for sensitive areas (Intimate, Privacy). Hierarchy
comes from a thin top border + typography only — no background fill, no shadow —
so the form reads as a quiet document rather than a stack of cards.

## Exports

`FlatFieldGroup` (a titled section) · `FlatField` (one labelled field row).

## `FlatFieldGroup` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | section heading (`h3`) |
| `description` | `string` | — | supporting line under the title |
| `noTopBorder` | `boolean` | `false` | drop the divider (use on the first section) |
| `dense` | `boolean` | `false` | tighter child spacing (`space-y-2` vs `space-y-6`) |
| `className` | `string` | — | extra classes |

## `FlatField` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | field label (muted) |
| `hint` | `string` | — | help text below the control |
| `htmlFor` | `string` | — | associates label with the control id |

## Accessibility

- `FlatField` renders a real `<label htmlFor>` — pass the control's `id` so the
  label is programmatically associated (enforced by `jsx-a11y/label-has-associated-control`).
- Section title is an `h3`; keep the document heading order intact around it.

## Do / Don't

- **Do** set `noTopBorder` on the first group so the page doesn't open with a rule.
- **Do** use `dense` for pictogram/checkbox grids.
- **Don't** wrap these in a `Card` — the flat treatment is the point.

## Example

```tsx
import { FlatFieldGroup, FlatField } from '@/components/ui/FlatFieldGroup';

<FlatFieldGroup title="Privacy" description="Who can see this profile" noTopBorder>
  <FlatField label="Visibility" htmlFor="vis"><Select id="vis" … /></FlatField>
</FlatFieldGroup>
```
