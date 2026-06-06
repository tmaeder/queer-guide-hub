# `accordion`

Source: [`accordion.tsx`](./accordion.tsx)

## Purpose

Vertically-stacked collapsible sections built on `@radix-ui/react-accordion`.
Headers reveal/hide their panel; the chevron rotates on open. Used for FAQs,
filter groups, and dense settings.

## Exports

`Accordion` (Root) · `AccordionItem` · `AccordionTrigger` · `AccordionContent`.

## Props

Pass-through to the Radix primitives. Common ones on the Root:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `'single' \| 'multiple'` | — | one panel open at a time, or many |
| `collapsible` | `boolean` | `false` | (single) allow closing the open item |
| `defaultValue` / `value` | `string \| string[]` | — | un/controlled open item(s) |

## States

Default · hover (trigger underlines) · open (`data-state=open`, chevron rotates
180°, panel `animate-accordion-down`) · closed (`animate-accordion-up`) · focus.

## Accessibility

- Radix supplies the WAI-ARIA accordion pattern: `button` triggers, `region`
  panels, correct `aria-expanded` / `aria-controls`.
- Keyboard: `Tab` to move between triggers, `Enter`/`Space` to toggle,
  arrow keys between headers.

## Do / Don't

- **Do** keep the chevron — it's the only open/closed affordance besides motion.
- **Do** override spacing via `className` on `AccordionContent`'s inner wrapper.
- **Don't** nest interactive controls inside the trigger label (breaks the button).

## Example

```tsx
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

<Accordion type="single" collapsible>
  <AccordionItem value="visas">
    <AccordionTrigger>Do I need a visa?</AccordionTrigger>
    <AccordionContent>Depends on your passport and destination.</AccordionContent>
  </AccordionItem>
</Accordion>
```
