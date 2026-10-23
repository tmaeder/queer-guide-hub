import legacyProfileVocabularies from './legacyProfileTaxonomySeeds.json';
/** Editorial vocabularies exposed in the backend. Operational enums stay in code. */
export const TAXONOMY_CATALOG = [
  { id: 'unified_tags', label: 'Tags', group: 'Knowledge' },
  { id: 'tag_categories', label: 'Tag categories', group: 'Knowledge' },
  { id: 'news_categories', label: 'News categories', group: 'Knowledge' },
  { id: 'marketplace_categories', label: 'Marketplace categories', group: 'Commerce' },
  { id: 'amenities', label: 'Place amenities', group: 'Places & events' },
  { id: 'venue_services', label: 'Venue services', group: 'Places & events' },
  { id: 'event_types', label: 'Event types', group: 'Places & events' },
  { id: 'event_categories', label: 'Event categories', group: 'Places & events' },
  { id: 'event_amenities', label: 'Event amenities', group: 'Places & events' },
  { id: 'event_services', label: 'Event services', group: 'Places & events' },
  {
    id: 'accessibility_attributes',
    label: 'Accessibility attributes',
    group: 'People & accessibility',
  },
  { id: 'target_groups', label: 'Target groups', group: 'People & accessibility' },
  { id: 'professions', label: 'Professions', group: 'People & accessibility' },
  { id: 'kink_categories', label: 'Intimate-profile categories', group: 'People & accessibility' },
  { id: 'kink_items', label: 'Intimate-profile interests', group: 'People & accessibility' },
  { id: 'taxonomy_terms', label: 'Content & profile classifications', group: 'Classifications' },
] as const;

export const CLASSIFICATION_LABELS: Record<string, string> = {
  venue_category: 'Place categories',
  organization_role: 'Organisation roles',
  pride_flag: 'Pride flags',
  hanky_code: 'Handkerchief code reference',
  competition_category: 'Competition categories',
  marketplace_browse: 'Marketplace departments, groups & types',
  marketplace_occasion: 'Marketplace occasion shortcuts',
  marketplace_size: 'Marketplace size order',
  gender: 'Gender identities',
  orientation: 'Sexual orientations',
  chosen_family: 'Chosen family',
  coming_out: 'Coming out',
  romantic_orientation: 'Romantic orientations',
  relationship_status: 'Relationship statuses',
  relationship_style: 'Relationship styles',
  pronouns: 'Pronoun suggestions',

  hotel_type: 'Accommodation types',
  milestone_category: 'Milestone categories',
  personality_cause_of_death: 'Causes of death',
  service_category: 'Service categories',
  accessibility_category: 'Accessibility categories',
};

export const CLASSIFICATION_FIELDS: Record<string, Record<string, string>> = {
  organizations: { roles: 'organization_role' },
  venues: { category: 'venue_category', accommodation_type: 'hotel_type' },
  places: { category: 'venue_category' },
  hotels: { hotel_type: 'hotel_type' },
  milestones: { category: 'milestone_category' },
  personalities: { cause_of_death: 'personality_cause_of_death' },
  venue_services: { category: 'service_category' },
  event_services: { category: 'service_category' },
  event_amenities: { category: 'service_category' },
  accessibility_attributes: { category: 'accessibility_category' },
};

Object.assign(
  CLASSIFICATION_LABELS,
  Object.fromEntries(
    Object.keys(legacyProfileVocabularies).map((key) => [
      key,
      `Profile: ${key.slice(8).replaceAll('_', ' ')}`,
    ]),
  ),
);

/** Directory group for a `taxonomy_terms` family. */
export function classificationGroup(taxonomy: string): string {
  return taxonomy.startsWith('profile_')
    ? 'Profile preferences'
    : taxonomy.startsWith('marketplace_')
      ? 'Commerce'
      : 'Content & profile classifications';
}

/** Every family is directly discoverable, including those sharing the term table. */
export function getTaxonomyDestinations() {
  const tables = TAXONOMY_CATALOG.map((term) => ({ ...term, route: `/admin/content/${term.id}` }));
  const classifications = Object.entries(CLASSIFICATION_LABELS).map(([taxonomy, label]) => ({
    id: 'taxonomy_terms',
    label,
    group: classificationGroup(taxonomy),
    route: `/admin/content/taxonomy_terms?taxonomy=${encodeURIComponent(taxonomy)}`,
  }));
  return [...tables, ...classifications];
}
