# Travel unify — PR 1: finder state in the URL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Find your escape wizard keeps its step and picks in the URL, so refresh, Back and shared links restore the trip. No visible change.

**Architecture:** One `useUrlState()` hook over `useSearchParams`, used once in `PersonalisedTripPackages`. It returns typed `choice` / `text` / `int` fields. Step changes push history; everything else replaces. A pending-params ref merges several writes made in one click, because react-router 8's `setSearchParams(prev => …)` hands `prev` from the render closure and the second write would erase the first.

**Tech stack:** React 19, react-router 8.5, vitest + Testing Library.

Design: `docs/plans/2026-11-25-travel-unify-design.md`. PRs 2 (door 2) and 3 (cutover) get their own plans after this merges.

---

## URL keys

`/travel` already reads `tab`, `section` (editorial layout), `city` and `intent` (these redirect to `/travel/book` in `src/pages/Travel.tsx`). The finder must not use them.

| Key | State | Values | Default (not written) |
|---|---|---|---|
| `step` | wizard step | `mood` `choose` `to-do` `stay` `getting-there` `book` | `mood` |
| `mood` | mood | `MOODS` values | `nightlife` |
| `when` | timing | `TIMINGS` values | `weekend` |
| `start`, `end` | custom dates | `yyyy-MM-dd` | absent |
| `guests` | travellers | 1–9 | 2 |
| `company` | travel buddies | `COMPANY` values | `none` |
| `budget` | budget | `BUDGETS` values | `comfortable` |
| `length` | duration | `DURATIONS` values | `auto` |
| `stay` | stay type | `STAY_TYPES` values | `hotel` |
| `by` | arrival mode | `ARRIVAL_MODES` values | `rail` |
| `from` | origin text | any; `from=` (empty) means "cleared, do not refill" | absent → detected city |
| `place` | city filter | any | absent |
| `pick` | chosen package id | any | absent → top ranked |

Not in the URL: `placeSeed` (random chip order) and the inner tabs of step 3.

## Files

- Create: `src/hooks/useUrlState.ts`
- Create: `src/hooks/__tests__/useUrlState.test.tsx`
- Modify: `src/components/travel/PersonalisedTripPackages.tsx` (state block ~lines 376–433, custom dates ~620/631, travellers ~728/744)
- Modify: `src/components/travel/__tests__/PersonalisedTripPackages.test.tsx` (wrap renders in `MemoryRouter`, add URL tests)

---

### Task 1: `useUrlState` hook

**Files:** Create `src/hooks/useUrlState.ts`, `src/hooks/__tests__/useUrlState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useUrlState } from '../useUrlState';

const MOODS = ['nightlife', 'slow', 'pride'] as const;

function setup(initial = '/travel') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ url: useUrlState(), location: useLocation(), nav: useNavigationType() }),
    { wrapper },
  );
}

describe('useUrlState', () => {
  it('reads an allowed choice and falls back on missing or unknown values', () => {
    expect(setup('/travel?mood=slow').result.current.url.choice('mood', MOODS, 'nightlife')[0]).toBe('slow');
    expect(setup('/travel?mood=bogus').result.current.url.choice('mood', MOODS, 'nightlife')[0]).toBe('nightlife');
    expect(setup('/travel').result.current.url.choice('mood', MOODS, 'nightlife')[0]).toBe('nightlife');
  });

  it('writing the fallback removes the key', () => {
    const { result } = setup('/travel?mood=slow');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('nightlife'));
    expect(result.current.location.search).toBe('');
  });

  it('keeps every write made in one handler', () => {
    const { result } = setup('/travel');
    act(() => {
      result.current.url.choice('mood', MOODS, 'nightlife')[1]('pride');
      result.current.url.text('pick')[1]('event-1');
    });
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('mood')).toBe('pride');
    expect(params.get('pick')).toBe('event-1');
  });

  it('replaces by default and pushes when asked', () => {
    const { result } = setup('/travel');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('slow'));
    expect(result.current.nav).toBe('REPLACE');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('pride', { push: true }));
    expect(result.current.nav).toBe('PUSH');
  });

  it('text: absent is null, an empty value stays present', () => {
    const { result } = setup('/travel');
    expect(result.current.url.text('from')[0]).toBeNull();
    act(() => result.current.url.text('from')[1](''));
    expect(result.current.url.text('from')[0]).toBe('');
    act(() => result.current.url.text('from')[1](null));
    expect(result.current.url.text('from')[0]).toBeNull();
  });

  it('int clamps to the range and falls back on junk', () => {
    expect(setup('/travel?guests=40').result.current.url.int('guests', 2, 1, 9)[0]).toBe(9);
    expect(setup('/travel?guests=0').result.current.url.int('guests', 2, 1, 9)[0]).toBe(1);
    expect(setup('/travel?guests=two').result.current.url.int('guests', 2, 1, 9)[0]).toBe(2);
  });

  it('leaves other params alone', () => {
    const { result } = setup('/travel?section=pride');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('slow'));
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('section')).toBe('pride');
    expect(params.get('mood')).toBe('slow');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (module not found)

Run: `npx vitest run src/hooks/__tests__/useUrlState.test.tsx`

- [ ] **Step 3: Implement**

```ts
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

