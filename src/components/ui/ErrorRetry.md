# `ErrorRetry`

Source: [`ErrorRetry.tsx`](./ErrorRetry.tsx)

## Purpose

P6-2 recoverable error state for list/detail surfaces. Pairs with
`EmptyState` (no data) and `LoadingList` (loading). Always exposes a
retry action; the underlying error string surfaces only when provided.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `'Something went wrong'` | Headline shown to the user. |
| `description` | `string` | `'We couldn't load this section. Try again in a moment.'` | Explanatory body. |
| `error` | `string \| null` | — | Underlying error message, rendered in monospace when present. |
| `onRetry` | `() => void` | — | Retry handler. The retry button is hidden when omitted. |
| `retryLabel` | `string` | `'Retry'` | Button label. |

## States

Default · with-error · with-retry · with-error+retry.

## Accessibility

- `role="alert"` and `aria-live="polite"` so screen readers announce
  the error without stealing focus.
- Retry button inherits shadcn `Button` keyboard + focus-visible
  semantics.

## Do / Don't

- **Do** show this whenever a fetch fails on a public list/detail page.
- **Do** pass `onRetry` so the user has a recovery path.
- **Don't** inline a custom error block — keep the trio
  (Empty/Loading/Error) consistent across pages.
- **Don't** surface raw stack traces; pass a sanitized message via
  `error`.

## Example

```tsx
import { ErrorRetry } from '@/components/ui/ErrorRetry';

<ErrorRetry
  title="Couldn't load venues"
  description="Check your connection and try again."
  error={err?.message}
  onRetry={refetch}
/>
```
