import { Landmark } from 'lucide-react';
import { untypedRpc, untypedSupabase } from '@/integrations/supabase/untyped';
import { LANDMARK_KINDS } from '@/lib/landmarkKinds';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

/**
 * Landmarks (parks, beaches, monuments, …) as a CMS content type.
 *
 * A landmark is two rows: its spine row in `geo_places` and its
 * `geo_landmark_profiles` row. `cms_landmarks` is a read-only view joining
 * them, so the list and both exports carry every column of both tables.
 * Writes go through `cms_landmark_save`, which patches both tables in one
 * transaction and refuses a stale edit. Landmarks are created under a city or
 * village in /admin/geography, so this type cannot create.
 */
const KIND_LABELS: Record<string, string> = {
  park: 'Park',
  beach: 'Beach',
  monument: 'Monument',
  memorial: 'Memorial',
  building: 'Building',
  viewpoint: 'Viewpoint',
  landmark: 'Landmark',
  other: 'Other',
};

export const landmarkFields: FieldConfig[] = [
  {
    name: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
    listColumn: true,
  },
  { name: 'slug', label: 'Slug', type: 'text', group: 'basic', readOnly: true },
  {
    name: 'landmark_kind',
    label: 'Kind',
    type: 'select',
    required: true,
    group: 'basic',
    filterable: true,
    listColumn: true,
    options: LANDMARK_KINDS.map((value) => ({ value, label: KIND_LABELS[value] ?? value })),
  },
  { name: 'description', label: 'Description', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'address', label: 'Address', type: 'text', group: 'location' },
  { name: 'latitude', label: 'Latitude', type: 'number', group: 'location', min: -90, max: 90 },
  {
    name: 'longitude',
    label: 'Longitude',
    type: 'number',
    group: 'location',
    min: -180,
    max: 180,
  },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  {
    name: 'accessibility_notes',
    label: 'Accessibility notes',
    type: 'textarea',
    group: 'details',
    colSpan: 2,
  },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'details' },
  { name: 'image_url', label: 'Image URL', type: 'url', group: 'media' },
  {
    name: 'featured',
    label: 'Featured',
    type: 'boolean',
    group: 'settings',
    filterable: true,
  },
  {
    name: 'needs_review',
    label: 'Needs review',
    type: 'boolean',
    group: 'settings',
    filterable: true,
    listColumn: true,
    helpText: 'Hidden from search and public pages until cleared.',
  },
  { name: 'seo_indexable', label: 'Indexable', type: 'boolean', group: 'settings' },
  {
    name: 'safety_gated',
    label: 'Safety gated',
    type: 'boolean',
    group: 'settings',
    readOnly: true,
    helpText: 'Derived from the country. Gated landmarks are shown to signed-in users only.',
  },
];

async function loadLandmark(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await untypedSupabase
    .from('cms_landmarks')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No landmark with id ${id}`);
  return data as Record<string, unknown>;
}

async function saveLandmark(
  id: string | null,
  data: Record<string, unknown>,
  expectedUpdatedAt: string | null,
): Promise<Record<string, unknown>> {
  if (!id) throw new Error('Landmarks are created under a city or village in /admin/geography');
  const { data: rows, error } = await untypedRpc<Record<string, unknown>[]>('cms_landmark_save', {
    p_id: id,
    p_data: data,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error('No landmark returned from save');
  return row as Record<string, unknown>;
}

export const landmarkContentType: ContentTypeConfig = {
  id: 'landmarks',
  tableName: 'cms_landmarks',
  editorApi: { load: loadLandmark, save: saveLandmark },
  canCreate: false,
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  imageField: 'image_url',
  icon: Landmark,
  label: { singular: 'Landmark', plural: 'Landmarks' },
  color: 'hsl(var(--foreground))',
  fields: landmarkFields,
  fieldGroupOrder: ['basic', 'location', 'details', 'media', 'settings'],
  publicPath: (row) => (row.slug ? `/place/${row.slug}` : null),
};
