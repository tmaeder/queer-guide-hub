import { Building } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { validateVenue } from '@/utils/contentValidation';
import { VENUE_CATEGORY_OPTIONS } from '@/lib/venueCategories';

export const venueFields: FieldConfig[] = [
  // Basic
  {
    name: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
    maxLength: 255,
  },
  { name: 'slug', label: 'Slug', type: 'text', group: 'basic' },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    group: 'basic',
    filterable: true,
    // Was a hand-maintained list offering beach / cruise_club / bookstore, none of which
    // venues_category_check allows — picking one failed the save outright — while
    // omitting organization and event-venue, which are legal and in use.
    options: VENUE_CATEGORY_OPTIONS,
  },
  {
    name: 'accommodation_type',
    label: 'Accommodation Type',
    type: 'select',
    group: 'basic',
    options: [
      { value: 'hotel', label: 'Hotel' },
      { value: 'hostel', label: 'Hostel' },
      { value: 'bnb', label: 'B&B' },
      { value: 'apartment', label: 'Apartment' },
      { value: 'resort', label: 'Resort' },
      { value: 'guesthouse', label: 'Guesthouse' },
      { value: 'other', label: 'Other' },
    ],
  },
  // Location
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
    required: true,
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
    required: true,
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
  // Details
  { name: 'phone', label: 'Phone', type: 'phone', group: 'details' },
  { name: 'email', label: 'Email', type: 'email', group: 'details' },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'instagram', label: 'Instagram', type: 'text', group: 'details', placeholder: '@handle' },
  {
    // A number, NOT a select, because venues.price_range is an integer column.
    // SelectField emits strings and nothing coerces on save, so string options
    // built a z.enum that rejected the number Postgres returns — the same
    // defect that made redirects unsavable. hotels.price_range was already
    // correct; this matches it.
    name: 'price_range',
    label: 'Price Range (1-4)',
    type: 'number',
    group: 'details',
    min: 1,
    max: 4,
    helpText: '1 = budget, 2 = mid-range, 3 = upscale, 4 = fine dining.',
  },
  {
    name: 'hours',
    label: 'Opening Hours',
    type: 'json',
    group: 'details',
    helpText: 'JSON with day names as keys',
  },
  { name: 'amenities', label: 'Amenities', type: 'tags', group: 'details' },
  { name: 'services', label: 'Services', type: 'tags', group: 'details' },
  { name: 'tags', label: 'Tags', type: 'unified_tag', group: 'details' },
  { name: 'accessibility_attributes', label: 'Accessibility', type: 'tags', group: 'details' },
  { name: 'target_groups', label: 'Target Groups', type: 'tags', group: 'details' },
  { name: 'accessibility_notes', label: 'Accessibility Notes', type: 'textarea', group: 'details' },
  { name: 'booking_url', label: 'Booking URL', type: 'url', group: 'details' },
  { name: 'venue_subtype', label: 'Venue Subtype', type: 'text', group: 'details' },
  { name: 'is_organizer', label: 'Is Organizer', type: 'boolean', group: 'details' },
  {
    name: 'organizer_handles',
    label: 'Organizer Handles',
    type: 'json',
    group: 'details',
    helpText: 'Social handles for organizer venues',
  },
  { name: 'content_language', label: 'Content Language', type: 'text', group: 'details' },
  // Media
  { name: 'images', label: 'Images', type: 'images', group: 'media' },
  { name: 'logo_url', label: 'Logo', type: 'image', group: 'media' },
  // Settings
  // The legacy `venues.featured` column was dropped in PR #312; the toggle kept writing
  // to it and did nothing. `is_featured` is the column every other entity uses.
  { name: 'is_featured', label: 'Featured', type: 'boolean', group: 'settings' },
  { name: 'verified', label: 'Verified', type: 'boolean', group: 'settings' },
  { name: 'star_rating', label: 'Star Rating', type: 'number', group: 'settings', min: 1, max: 5 },
  {
    name: 'verification_status',
    label: 'Verification Status',
    type: 'select',
    group: 'settings',
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'verified', label: 'Verified' },
      { value: 'rejected', label: 'Rejected' },
    ],
  },
  {
    name: 'closed_at',
    label: 'Closed At',
    type: 'datetime',
    group: 'settings',
    helpText: 'Set when this venue permanently closed. Leave empty if still open.',
  },
  // External (read-only)
  {
    name: 'foursquare_id',
    label: 'Foursquare ID',
    type: 'text',
    group: 'external',
    readOnly: true,
  },
  {
    name: 'foursquare_rating',
    label: 'Foursquare Rating',
    type: 'number',
    group: 'external',
    readOnly: true,
  },
  { name: 'data_source', label: 'Data Source', type: 'text', group: 'external', readOnly: true },
  {
    name: 'tripadvisor_id',
    label: 'TripAdvisor ID',
    type: 'text',
    group: 'external',
    readOnly: true,
  },
  {
    name: 'tripadvisor_rating',
    label: 'TripAdvisor Rating',
    type: 'number',
    group: 'external',
    readOnly: true,
  },
  {
    name: 'tripadvisor_review_count',
    label: 'TripAdvisor Reviews',
    type: 'number',
    group: 'external',
    readOnly: true,
  },
  { name: 'tomtom_id', label: 'TomTom ID', type: 'text', group: 'external', readOnly: true },
  {
    name: 'tomtom_rating',
    label: 'TomTom Rating',
    type: 'number',
    group: 'external',
    readOnly: true,
  },
  {
    name: 'lgbti_relevance_score',
    label: 'LGBTQ+ Relevance',
    type: 'number',
    group: 'external',
    readOnly: true,
    min: 0,
    max: 1,
  },
  {
    name: 'quality_score',
    label: 'Quality Score',
    type: 'number',
    group: 'external',
    readOnly: true,
  },
  {
    name: 'needs_attention',
    label: 'Needs Attention',
    type: 'boolean',
    group: 'external',
    readOnly: true,
    filterable: true,
    listColumn: true,
  },
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

export const venueContentType: ContentTypeConfig = {
  id: 'venues',
  tableName: 'venues',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  imageField: 'images',
  icon: Building,
  label: { singular: 'Venue', plural: 'Venues' },
  color: 'hsl(var(--foreground))',
  fields: venueFields,
  // Has to follow the field above to `is_featured` — `defaults` goes into every
  // CREATE payload, so the name dropped in PR #312 400'd the whole insert.
  defaults: { is_featured: false, verified: false, verification_status: 'pending' },
  validate: validateVenue,
  fieldGroupOrder: ['basic', 'location', 'details', 'media', 'settings', 'external'],
  translatableFields: ['name', 'description', 'accessibility_notes'],
  commentable: true,
  aiAssist: {
    ops: ['quality_review', 'summarize', 'seo_draft', 'auto_tag', 'fact_check'],
    // No meta_title/meta_description — venues has no such columns. SEO
    // overrides for entity types live in the cms_content_metadata sidecar.
    writableFields: ['description', 'tags'],
  },
  admin: {
    qualityRoute: '/admin/quality',
    duplicatesRoute: '/admin/duplicates',
    dedup: {
      searchType: 'venue',
      metaTable: 'venues',
      metaCols: 'id, quality_score, trust_score, images, created_at, is_featured',
      mergePath: 'venue',
      fuzzyRpc: 'find_fuzzy_duplicate_clusters',
      autoMergeRpc: 'run_venue_fuzzy_automerge',
    },
  },
  publicPath: (row) => (row.slug ? `/venues/${row.slug}` : null),
};
