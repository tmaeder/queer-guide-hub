import type { RouteStation } from '@/components/transit/RouteStrip';

/**
 * Progressive contents for long documents: every top-level section, plus the
 * sub-sections of the section the reader is in. The Privacy Policy listed 13
 * sections and 5 sub-sections up front; the reader only needs the children of
 * the place they are reading. Every heading keeps its id, so a deep link to a
 * sub-section still lands (and its parent opens when it becomes active).
 */
export function progressiveStations(
  sections: RouteStation[],
  activeId: string | null | undefined,
): RouteStation[] {
  // Which top-level section owns the active station?
  let openParent: string | null = null;
  let parent: string | null = null;
  for (const s of sections) {
    if ((s.depth ?? 1) === 1) parent = s.id;
    if (s.id === activeId) {
      openParent = parent;
      break;
    }
  }

  const out: RouteStation[] = [];
  parent = null;
  for (const s of sections) {
    if ((s.depth ?? 1) === 1) {
      parent = s.id;
      out.push(s);
    } else if (parent !== null && parent === openParent) {
      out.push(s);
    }
  }
  return out;
}
