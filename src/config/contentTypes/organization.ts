import { Building2 } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

export const organizationFields: FieldConfig[] = [
  {
    name: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
  },
  { name: 'slug', label: 'Slug', type: 'text', group: 'basic' },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'editorial_hook', label: 'Editorial hook', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'website_domain', label: 'Website domain', type: 'text', group: 'details' },
  { name: 'status', label: 'Status', type: 'text', group: 'settings' },
  { name: 'tags', label: 'Tags', type: 'unified_tag', group: 'details' },
  { name: 'logo_url', label: 'Logo', type: 'image', group: 'media' },
];

export const organizationContentType: ContentTypeConfig = {
  id: 'organizations',
  tableName: 'organizations',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  imageField: 'logo_url',
  icon: Building2,
  label: { singular: 'Organization', plural: 'Organizations' },
  color: 'hsl(var(--foreground))',
  fields: organizationFields,
  fieldGroupOrder: ['basic', 'details', 'media', 'settings'],
  admin: {
    duplicatesRoute: '/admin/duplicates',
    dedup: {
      searchType: 'organization',
      metaTable: 'organizations',
      metaCols: 'id, quality_score:completeness_score, trust_score, created_at',
      mergePath: 'entities',
    },
  },
};
