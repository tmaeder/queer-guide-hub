# Frontend Testing Conventions

Living document for the queer.guide frontend test suite. Updated after
the Phase 3-6 grind (admin/pages coverage + gate ratchet).

## Stack

- **Runner:** Vitest 4 (config inline in [vite.config.ts](../../vite.config.ts))
- **DOM:** jsdom ([src/test/setup.ts](../../src/test/setup.ts) shims matchMedia,
  IntersectionObserver, ResizeObserver, scrollIntoView, pointer capture)
- **Component testing:** `@testing-library/react` + `@testing-library/jest-dom`
- **E2E:** Playwright ([e2e/](../../e2e), [playwright.config.ts](../../playwright.config.ts))
- **Coverage:** `@vitest/coverage-v8`, **enforced** thresholds in
  `vite.config.ts` test.coverage.thresholds (Phase 6 lock).

## Where tests live

- **Unit:** sibling `__tests__/` dir. `Foo.tsx` → `__tests__/Foo.test.tsx`.
  (Older `.spec.tsx` siblings also accepted.)
- **E2E:** `e2e/*.spec.ts`.
- **PR smoke subset:** 5 specs run on every PR via
  `.github/workflows/e2e-pr-smoke.yml` (~5 min). Full 43-spec suite runs
  nightly via `e2e-nightly.yml`.

## File header

Every component test file starts with:

```ts
/**
 * @vitest-environment jsdom
 */
```

Without this, hook-using tests may misbehave under default config.

## Common patterns

### Toast / sonner

```ts
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
```

### Supabase client

```ts
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));
```

### Untyped supabase (chain proxy)

```ts
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: [], error: null });
    return chain;
  },
}));
```

### Auth

```ts
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
```

### Routing

```ts
import { MemoryRouter, Route, Routes } from 'react-router';

render(
  <MemoryRouter initialEntries={['/venues/v1']}>
    <Routes><Route path="/venues/:slug" element={<Page />} /></Routes>
  </MemoryRouter>,
);
```

### TanStack Query

```ts
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
```

### Radix Tooltip-using components

```ts
import { TooltipProvider } from '@/components/ui/tooltip';
// wrap in <TooltipProvider> or any Tooltip in the tree crashes.
```

### LocalizedLink and other route-context components

```ts
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
```

`<a>` triggers `jsx-a11y/anchor-is-valid`; use `<span>`.

### Stable references inside useEffect deps

If the page has `useEffect(() => …, [listings])` and your mock returns
`{ listings: [] }`, every render gets a fresh array reference and the
effect re-runs forever. Hoist the empty:

```ts
const EMPTY: never[] = [];
vi.mock('@/hooks/useMarketplace', () => ({
  useMarketplace: () => ({ listings: EMPTY, /* ... */ }),
}));
```

### React Flow / @xyflow/react

Page-builder canvases need a full shim:

```ts
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => null, Controls: () => null, MiniMap: () => null,
  Panel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({ fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getNodes: () => [], getEdges: () => [] }),
  useNodesState: (i: unknown[]) => [i, vi.fn(), vi.fn()],
  useEdgesState: (i: unknown[]) => [i, vi.fn(), vi.fn()],
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  Handle: () => null,
  applyNodeChanges: (_c: unknown, n: unknown[]) => n,
  applyEdgeChanges: (_c: unknown, e: unknown[]) => e,
  addEdge: (_e: unknown, edges: unknown[]) => edges,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  ConnectionLineType: { Bezier: 'bezier' },
  ConnectionMode: { Strict: 'strict', Loose: 'loose' },
  BackgroundVariant: { Lines: 'lines', Dots: 'dots' },
}));
```

### Async with never-resolving promises

For "shows loading state" tests, use a resolvable promise:

```ts
let resolve: (v: unknown) => void = () => {};
listMock.mockReturnValue(new Promise(r => { resolve = r; }));
render(<Page />);
expect(screen.getByText(/loading/i)).toBeInTheDocument();
resolve([]);
await new Promise(r => setTimeout(r, 0));
```

Never use `new Promise(() => {})` — vitest cleanup will hang the suite.

## Mocking philosophy

**Mock:**
- `@/integrations/supabase/client` and `/untyped`
- `react-router` navigation hooks
- `sonner`, Sentry, Stripe, third-party SDKs
- Heavy sibling components when integration-testing a page
  (`@/components/admin/data-table/AdminDataTable` is the classic example)

**Don't mock:**
- `src/components/ui/*` shadcn primitives
- Tested utilities — exercise the real code path
- The component under test (obvious)

## Required scenarios

For new tests, aim for:

1. **Rendering** — happy path renders without crashing.
2. **Props** — required props honored; default props correct.
3. **Edge cases** — null / undefined / empty array / loading / error.
4. **Interactions** — at least one event handler.

Smoke tests (rendering only) are acceptable for the **first** test on
any file that didn't have one — better than no coverage. Subsequent
work should expand to props + edge cases.

## Semantic queries

`getByRole` > `getByLabelText` > `getByText` > `getByTestId`. Regex
over hardcoded strings when copy may be translated:
`screen.getByText(/loading/i)`.

For Radix Dialog/DropdownMenu content rendered into a portal, use
`screen.*` not `container.querySelector` — the portal escapes the
container subtree.

## Coverage gate

Enforced in [vite.config.ts](../../vite.config.ts:43) test.coverage.thresholds.
Current floors (ratchet 2, 2026-05-16):

| metric | floor | measured |
|--------|------:|---------:|
| lines | 38 | 39.48 |
| statements | 36 | 37.34 |
| branches | 27 | 28.91 |
| functions | 28 | 30.46 |

PR build will fail if any drops below floor. Ratchet quarterly as new
tests land — pick a number ~1pt below latest measurement.

## Commands

| Task | Command |
|------|---------|
| Run all unit tests | `npm test` |
| Watch | `npm run test:watch` |
| One file | `npm test src/path/to/Foo.test.tsx` |
| Coverage | `npm run test:coverage` → `coverage/index.html` |
| E2E | `npm run test:e2e` |
| E2E UI | `npm run test:e2e:ui` |

## Anti-patterns

- ❌ Testing implementation details (private state, internal method names)
- ❌ One giant test with five `expect`s for five behaviors
- ❌ Mocking the component under test or its direct UI children
- ❌ `data-testid` when a role/label/text query works
- ❌ Hardcoded copy when the string may be translated
- ❌ `new Promise(() => {})` in async tests (cleanup hangs)
- ❌ Fresh array literal in mock return values that feed useEffect deps
- ❌ Same-case-different-letter filenames (`QuickExit.tsx` + `quickExit.ts`)
  — macOS FS is case-insensitive, second import silently wins
