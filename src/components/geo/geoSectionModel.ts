import type { RouteStation } from '@/components/transit/RouteStrip';
import { useActiveSection } from '@/components/transit/useActiveSection';

export interface GeoSection {
  id: string;
  title: string;
  note?: string;
  /** Rendered inside `SingleSection`. A section with no content is dropped. */
  content: React.ReactNode;
}

/**
 * The three geo singles (city / country / queer village) share one section
 * contract, and the reason it is a shared helper rather than a convention is
 * the route rail: a station that scrolls to a section which self-hid is a dead
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
 */
export function geoSections(defs: (GeoSection | null | false | undefined)[]): GeoSection[] {
  return defs.filter((d): d is GeoSection => {
    if (!d) return false;
    const c = d.content;
    if (c === null || c === undefined || c === false) return false;
    if (Array.isArray(c) && c.length === 0) return false;
    return true;
  });
}

/** Section ids in render order — what the route rail draws as stations. */
export function geoStations(sections: GeoSection[]): RouteStation[] {
  return sections.map((s) => ({ id: s.id, title: s.title }));
}

/**
 * Shared active-section state for the two rail renders. `useActiveSection`
 * keys its observer on `ids.join('|')`, so passing a fresh array each render is
 * free and no memo is needed.
 */
export function useGeoActiveSection(sections: GeoSection[]) {
  const [activeId, select] = useActiveSection(sections.map((s) => s.id));
  return { activeId, select };
}
