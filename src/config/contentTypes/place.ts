import { MapPin } from 'lucide-react';
import type { ContentTypeConfig } from '@/types/cms';

/**
 * Submission-only field contract for the legacy `place` contribution type.
 * Places enter the venue ingestion pipeline; there is no standalone `places`
 * table, so every display-only input is virtual and this config is excluded
 * from CMS navigation.
 */
export const placeSubmissionContentType: ContentTypeConfig = {
  id: 'places',
  tableName: 'venues',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  icon: MapPin,
  label: { singular: 'Place', plural: 'Places' },
  color: 'hsl(var(--foreground))',
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, group: 'basic', virtual: true },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      required: true,
      group: 'basic',
      colSpan: 2,
      virtual: true,
    },
    {
      name: 'city',
      label: 'City',
      type: 'city_autocomplete',
      required: true,
      group: 'location',
      virtual: true,
      relatedFields: { city_id: 'city_id', country_id: 'country_id' },
    },
    {
      name: 'country',
      label: 'Country',
      type: 'country_autocomplete',
      required: true,
      group: 'location',
      virtual: true,
      relatedFields: { country_id: 'country_id', city_id: 'city_id' },
    },
    {
      name: 'latitude',
      label: 'Latitude',
      type: 'number',
      group: 'location',
      min: -90,
      max: 90,
      virtual: true,
    },
    {
      name: 'longitude',
      label: 'Longitude',
      type: 'number',
      group: 'location',
      min: -180,
      max: 180,
      virtual: true,
    },
    { name: 'url', label: 'Website', type: 'url', group: 'details', virtual: true },
  ],
  defaults: {},
  fieldGroupOrder: ['basic', 'location', 'details'],
  admin: { includeInAllContent: false },
};
