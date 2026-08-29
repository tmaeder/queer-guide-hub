import { createElement } from 'react';
import { Tag } from 'lucide-react';
import { TagAliasesSection } from '@/components/admin/TagAliasesSection';
import { TagMedicalCodesSection } from '@/components/admin/TagMedicalCodesSection';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

export const tagFields: FieldConfig[] = [
  {
    name: 'name',
    label: 'Tag Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
  },
  { name: 'slug', label: 'Slug', type: 'text', required: true, group: 'basic' },
  { name: 'description', label: 'Description', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'short_description', label: 'Short Description', type: 'text', group: 'basic' },
  {
    name: 'long_description',
    label: 'Long Description',
    type: 'richtext',
    group: 'basic',
    colSpan: 2,
  },
  { name: 'category', label: 'Category', type: 'text', group: 'basic', filterable: true },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    group: 'basic',
    filterable: true,
    options: [
      { value: 'active', label: 'Active' },
      { value: 'deprecated', label: 'Deprecated' },
      { value: 'merged', label: 'Merged' },
    ],
  },
  {
    name: 'usage_count',
    label: 'Usage Count',
    type: 'number',
    group: 'details',
    readOnly: true,
    sortable: true,
  },
  { name: 'wikipedia_url', label: 'Wikipedia URL', type: 'url', group: 'details' },
  {
    name: 'wikidata_id',
    label: 'Wikidata ID',
    type: 'text',
    group: 'details',
    placeholder: 'Q12345',
  },
  { name: 'is_sensitive', label: 'Sensitive', type: 'boolean', group: 'details' },
  { name: 'sensitive_topics', label: 'Sensitive Topics', type: 'tags', group: 'details' },
  {
    name: 'confidence_score',
    label: 'Confidence Score',
    type: 'number',
    group: 'details',
    readOnly: true,
    min: 0,
    max: 1,
  },
  {
    name: 'verification_status',
    label: 'Verification',
    type: 'select',
    group: 'details',
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'verified', label: 'Verified' },
      { value: 'rejected', label: 'Rejected' },
    ],
  },
  // No media group: glossary photography is retired (2026-08-28) — tags render
  // drawn TagPlates, and exposing image fields here would let the CMS editor
  // quietly regrow the photo corpus the retirement migration cleared.
];

export const unifiedTagsContentType: ContentTypeConfig = {
  id: 'unified_tags',
  tableName: 'unified_tags',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  icon: Tag,
  label: { singular: 'Tag', plural: 'Tags' },
  color: 'hsl(var(--foreground))',
  fields: tagFields,
  defaults: { status: 'active' },
  fieldGroupOrder: ['basic', 'details'],
  translatableFields: ['name', 'description', 'short_description', 'long_description'],
  // Aliases were reachable only from the separate tag console's edit dialog, so
  // the registry editor could not fully edit a tag — which is what kept that
  // console's duplicate tag table alive. This closes the gap. The console keeps
  // the tools that are genuinely collection-level (merge queue, CSV import,
  // bulk create, categorizer), which extraPanels cannot host: `render` is
  // per-record, not per-collection.
  extraPanels: [
    {
      id: 'aliases',
      label: 'Aliases',
      render: (contentId: string) => createElement(TagAliasesSection, { tagId: contentId }),
    },
    {
      id: 'medical-codes',
      label: 'Diagnostic codes',
      render: (contentId: string) => createElement(TagMedicalCodesSection, { tagId: contentId }),
    },
  ],
};
