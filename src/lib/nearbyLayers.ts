import type { MapLayers } from '@/components/cruising/CruisingMap';

export const LAYER_KEYS = ['people', 'dating', 'spots'] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

/** `?layers=people,dating,spots`; absent = the default for this viewer. */
export function parseLayers(raw: string | null, optedIn: boolean): MapLayers {
  if (raw === null) return { people: true, dating: optedIn, spots: optedIn };
  // Pre-merge links used the Dating map's `both | people | spots`.
  if (raw === 'both') return { people: true, dating: optedIn, spots: true };
  const on = new Set(raw.split(','));
  return {
    people: on.has('people'),
    dating: optedIn && (on.has('dating') || raw === 'people'),
    spots: on.has('spots'),
  };
}

export function serializeLayers(layers: MapLayers): string {
  return LAYER_KEYS.filter((k) => layers[k]).join(',') || 'none';
}