type WriteOpts = { push?: boolean };

/**
 * URL search params as typed state. Defaults are never written, so an untouched
 * page keeps a clean URL. Writes replace history unless `push` is set.
 *
 * react-router's `setSearchParams(prev => …)` passes `prev` from the render
 * closure, so a second write in the same click would erase the first. The
 * pending ref carries the merged params until the next render.
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [params]);

  const write = (key: string, value: string | null, { push = false }: WriteOpts = {}) => {
    const base = pending.current ?? params;
    const next = new URLSearchParams(base);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (next.toString() === base.toString()) return;
    pending.current = next;
    setParams(next, { replace: !push });
  };

  return {
    choice<T extends string>(key: string, allowed: readonly T[], fallback: T) {
      const raw = params.get(key);
      const value =
        raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
      const set = (v: T, opts?: WriteOpts) => write(key, v === fallback ? null : v, opts);
      return [value, set] as const;
    },
    text(key: string) {
      const set = (v: string | null, opts?: WriteOpts) => write(key, v, opts);
      return [params.get(key), set] as const;
    },
    int(key: string, fallback: number, min: number, max: number) {
      const n = Number(params.get(key));
      const value =
        params.has(key) && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
      const set = (v: number, opts?: WriteOpts) =>
        write(key, v === fallback ? null : String(v), opts);
      return [value, set] as const;
    },
  };
}
```

- [ ] **Step 4: Run it, expect PASS** (7 tests)

Run: `npx vitest run src/hooks/__tests__/useUrlState.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUrlState.ts src/hooks/__tests__/useUrlState.test.tsx
git commit -m "feat(travel): useUrlState hook for URL-backed wizard state"
```

---

### Task 2: finder tests run inside a router, plus failing URL tests

**Files:** Modify `src/components/travel/__tests__/PersonalisedTripPackages.test.tsx`

- [ ] **Step 1: Add the router wrapper and probe**

Add to the imports:

```tsx
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
```

Below `import { PersonalisedTripPackages } …`, add:

```tsx
/** Shows the URL and offers a browser-style Back, so tests can see history. */
function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>
        history back
      </button>
    </>
  );
}

function renderFinder(initial = '/travel') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <PersonalisedTripPackages />
      <RouterProbe />
    </MemoryRouter>,
  );
}

