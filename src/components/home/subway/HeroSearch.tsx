import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';

/**
 * The homepage's real search field.
 *
 * What stood here was a `LocalizedLink to="/search"` dressed as an input: it
 * accepted no typing and issued no query, so the page's most prominent control
 * was a picture of a control. Meanwhile the header carried a fully working
 * search bar a few pixels above it — three search affordances, two of them
 * decoys.
 *
 * This mounts the SAME component, at hero size. One engine, two mounts:
 *
 *  - `hotkey={false}` — the header mount owns ⌘K. `useSearchHotkey` binds a
 *    window listener per mount, so two owners would open both popovers and
 *    race each other's focus. The kbd hint lives in the header, so that is
 *    where the shortcut should land.
 *  - `surface="hero"` — gives this mount its own listbox id (a duplicate DOM
 *    id fails the a11y sweep), its own landmark name (two same-named
 *    `role="search"` regions trip `landmark-unique`), and its own telemetry
 *    source, so hero conversion stays measurable against the header's.
 *
 * Opening either sheet closes the other; see the module latch in
 * UniversalSearchBar.
 */
export function HeroSearch() {
  return (
    <div className="w-full max-w-xl">
      <UniversalSearchBar size="hero" hotkey={false} surface="hero" />
    </div>
  );
}

export default HeroSearch;
