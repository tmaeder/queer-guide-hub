import { CONTENT_TYPES } from '@/lib/searchTaxonomy';

/** i18n key under `search.scope.*` for each search scope (content type). */
const SCOPE_I18N_KEY: Record<string, string> = {
  venue: 'venues',
  event: 'events',
  marketplace: 'marketplace',
  news: 'news',
  personality: 'people',
  city: 'cities',
  country: 'countries',
  queer_village: 'places',
  tag: 'tags',
  milestone: 'history',
  organization: 'organizations',
  guide: 'guides',
};

/** The translated label a scope chip shows, for anything that names a scope. */
export function scopeLabel(t: (key: string, fallback: string) => string, id: string): string {
  const scope = CONTENT_TYPES.find((c) => c.id === id);
  const fallback = scope?.label ?? id;
  const key = SCOPE_I18N_KEY[id];
  return key ? t(`search.scope.${key}`, fallback) : fallback;
}
