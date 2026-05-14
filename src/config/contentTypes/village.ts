import { Home } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

const fmtNum = (n: unknown): string =>
  typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat().format(n) : '-';

export const queerVillageFields: FieldConfig[] = [
  {
    name: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
  },
  { name: 'slug', label: 'Slug', type: 'text', required: true, group: 'basic' },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'history', label: 'History', type: 'richtext', group: 'details', colSpan: 2 },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'notable_landmarks', label: 'Notable Landmarks', type: 'tags', group: 'details' },
  { name: 'boundaries', label: 'Boundaries', type: 'json', group: 'details', helpText: 'GeoJSON boundary data' },
  // Location
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
  { name: 'latitude', label: 'Latitude', type: 'number', group: 'location', min: -90, max: 90 },
  { name: 'longitude', label: 'Longitude', type: 'number', group: 'location', min: -180, max: 180 },
  {
    name: 'featured',
    label: 'Featured',
    type: 'boolean',
    group: 'settings',
    listColumn: true,
    filterable: true,
    sortable: true,
  },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'settings' },
  { name: 'image_url', label: 'Primary Image', type: 'image', group: 'media' },
  { name: 'images', label: 'Gallery', type: 'images', group: 'media' },
  // FK references — hidden in the editor but exposed as filters in the list view.
  {
    name: 'city_id',
    label: 'City',
    type: 'select',
    group: 'external',
    hidden: true,
    filterable: true,
    dynamicOptions: { table: 'cities', valueColumn: 'id', labelColumn: 'name' },
  },
  {
    name: 'country_id',
    label: 'Country',
    type: 'select',
    group: 'external',
    hidden: true,
    filterable: true,
    dynamicOptions: { table: 'countries', valueColumn: 'id', labelColumn: 'name' },
  },
  // Virtual list-only columns (sourced from listSelect joins).
  {
    name: 'country_name',
    label: 'Country',
    type: 'text',
    group: 'external',
    hidden: true,
    virtual: true,
    listColumn: true,
    listRender: (row) => {
      const c = row.countries as { name?: string } | null | undefined;
      return c?.name ?? null;
    },
  },
  {
    name: 'lgbt_legal_status',
    label: 'LGBT legal status',
    type: 'text',
    group: 'external',
    hidden: true,
    virtual: true,
    listColumn: true,
    listRender: (row) => {
      const c = row.countries as { lgbt_legal_status?: string } | null | undefined;
      return c?.lgbt_legal_status ?? null;
    },
  },
  {
    name: 'population',
    label: 'Population',
    type: 'text',
    group: 'external',
    hidden: true,
    virtual: true,
    listColumn: true,
    listRender: (row) => {
      const city = row.cities as { population?: number } | null | undefined;
      const country = row.countries as { population?: number } | null | undefined;
      const cityPop = city?.population ?? null;
      const countryPop = country?.population ?? null;
      const value = cityPop ?? countryPop;
      if (value == null) return null;
      return `${fmtNum(value)} (${cityPop != null ? 'city' : 'country'})`;
    },
  },
  {
    name: 'venues_count',
    label: 'Venues',
    type: 'text',
    group: 'external',
    hidden: true,
    virtual: true,
    listColumn: true,
    listRender: (row) => {
      const venues = row.venues as Array<{ count?: number }> | null | undefined;
      return fmtNum(venues?.[0]?.count ?? 0);
    },
  },
  {
    name: 'events_count',
    label: 'Events',
    type: 'text',
    group: 'external',
    hidden: true,
    virtual: true,
    listColumn: true,
    listRender: (row) => {
      const events = row.events as Array<{ count?: number }> | null | undefined;
      return fmtNum(events?.[0]?.count ?? 0);
    },
  },
];

export const queerVillageContentType: ContentTypeConfig = {
  id: 'queer_villages',
  tableName: 'queer_villages',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  imageField: 'image_url',
  icon: Home,
  label: { singular: 'Queer Village', plural: 'Queer Villages' },
  color: '#d946ef',
  fields: queerVillageFields,
  listSelect:
    '*,cities(name,population),countries(name,lgbt_legal_status,population),venues(count),events(count)',
  defaults: { featured: false },
  fieldGroupOrder: ['basic', 'details', 'location', 'media', 'settings'],
};
