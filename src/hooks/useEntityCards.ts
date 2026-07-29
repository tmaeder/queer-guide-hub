import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildEntityCardQuery,
  reorderByIds,
  type EntityCardQuery,
  type QueryOp,
} from '@/lib/databaseBlock/query';
import { normalizeEntityCards, type EntityCard } from '@/lib/databaseBlock/normalize';
import { seedFor } from '@/lib/databaseBlock/seed';
import type { BlockSource, EntityType } from '@/lib/databaseBlock/schema';

/**
 * Hydrates the entities for one database block.
 *
 * Reads `public.v_entity_cards` and never `search_documents`: the view carries
 * the safety gate as a WHERE clause in its body, so entities in criminalizing
 * and death-penalty countries are excluded for signed-out readers and cannot be
 * re-admitted by any client-supplied filter.
 *
 * Lives in src/hooks/ because that is where the lint rule confines data access
 * — and because it is the single point where this feature touches the database.
 */

const STALE_TIME = 5 * 60_000;

/** `v_entity_cards` is a view and absent from the generated Database types. */
type Row = Record<string, unknown>;

/**
 * Only the builder surface this hook uses.
 *
 * supabase-js types `.select()` as returning a different (filter) builder than
 * `.from()`, and both are deeply generic over the whole generated Database
 * type — which does not include this view. Narrowing to the six methods we
 * actually call keeps the chain typed without dragging that generic in.
 */
interface FilterBuilder extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  eq(column: string, value: string | number | boolean): FilterBuilder;
  in(column: string, values: readonly string[]): FilterBuilder;
  gte(column: string, value: string | number): FilterBuilder;
  lte(column: string, value: string | number): FilterBuilder;
  is(column: string, value: null): FilterBuilder;
  not(column: string, operator: string, value: null): FilterBuilder;
  order(column: string, opts: { ascending: boolean }): FilterBuilder;
  limit(count: number): FilterBuilder;
}

/**
 * One cast, here, for the one relation this feature reads.
 *
 * Deliberately not `untypedFrom`: that helper's `UntypedClient` type references
 * `typeof supabase.rpc`, whose generic instantiation exceeds TypeScript's depth
 * limit (a pre-existing TS2589), and importing it would drag that error into
 * this feature's typecheck gate. `supabase.from()` is permitted here because
 * the lint rule confines data access to `src/hooks/**`.
 */
function selectFrom(relation: string, columns: string): FilterBuilder {
  return (supabase as unknown as {
    from: (r: string) => { select: (c: string) => FilterBuilder };
  })
    .from(relation)
    .select(columns);
}

/** Applies one neutral op to the builder. */
function applyOp(builder: FilterBuilder, op: QueryOp): FilterBuilder {
  switch (op.op) {
    case 'eq':
      return builder.eq(op.column, op.value);
    case 'in':
      return builder.in(op.column, op.values);
    case 'gte':
      return builder.gte(op.column, op.value);
    case 'lte':
      return builder.lte(op.column, op.value);
    case 'is':
      return builder.is(op.column, null);
    case 'not_is':
      return builder.not(op.column, 'is', null);
    default:
      return builder;
  }
}

export async function fetchEntityCards(query: EntityCardQuery): Promise<EntityCard[]> {
  // A curated block with no picks yet must not fall through to "all venues".
  if (query.ids && query.ids.length === 0) return [];

  let builder = selectFrom(query.relation, query.columns);
  for (const op of query.ops) builder = applyOp(builder, op);
  if (query.ids) builder = builder.in('entity_id', query.ids);
  if (query.order) {
    builder = builder.order(query.order.column, { ascending: query.order.ascending });
  }
  builder = builder.limit(query.limit);

  const { data, error } = await builder;
  if (error) throw error;

  const cards = normalizeEntityCards((data ?? []) as Row[]);

  // PostgREST cannot order by array position, and author order is the point of
  // a curated block. Ids with no row are deleted entities, or entities gated
  // for this reader; they drop out, which is the intended "absence, not
  // placeholder" behaviour.
  return query.ids ? reorderByIds(cards, query.ids) : cards;
}

export interface UseEntityCardsArgs {
  blockId: string;
  entityType: EntityType;
  source: BlockSource;
  /** Slug currently rendering; guards the edge seed against a bfcache bleed. */
  pageSlug?: string;
  enabled?: boolean;
}

export function useEntityCards({
  blockId,
  entityType,
  source,
  pageSlug,
  enabled = true,
}: UseEntityCardsArgs) {
  const query = buildEntityCardQuery(entityType, source);
  const seeded = pageSlug ? seedFor(blockId, pageSlug) : undefined;

  return useQuery({
    // `source` is part of the key so editing a filter refetches rather than
    // showing the previous block's contents.
    queryKey: ['entity-cards', entityType, JSON.stringify(source)],
    enabled,
    staleTime: STALE_TIME,
    queryFn: () => fetchEntityCards(query),
    initialData: seeded,
    // Seeds the cache AND marks it stale so a background revalidation runs —
    // which is how a signed-in reader picks up entities the anon-built payload
    // could not include. `placeholderData` would not write to the cache at all.
    initialDataUpdatedAt: seeded ? Date.now() - STALE_TIME : undefined,
  });
}
