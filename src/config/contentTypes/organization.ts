import { createElement } from 'react';
import { Building2 } from '@/components/icons';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { ORG_ROLE_LABELS } from '@/lib/organizationRoles';
import { OrganizationLocationCell, OrganizationWebsiteCell } from './organizationListCells';

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
  { name: 'legal_name', label: 'Legal name', type: 'text', group: 'basic' },
  {
    name: 'roles',
    label: 'Roles',
    type: 'multiselect',
    required: true,
    group: 'basic',
    filterable: true,
    listColumn: true,
    options: Object.entries(ORG_ROLE_LABELS).map(([value, label]) => ({ value, label })),
  },
  { name: 'slug', label: 'Slug', type: 'text', group: 'basic', searchable: true },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'editorial_hook', label: 'Editorial hook', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'website', label: 'Website', type: 'url', group: 'details' },
  { name: 'email', label: 'Email', type: 'email', group: 'details' },
  { name: 'phone', label: 'Phone', type: 'phone', group: 'details' },
  { name: 'social', label: 'Social links', type: 'social_links', group: 'details', colSpan: 2 },
  { name: 'target_groups', label: 'Target groups', type: 'tags', group: 'details' },
  {
    name: '_locations',
    label: 'Locations',
    type: 'organisation_locations',
    virtual: true,
    group: 'location',
    colSpan: 2,
  },
  {
    name: '_relationships',
    label: 'Relationships',
    type: 'organisation_relationships',
    virtual: true,
    group: 'relationships',
    colSpan: 2,
  },
  {
    name: 'website_domain',
    label: 'Website domain',
    type: 'text',
    group: 'details',
    searchable: true,
  },
  // List-only columns, fed by `listSelect`'s cities/countries embeds.
  {
    name: 'location',
    label: 'Location',
    type: 'text',
    group: 'external',
    hidden: true,
    virtual: true,
    listColumn: true,
    listRender: (row) => createElement(OrganizationLocationCell, { row }),
  },
  {
    name: 'website_link',
    label: 'Web',
    type: 'text',
    group: 'external',
    hidden: true,
    virtual: true,
    listColumn: true,
    listRender: (row) => createElement(OrganizationWebsiteCell, { row }),
  },
  {
    name: 'status',
    label: 'Publication status',
    type: 'select',
    group: 'settings',
    filterable: true,
    options: ['active', 'draft', 'archived'].map((value) => ({ value, label: value })),
  },
  { name: 'founded_at', label: 'Founded', type: 'date', group: 'settings' },
  { name: 'dissolved_at', label: 'Dissolved', type: 'date', group: 'settings' },
  { name: 'is_defunct', label: 'No longer operating', type: 'boolean', group: 'settings' },
  {
    name: 'claim_status',
    label: 'Claim status',
    type: 'select',
    group: 'external',
    readOnly: true,
    filterable: true,
    listColumn: true,
    options: ['unclaimed', 'pending', 'claimed'].map((value) => ({ value, label: value })),
  },
  {
    name: 'completeness_score',
    label: 'Quality score',
    type: 'number',
    group: 'external',
    readOnly: true,
  },
  {
    name: 'trust_score',
    label: 'Trust score',
    type: 'number',
    group: 'external',
    readOnly: true,
    listColumn: true,
    sortable: true,
  },
  {
    name: 'needs_attention',
    label: 'Needs attention',
    type: 'boolean',
    group: 'external',
    readOnly: true,
    filterable: true,
    listColumn: true,
  },
  { name: 'tags', label: 'Tags', type: 'unified_tag', group: 'details' },
  { name: 'cover_image_url', label: 'Cover image', type: 'image', group: 'media' },
  { name: 'images', label: 'Images', type: 'images', group: 'media' },
  { name: 'logo_url', label: 'Logo', type: 'image', group: 'media' },
];

export const organizationContentType: ContentTypeConfig = {
  id: 'organizations',
  tableName: 'organizations',
  editorRpc: { load: 'cms_organisation_read', save: 'cms_organisation_save' },
  defaults: {
    roles: [],
    status: 'draft',
    social: {},
    images: [],
    tags: [],
    target_groups: [],
    is_defunct: false,
    _locations: [],
  },
  validate: (data) => {
    const errors = [];
    if (!Array.isArray(data.roles) || data.roles.length === 0)
      errors.push({
        field: 'roles',
        message: 'Choose at least one role.',
        severity: 'error' as const,
      });
    if (data.dissolved_at && !data.is_defunct)
      errors.push({
        field: 'is_defunct',
        message: 'A dissolved organisation must be marked as no longer operating.',
        severity: 'error' as const,
      });
    if (data.founded_at && data.dissolved_at && String(data.dissolved_at) < String(data.founded_at))
      errors.push({
        field: 'dissolved_at',
        message: 'Dissolution cannot precede founding.',
        severity: 'error' as const,
      });
    return { isValid: errors.length === 0, errors, warnings: [] };
  },
  primaryKey: 'id',
  titleField: 'name',
  listSearchFields: ['name', 'website_domain', 'slug'],
  listSelect: '*,cities(name,region_code),countries(code)',
  descriptionField: 'description',
  imageField: 'logo_url',
  icon: Building2,
  label: { singular: 'Organisation', plural: 'Organisations' },
  color: 'hsl(var(--foreground))',
  fields: organizationFields,
  fieldGroupOrder: [
    'basic',
    'location',
    'relationships',
    'details',
    'media',
    'settings',
    'external',
  ],
  admin: {
    duplicatesRoute: '/admin/duplicates',
    dedup: {
      searchType: 'organization',
      metaTable: 'organizations',
      metaCols: 'id, quality_score:completeness_score, trust_score, created_at',
      mergePath: 'entities',
    },
  },
  merge: { column: 'duplicate_of_id', label: 'Merged' },
  lifecycle: {
    type: 'organization',
    archive: { column: 'status', value: 'archived', label: 'Archived' },
  },
  publicPath: (row) => (row.slug ? `/organizations/${row.slug}` : null),
};
