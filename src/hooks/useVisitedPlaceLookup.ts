import { useMemo } from 'react';
import { useMyPlaceMarks, type PlaceMarkEntity, type PlaceMarkKind } from '@/hooks/usePlaceMarks';

export interface VisitedPlaceLookup {
  has: (entityType: PlaceMarkEntity, entityId: string) => boolean;
  getKind: (
    entityType: PlaceMarkEntity,
    entityId: string,
  ) => PlaceMarkKind | null;
  isEmpty: boolean;
}

const KIND_PRIORITY: PlaceMarkKind[] = ['visited', 'contributed', 'saved'];

/**
 * Set-backed lookup over the user's place marks for O(1) "have I been here?"
 * checks on lists, maps, and cards. Backed by useMyPlaceMarks() so no extra
 * network — just a memoized derivation.
 */
export function useVisitedPlaceLookup(): VisitedPlaceLookup {
  const { data: marks } = useMyPlaceMarks();

  return useMemo(() => {
    const byKey = new Map<string, PlaceMarkKind>();
    (marks || []).forEach((m) => {
      const key = `${m.entity_type}:${m.entity_id}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, m.mark_type);
        return;
      }
      // Prefer higher-priority kind (visited > contributed > saved)
      if (KIND_PRIORITY.indexOf(m.mark_type) < KIND_PRIORITY.indexOf(existing)) {
        byKey.set(key, m.mark_type);
      }
    });
    return {
      has: (t, id) => byKey.has(`${t}:${id}`),
      getKind: (t, id) => byKey.get(`${t}:${id}`) ?? null,
      isEmpty: byKey.size === 0,
    };
  }, [marks]);
}
