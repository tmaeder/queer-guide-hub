import { useEffect, useMemo, type ReactElement } from 'react';
import { useEntityCards } from '@/hooks/useEntityCards';
import type { EntityCard } from '@/lib/databaseBlock/normalize';
import type {
  BlockSource,
  BlockViewState,
  EntityType,
  FilterKey,
} from '@/lib/databaseBlock/schema';
import { DatabaseBlockControlBar, type FilterOptions } from './DatabaseBlockControlBar';
import { EntityCalendarLayout } from './EntityCalendarLayout';
import { EntityGalleryLayout } from './EntityGalleryLayout';
import { EntityKanbanLayout } from './EntityKanbanLayout';
import { EntityListLayout } from './EntityListLayout';
import { EntityTimelineLayout } from './EntityTimelineLayout';
import { ENTITY_NOUN_PLURAL, type EntityLayoutProps } from './layoutTypes';

/**
 * Hydrates a block and renders it through the active layout.
 *
 * Reader-side search and filtering are applied in memory over the already-
 * hydrated set, not by refetching: the set is bounded (MAX_QUERY_LIMIT), the
 * interaction should be instant, and re-querying on every keystroke would both
 * hammer PostgREST and let a reader probe the database through the block.
 */

const LAYOUTS: Record<
  BlockViewState['activeLayout'],
  (p: EntityLayoutProps) => ReactElement | null
> = {
  list: EntityListLayout,
  gallery: EntityGalleryLayout,
  kanban: EntityKanbanLayout,
  timeline: EntityTimelineLayout,
  calendar: EntityCalendarLayout,
};

/** Filters offered to the reader, from values actually present in the data. */
function deriveFilterOptions(cards: EntityCard[]): FilterOptions {
  const collect = (pick: (c: EntityCard) => string | null): string[] =>
    [...new Set(cards.map(pick).filter((v): v is string => !!v))].sort();

  return {
    city: collect((c) => c.city),
    country: collect((c) => c.country),
    category: collect((c) => c.categoryLabel),
    liveness_status: collect((c) => c.livenessStatus),
  };
}

function matchesFilters(card: EntityCard, viewState: BlockViewState): boolean {
  for (const [key, value] of Object.entries(viewState.filters) as [FilterKey, unknown][]) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const actual =
      key === 'city' ? card.city
      : key === 'country' ? card.country
      : key === 'category' ? card.categoryLabel
      : key === 'liveness_status' ? card.livenessStatus
      : null;
    if (!actual || !(value as string[]).includes(actual)) return false;
  }
  return true;
}

function matchesSearch(card: EntityCard, term: string): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  return [card.title, card.description, card.city, card.country, card.categoryLabel]
    .filter(Boolean)
    .some((field) => (field as string).toLowerCase().includes(needle));
}

function sortCards(cards: EntityCard[], viewState: BlockViewState): EntityCard[] {
  const { field, dir } = viewState.sortConfig;
  // 'manual' means author order, which the fetch already restored.
  if (field === 'manual') return cards;

  const sign = dir === 'desc' ? -1 : 1;
  const value = (c: EntityCard): string | number => {
    switch (field) {
      case 'title': return c.title.toLowerCase();
      case 'start_date': return c.startMs ?? Number.POSITIVE_INFINITY;
      case 'end_date': return c.endMs ?? Number.POSITIVE_INFINITY;
      case 'updated_at': return c.updatedAtMs;
      case 'price_min': return c.priceMin ?? Number.POSITIVE_INFINITY;
      default: return c.title.toLowerCase();
    }
  };

  return [...cards].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}

export interface DatabaseViewControllerProps {
  blockId: string;
  entityType: EntityType;
  source: BlockSource;
  viewState: BlockViewState;
  /** Absent on the public side, where view state is local. */
  onViewStateChange?: (next: BlockViewState) => void;
  pageSlug?: string;
  /** Editor only: report the hydrated set so the SEO snapshot can be written. */
  onCardsResolved?: (cards: EntityCard[]) => void;
}

export function DatabaseViewController({
  blockId,
  entityType,
  source,
  viewState,
  onViewStateChange,
  pageSlug,
  onCardsResolved,
}: DatabaseViewControllerProps) {
  const { data, isLoading, isError } = useEntityCards({
    blockId,
    entityType,
    source,
    pageSlug,
  });

  const cards = useMemo(() => data ?? [], [data]);

  const visible = useMemo(() => {
    const filtered = cards.filter(
      (c) => matchesFilters(c, viewState) && matchesSearch(c, viewState.search),
    );
    return sortCards(filtered, viewState);
  }, [cards, viewState]);

  const filterOptions = useMemo(() => deriveFilterOptions(cards), [cards]);

  // Editor-side snapshot hook. Gated entities are excluded here, before anything
  // can persist them into the publicly readable body_html.
  const resolvedForSnapshot = useMemo(() => cards.filter((c) => !c.isGated), [cards]);
  useEffect(() => {
    onCardsResolved?.(resolvedForSnapshot);
  }, [onCardsResolved, resolvedForSnapshot]);

  const Layout = LAYOUTS[viewState.activeLayout] ?? EntityListLayout;
  const noun = ENTITY_NOUN_PLURAL[entityType] ?? 'entries';

  if (isError) {
    return (
      <p className="border border-border p-4 text-13 text-muted-foreground rounded-container">
        These {noun} could not be loaded.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DatabaseBlockControlBar
        viewState={viewState}
        onChange={onViewStateChange ?? (() => {})}
        filterOptions={filterOptions}
        resultCount={visible.length}
        readOnly={!onViewStateChange}
      />

      {!isLoading && visible.length === 0 ? (
        <p className="border border-border p-4 text-13 text-muted-foreground rounded-container">
          {cards.length === 0 ? `No ${noun} yet.` : `No ${noun} match these filters.`}
        </p>
      ) : (
        <Layout cards={visible} viewState={viewState} isLoading={isLoading} />
      )}
    </div>
  );
}
