# Frontend Testing Conventions

Living document for the queer.guide frontend testing initiative. See
`.claude/plans/of-queer-guide-magical-kernighan.md` for the multi-phase
plan this supports.

## Stack

- **Runner:** Vitest 4 (config inline in `vite.config.ts`)
- **DOM:** jsdom (`vitest.setup.ts` shims matchMedia, IntersectionObserver,
  ResizeObserver, scrollIntoView, pointer capture, image load)
- **Component testing:** `@testing-library/react` + `@testing-library/jest-dom`
- **E2E:** Playwright (`e2e/`, `playwright.config.ts`)
- **Coverage:** `@vitest/coverage-v8`, report-only on PR (Phase 6 will gate)

## Where tests live

- Unit tests next to source: `Foo.tsx` → `Foo.spec.tsx` OR
  `__tests__/Foo.spec.tsx` in the same directory. Either is fine; pick the
  convention already in use for the surrounding folder.
- Integration tests touching multiple modules: top-level `src/**/__tests__/`.
- E2E: `e2e/*.spec.ts`.

## File template

```ts
import { renderWithProviders, screen } from '@/test/test-utils';
import { fixtureVenue } from '@/test/fixtures';
import Foo from './Foo';

describe('Foo', () => {
  describe('Rendering', () => {
    it('renders the venue name', () => {
      renderWithProviders(<Foo venue={fixtureVenue} />);
      expect(screen.getByText(fixtureVenue.name)).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('shows empty state when venue is null', () => {
      renderWithProviders(<Foo venue={null} />);
      expect(screen.getByText(/no venue/i)).toBeInTheDocument();
    });
  });
});
```

## Conventions

### AAA pattern
Arrange (render + setup), Act (interact), Assert (expect). One observable
behavior per `it()`.

### Semantic queries
`getByRole`, `getByLabelText`, `getByPlaceholderText` over `getByTestId`.
Use regex over hardcoded strings when copy may change:
`screen.getByText(/loading/i)`.

### What to mock
- **Mock:** `@/integrations/supabase/client` (use `createMockSupabase`),
  `react-router` navigation hooks, Sentry, Stripe, third-party SDKs.
- **Don't mock:** sibling components, base UI primitives in
  `src/components/ui/`, your own hooks (test the real thing where possible).

### Required scenarios per component
1. **Rendering** — happy path renders without crashing.
2. **Props** — required props honored; default props correct.
3. **Edge cases** — null / undefined / empty array / loading / error.
4. **Interactions** — every event handler (click, change, submit, keyboard).
5. **Effects** — useEffect side effects and cleanup, where present.

### Supabase mocking

```ts
import { vi } from 'vitest';
import { createMockSupabase } from '@/test/mockSupabase';
import { fixtureVenue } from '@/test/fixtures';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: createMockSupabase({
    tables: { venues: { data: [fixtureVenue], error: null } },
    user: { id: 'u_1', email: 'test@queer.guide' },
  }),
}));
```

### Async
- `findBy*` for elements that appear after an await.
- `waitFor` for state transitions.
- `await screen.findByText(...)` over `setTimeout`.
- Set `retry: false` on TanStack Query in tests (already done in
  `renderWithProviders`'s `makeQueryClient`).

## Commands

| Task | Command |
|------|---------|
| Run all unit tests | `npm test` |
| Watch | `npm run test:watch` |
| One file | `npm test src/path/to/Foo.spec.tsx` |
| Coverage | `npm run test:coverage` → `coverage/index.html` |
| E2E | `npm run test:e2e` |

## Coverage targets (per phase)

Phase 1 (now): no threshold — collecting baseline.
Phase 2: `src/lib/`, `src/utils/`, `src/hooks/` > 90% line.
Phase 3: critical components (auth, admin, trips, search) > 85%.
Phase 6: enforced PR gate — target line 70%, branch 65%, function 75%
(tunable from baseline).

## Anti-patterns

- ❌ Testing implementation details (private state, internal method names).
- ❌ One giant test with five `expect`s for five behaviors.
- ❌ Mocking the component under test or its direct children.
- ❌ `data-testid` when a role/label/text query works.
- ❌ Hardcoded copy when the string may be translated or changed.
- ❌ Disabling `cleanup()` between tests.
