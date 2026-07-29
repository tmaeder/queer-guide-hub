import type { EntityCard } from '@/lib/databaseBlock/normalize';
import type { BlockViewState } from '@/lib/databaseBlock/schema';

/**
 * Every layout takes exactly this. One shape, five renderers — which is what
 * lets the view controller swap between them without any layout knowing how
 * the data was fetched or whether it came from the edge seed.
 */
export interface EntityLayoutProps {
  cards: EntityCard[];
  viewState: BlockViewState;
  isLoading: boolean;
}

/** Noun used in empty copy: "No venues yet." */
export const ENTITY_NOUN_PLURAL: Record<string, string> = {
  venue: 'venues',
  event: 'events',
  marketplace: 'products',
  city: 'cities',
  country: 'countries',
  queer_village: 'neighbourhoods',
  personality: 'people',
  news: 'articles',
  milestone: 'milestones',
  group: 'groups',
  organization: 'organizations',
};
