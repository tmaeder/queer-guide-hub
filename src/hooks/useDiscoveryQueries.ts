import { useQuery } from '@tanstack/react-query';
import { fetchSimilar, fetchTrending, type SearchHit } from '@/lib/searchClient';

// Keys use joined type lists so a new array identity with the same types
// does not refetch. `select` runs once per fetch, not per render.

export function useTrendingQuery<T>(
  types: string[],
  city: string | undefined,
  limit: number,
  select: (hits: SearchHit[]) => T[],
) {
  const typesKey = types.join(',');
  return useQuery({
    queryKey: ['discovery', 'trending', typesKey, city ?? null, limit],
    queryFn: async () => select(await fetchTrending(typesKey.split(','), city, limit)),
    staleTime: 5 * 60_000,
  });
}

export function useSimilarQuery<T>(
  entity: { type: string; id: string },
  limit: number,
  contentTypes: string[] | undefined,
  select: (hits: SearchHit[], types: string[] | undefined) => T[],
) {
  const typesKey = contentTypes ? contentTypes.join(',') : '';
  return useQuery({
    queryKey: ['discovery', 'similar', entity.type, entity.id, limit, typesKey],
    queryFn: async () => {
      const types = typesKey ? typesKey.split(',') : undefined;
      // Over-fetch (3×) so `limit` rows survive the caller's filtering.
      const hits = await fetchSimilar(
        { type: entity.type, id: entity.id },
        Math.min(50, limit * 3),
        types,
      );
      return select(hits, types);
    },
    staleTime: 5 * 60_000,
  });
}
