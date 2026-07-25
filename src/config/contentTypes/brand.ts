import { BadgeCheck } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

/**
 * marketplace_brands display/CRUD config. Deliberately excludes `status` and
 * `ownership_tags` from editing: those mutate ONLY through the trust-gated
 * approve_marketplace_brand / reject_marketplace_brand RPCs (asserting
 * queer/trans/BIPOC ownership requires an explicit confirm), surfaced in the
 * review queue at /admin/brands.
 */
export const brandFields: FieldConfig[] = [
  {
    name: 'display_name',
    label: 'Display Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
  },
  {
    name: 'brand_key',
    label: 'Brand Key',
    type: 'text',
    required: true,
    group: 'basic',
    helpText: 'Normalized join key against listings (lowercase). Immutable once products link to it.',
  },
  { name: 'slug', label: 'Slug', type: 'text', group: 'basic' },
  { name: 'story', label: 'Story', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'logo_url', label: 'Logo URL', type: 'url', group: 'details' },
  {
    name: 'is_spotlight',
    label: 'Spotlight',
    type: 'boolean',
    group: 'settings',
    filterable: true,
    listColumn: true,
  },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    group: 'settings',
    filterable: true,
    listColumn: true,
    readOnly: true,
    helpText: 'Changes only via the review queue (trust-gated RPCs).',
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
    ],
  },
  {
    name: 'ownership_tags',
    label: 'Ownership Tags',
    type: 'text',
    group: 'settings',
    readOnly: true,
    listColumn: true,
    helpText: 'Set via review-queue approval only.',
    listRender: (row) => ((row.ownership_tags as string[] | null) ?? []).join(', '),
  },
  {
    name: 'product_count',
    label: 'Products',
    type: 'number',
    group: 'settings',
    readOnly: true,
    sortable: true,
    listColumn: true,
  },
];

export const marketplaceBrandContentType: ContentTypeConfig = {
  id: 'marketplace_brands',
  tableName: 'marketplace_brands',
  primaryKey: 'id',
  titleField: 'display_name',
  descriptionField: 'story',
  imageField: 'logo_url',
  icon: BadgeCheck,
  label: { singular: 'Brand', plural: 'Brands' },
  color: 'hsl(var(--foreground))',
  fields: brandFields,
  defaults: {
    status: 'pending',
    is_spotlight: false,
    detection_source: 'admin',
  },
  fieldGroupOrder: ['basic', 'details', 'settings'],
  admin: {
    qualityRoute: '/admin/brands',
  },
  publicPath: (row) =>
    row.slug && row.status === 'approved' ? `/marketplace/brands/${row.slug}` : null,
};
