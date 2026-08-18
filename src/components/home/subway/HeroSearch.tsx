import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * The homepage's real search field.
 *
 * What stood here was a `LocalizedLink to="/search"` dressed as an input: it
 * accepted no typing and issued no query, so the page's most prominent control
 * was a picture of a control. Meanwhile the header carried a fully working
 * search bar a few pixels above it — three search affordances, two of them
 * decoys.
 *
 * This mounts the SAME component at hero size. One engine, two mounts:
 *
 *  - `hotkey={false}` — the header mount owns ⌘K. `useSearchHotkey` binds a
 *    window listener per mount, so two owners would open both popovers and
 *    race each other's focus. The kbd hint lives in the header.
 *  - `surface="hero"` — its own listbox id (a duplicate DOM id fails the a11y
 *    sweep), its own landmark name (two same-named `role="search"` regions
 *    trip `landmark-unique`), and its own telemetry source, so hero conversion
 *    stays measurable against the header's.
 *
 * DESKTOP ONLY, and that is a product decision rather than a technical dodge.
 * On a 390px screen the header's search bar is always visible roughly 100px
 * above this one: a second identical field would be the same control twice
 * within one thumb's reach, which is the clutter this redesign exists to
 * remove. Mobile keeps the header bar — the established discovery affordance
 * there, and the one `e2e/a11y-header.spec.ts` exercises.
 *
 * It also removes a real ambiguity. On mobile, opening the header's field
 * MOVES it into the full-screen sheet (see `searchField` in
 * UniversalSearchBar), so a page carrying two comboboxes has a
 * `input[role="combobox"]` order that changes on open — the header's field
 * leaves the bar and the hero's becomes first. Anything resolving `.first()`
 * then silently addresses the wrong input.
 *
 * Opening either sheet closes the other; see the module latch in
 * UniversalSearchBar.
 */
export function HeroSearch() {
  const isMobile = useIsMobile();
  if (isMobile) return null;

  return (
    <div className="w-full max-w-xl">
      <UniversalSearchBar size="hero" hotkey={false} surface="hero" />
    </div>
  );
}

export default HeroSearch;