const urlParams = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');
```

Replace every `render(<PersonalisedTripPackages />)` in the file with `renderFinder()`:

```bash
sed -i '' 's/render(<PersonalisedTripPackages \/>)/renderFinder()/g' src/components/travel/__tests__/PersonalisedTripPackages.test.tsx
```

- [ ] **Step 2: Add the three URL tests** at the end of the `describe` block

```tsx
  it('writes the step and picks to the URL', () => {
    renderFinder();
    toStay();
    fireEvent.click(screen.getByRole('button', { name: 'B&Bs' }));
    expect(urlParams().get('step')).toBe('stay');
    expect(urlParams().get('stay')).toBe('bnb');
  });

  it('restores the step and picks from the URL', () => {
    renderFinder('/travel?step=stay&stay=bnb&guests=3');
    expect(screen.getByText('Stay your way')).toBeInTheDocument();
    const booking = screen.getByRole('link', { name: /in Berlin.*Booking\.com/ });
    const url = new URL(booking.getAttribute('href')!);
    expect(url.searchParams.get('nflt')).toBe('ht_id=208;price=EUR-0-300-1');
    expect(url.searchParams.get('group_adults')).toBe('3');
  });

  it('Back returns to the previous step', () => {
    renderFinder();
    toStay();
    fireEvent.click(screen.getByRole('button', { name: 'history back' }));
    expect(urlParams().get('step')).toBe('to-do');
    expect(screen.queryByText('Stay your way')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run, expect the three new tests to FAIL and the old ones to PASS**

Run: `npx vitest run src/components/travel/__tests__/PersonalisedTripPackages.test.tsx`

---

### Task 3: wire the finder to the URL

**Files:** Modify `src/components/travel/PersonalisedTripPackages.tsx`

- [ ] **Step 1: Import the hook and add the step slugs**

Add to the imports:

```ts
import { useUrlState } from '@/hooks/useUrlState';
```

Next to `const WIZARD_STEPS = [...]` (near the bottom of the file), add:

```ts
/** URL slugs for WIZARD_STEPS, same order. */
const STEP_SLUGS = ['mood', 'choose', 'to-do', 'stay', 'getting-there', 'book'] as const;
```

- [ ] **Step 2: Replace the `useState` fields** (state block starting at `const [mood, setMood] = useState<Mood>('nightlife');`)

Replace these lines:

```ts
  const [mood, setMood] = useState<Mood>('nightlife');
  const [timing, setTiming] = useState<Timing>('weekend');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [travellers, setTravellers] = useState(2);
  const [company, setCompany] = useState<Company>('none');
  const [budget, setBudget] = useState<Budget>('comfortable');
  const [duration, setDuration] = useState<Duration>('auto');
```

with:

```ts
  // Wizard state lives in the URL so refresh, Back and shared links restore it.
  // Keys avoid tab/section/city/intent, which /travel already reads.
  const url = useUrlState();
  const [mood, setMood] = url.choice('mood', MOODS.map((m) => m.value), 'nightlife');
  const [timing, setTiming] = url.choice('when', TIMINGS.map((m) => m.value), 'weekend');
  const [customStart, setCustomStart] = url.text('start');
  const [customEnd, setCustomEnd] = url.text('end');
  const customDates = { start: customStart ?? '', end: customEnd ?? '' };
  const [travellers, setTravellers] = url.int('guests', 2, 1, 9);
  const [company, setCompany] = url.choice('company', COMPANY.map((m) => m.value), 'none');
  const [budget, setBudget] = url.choice('budget', BUDGETS.map((m) => m.value), 'comfortable');
  const [duration, setDuration] = url.choice('length', DURATIONS.map((m) => m.value), 'auto');
```

Replace:

```ts
  const [stayType, setStayType] = useState<HotelTypeOption>('hotel');
  const [arrivalMode, setArrivalMode] = useState<TransportMode>('rail');
```

with:

```ts
  const [stayType, setStayType] = url.choice('stay', STAY_TYPES.map((m) => m.value), 'hotel');
  const [arrivalMode, setArrivalMode] = url.choice(
    'by',
    ARRIVAL_MODES.map((m) => m.value),
    'rail',
  );
```

Replace:

```ts
  const [originInput, setOrigin] = useState<string | null>(null);
```

with:

```ts
  // `from=` (empty) means the reader cleared it: do not refill with the detected city.
  const [originInput, setOrigin] = url.text('from');
```

Replace:

```ts
  const [place, setPlace] = useState<string | null>(null);
```

with:

```ts
  const [place, setPlace] = url.text('place');
```

Replace:

```ts
  const [step, setStep] = useState(1);
  const [pickedId, setPickedId] = useState<string | null>(null);
```

and the `goTo` body:

```ts
  const goTo = (n: number) => {
    setStep(n);
    wizardTop.current?.scrollIntoView({ block: 'start' });
  };
```

with:

```ts
  const [stepSlug, setStepSlug] = url.choice('step', STEP_SLUGS, 'mood');
  const step = STEP_SLUGS.indexOf(stepSlug) + 1;
  const [pickedId, setPickedId] = url.text('pick');
```

```ts
  const goTo = (n: number) => {
    // Push, so the browser's Back goes back one step.
    setStepSlug(STEP_SLUGS[n - 1], { push: true });
    wizardTop.current?.scrollIntoView({ block: 'start' });
  };
```

`STEP_SLUGS` is declared at module scope below the component; `const` at module scope is initialised before the component ever renders, so the order is fine.

- [ ] **Step 3: Convert the two functional setters**

Custom dates (two `onChange` handlers):

```tsx
onChange={(e) => setCustomStart(e.target.value || null)}
```

```tsx
onChange={(e) => setCustomEnd(e.target.value || null)}
```

Travellers (the two stepper buttons):

```tsx
onClick={() => setTravellers(Math.max(1, travellers - 1))}
```

```tsx
onClick={() => setTravellers(Math.min(9, travellers + 1))}
```

- [ ] **Step 4: Typecheck the file**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep PersonalisedTripPackages`
Expected: no output. If `setOrigin` callers pass a value the new setter rejects, or a `ChipGroup` `onChange` type mismatches, fix at the call site.

- [ ] **Step 5: Run the finder tests, expect all PASS**

Run: `npx vitest run src/components/travel/__tests__/PersonalisedTripPackages.test.tsx src/hooks/__tests__/useUrlState.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/travel/PersonalisedTripPackages.tsx src/components/travel/__tests__/PersonalisedTripPackages.test.tsx
git commit -m "feat(travel): keep Find your escape step and picks in the URL"
```

---

### Task 4: gates and PR

- [ ] **Step 1: Run the travel tests, typecheck, lint**

```bash
npx vitest run src/components/travel src/pages/__tests__/Travel.test.tsx src/hooks/__tests__/useUrlState.test.tsx
npm run typecheck
npx eslint src/hooks/useUrlState.ts src/components/travel/PersonalisedTripPackages.tsx
```

Expected: tests pass, ratchet reports no new errors, lint clean.

- [ ] **Step 2: Check in the browser** (`npm run dev`, `/travel`)

1. Walk to Stay, pick B&Bs → URL shows `?step=stay&stay=bnb`.
2. Reload → still on Stay with B&Bs.
3. Browser Back → To do step.
4. Untouched `/travel` → URL has no query string.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin claude/queer-guide-travel-unify-cb02e0
gh pr create --title "Trip finder: keep step and picks in the URL" --body "<summary, test plan, link to design doc>"
```

---

## Self-review

- Spec coverage: design's "URL holds the state" and "refresh, share, back work" → Tasks 1–3. Door 2, Book extras, redirects, nav, deletes → PRs 2–3 (separate plans).
- Reserved keys `tab` / `section` / `city` / `intent` avoided; table above.
- Names: `useUrlState`, `choice`, `text`, `int`, `STEP_SLUGS`, `renderFinder`, `RouterProbe`, `urlParams` used consistently.
