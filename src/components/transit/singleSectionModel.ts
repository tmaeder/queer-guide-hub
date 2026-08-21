import type { RouteStation } from './RouteStrip';
import { useActiveSection } from './useActiveSection';

export interface SingleSectionDef {
  id: string;
  title: string;
  note?: string;
  /** `compact` tightens `SingleSection`'s internal spacing for context modules. */
  variant?: 'default' | 'compact';
  /** Rendered inside `SingleSection`. A section with no content is dropped. */
  content: React.ReactNode;
}

/**
 * Every subway single shares one section contract, and the reason it is a
 * shared helper rather than a convention is the route rail: a station that scrolls to a section which self-hid is a dead
 * stop on the line. Deriving both the rendered list AND the station list from
 * the same filtered array makes that unrepresentable.
 *
 * The filter is deliberately shallow — `null`, `undefined`, `false` and `[]`,
 * matching `EditorialDetailLayout`'s own guard. A component that returns
 * `null` from its own body is NOT detectable here; pass `null` for the whole
 * entry's content when the caller already knows there is no data, and put
 * self-hiding rails in the page footer instead, where there are no stations.
 * This is spec rule 2 ("a module with no data does not render") made
 * mechanical.
 *
 * Lives in `transit/` rather than `geo/` because it is not geographic: it moved
 * here when the venue and event singles became the fourth and fifth consumers.
 *
 * Named `singleSectionModel`, NOT `singleSections`, because macOS is
 * case-insensitive: a `singleSections.ts` sitting next to `SingleSections.tsx`
 * made the component file's `./singleSections` import resolve to ITSELF, and
 * every export came back `undefined` at runtime with a "you likely forgot to
 * export your component" error pointing nowhere near the cause.
 */
export function singleSections(
  defs: (SingleSectionDef | null | false | undefined)[],
): SingleSectionDef[] {
  return defs.filter((d): d is SingleSectionDef => {
    if (!d) return false;
    const c = d.content;
    if (c === null || c === undefined || c === false) return false;
    if (Array.isArray(c) && c.length === 0) return false;
    return true;
  });
}

/** Section ids in render order — what the route rail draws as stations. */
export function singleStations(sections: SingleSectionDef[]): RouteStation[] {
  return sections.map((s) => ({ id: s.id, title: s.title }));
}

/**
 * Shared active-section state for the two rail renders. `useActiveSection`
 * keys its observer on `ids.join('|')`, so passing a fresh array each render is
 * free and no memo is needed.
 */
export function useSingleActiveSection(sections: SingleSectionDef[]) {
  const [activeId, select] = useActiveSection(sections.map((s) => s.id));
  return { activeId, select };
}
