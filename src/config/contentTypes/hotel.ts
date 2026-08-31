import { Hotel } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

export const hotelFields: FieldConfig[] = [
  {
    name: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
  },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  {
    name: 'hotel_type',
    label: 'Type',
    type: 'select',
    required: true,
    group: 'basic',
    filterable: true,
    options: [
      { value: 'hotel', label: 'Hotel' },
      { value: 'bnb', label: 'B&B' },
      { value: 'hostel', label: 'Hostel' },
      { value: 'guesthouse', label: 'Guesthouse' },
      { value: 'apartment', label: 'Apartment' },
      { value: 'resort', label: 'Resort' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    name: 'address',
    label: 'Address',
    type: 'location',
    group: 'location',
    resolverType: 'address',
    relatedFields: {
      city: 'city',
      state: 'state',
      country: 'country',
      postal_code: 'postal_code',
      latitude: 'latitude',
      longitude: 'longitude',
      city_id: 'city_id',
      country_id: 'country_id',
      queer_village_id: 'queer_village_id',
    },
  },
  {
    name: 'city',
    label: 'City',
    type: 'city_autocomplete',
    group: 'location',
    filterable: true,
    relatedFields: {
      city_id: 'city_id',
      country_id: 'country_id',
      country: 'country',
    },
  },
  { name: 'state', label: 'State/Province', type: 'text', group: 'location' },
  {
    name: 'country',
    label: 'Country',
    type: 'country_autocomplete',
    group: 'location',
    filterable: true,
    relatedFields: {
      country_id: 'country_id',
      city: 'city',
      city_id: 'city_id',
    },
  },
  { name: 'postal_code', label: 'Postal Code', type: 'text', group: 'location' },
  {
    name: 'latitude',
    label: 'Latitude',
    type: 'number',
    group: 'location',
    hidden: true,
    min: -90,
    max: 90,
  },
  {
    name: 'longitude',
    label: 'Longitude',
    type: 'number',
    group: 'location',
    hidden: true,
    min: -180,
    max: 180,
  },
  { name: 'phone', label: 'Phone', type: 'phone', group: 'details' },
  { name: 'email', label: 'Email', type: 'email', group: 'details' },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'booking_url', label: 'Booking URL', type: 'url', group: 'details' },
  { name: 'star_rating', label: 'Star Rating', type: 'number', group: 'details', min: 1, max: 5 },
  {
    name: 'price_range',
    label: 'Price Range (1-4)',
    type: 'number',
    group: 'details',
    min: 1,
    max: 4,
  },
  { name: 'amenities', label: 'Amenities', type: 'tags', group: 'details' },
  { name: 'accessibility_attributes', label: 'Accessibility', type: 'tags', group: 'details' },
  {
    name: 'accessibility_notes',
    label: 'Accessibility Notes',
    type: 'textarea',
    group: 'details',
    colSpan: 2,
    helpText: 'Detail that does not fit the accessibility vocabulary above.',
  },
  // `target_groups` and `event_amenities` used to sit here. Neither is a column on
  // `hotels`, so both silently discarded whatever an admin typed. Removed rather
  // than given columns: hotels are not in `search_documents` (they surface as
  // venues), so neither has a facet, filter or detail-page reader anywhere — adding
  // storage would only make the data write-only. `event_amenities` was never a
  // column concept at all: it is a vocabulary TABLE, pasted in as if it were one.
  { name: 'lgbtq_friendly', label: 'LGBTQ+ Friendly', type: 'boolean', group: 'lgbtq' },
  {
    name: 'queer_safety_notes',
    label: 'Queer Safety Notes',
    type: 'textarea',
    group: 'lgbtq',
    colSpan: 2,
  },
  { name: 'featured', label: 'Featured', type: 'boolean', group: 'settings' },
  {
    name: 'featured_priority',
    label: 'Featured Priority',
    type: 'number',
    group: 'settings',
    min: 0,
    helpText: 'Higher = more prominent',
  },
  { name: 'verified', label: 'Verified', type: 'boolean', group: 'settings' },
  { name: 'images', label: 'Images', type: 'images', group: 'media' },
  { name: 'tags', label: 'Tags', type: 'unified_tag', group: 'settings' },
  { name: 'data_source', label: 'Data Source', type: 'text', group: 'external', readOnly: true },
  { name: 'external_id', label: 'External ID', type: 'text', group: 'external', readOnly: true },
  { name: 'city_id', label: 'City Reference', type: 'text', group: 'external', hidden: true },
  { name: 'country_id', label: 'Country Reference', type: 'text', group: 'external', hidden: true },
  {
    name: 'queer_village_id',
    label: 'Queer Village',
    type: 'text',
    group: 'external',
    readOnly: true,
  },
];

export const hotelContentType: ContentTypeConfig = {
  id: 'hotels',
  tableName: 'hotels',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  imageField: 'images',
  icon: Hotel,
  label: { singular: 'Hotel', plural: 'Hotels & BnBs' },
  color: 'hsl(var(--foreground))',
  fields: hotelFields,
  defaults: { featured: false, verified: false, lgbtq_friendly: false },
  fieldGroupOrder: ['basic', 'location', 'details', 'lgbtq', 'media', 'settings', 'external'],
  translatableFields: ['name', 'description', 'accessibility_notes'],
  admin: {
    duplicatesRoute: '/admin/duplicates',
    dedup: {
      // Hotels aren't in search_documents (they surface as venues), so the
      // generic clusterer can't see them — use a dedicated finder.
      searchType: 'hotel',
      metaTable: 'hotels',
      metaCols: 'id, quality_score:completeness_score, created_at, images',
      mergePath: 'entities',
      clusterFinder: 'find_hotel_duplicate_clusters',
    },
  },
  // `archived_at` added in 20261029100000. Before that this type had no column
  // that could express archived — only seo_indexable, which governs crawlers
  // rather than the site, so an Archive button would have deindexed without
  // hiding. RLS is what makes the column bite across ~65 read call sites.
  lifecycle: {
    type: 'hotel',
    archive: { column: 'archived_at', predicate: 'present', label: 'Archived' },
  },
  publicPath: (row) => (row.slug ? `/hotels/${row.slug}` : null),
};
