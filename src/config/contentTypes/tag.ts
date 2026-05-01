import { Tag } from 'lucide-react';
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
  { name: 'category', label: 'Category', type: 'text', group: 'basic', filterable: true },
  { name: 'color', label: 'Color', type: 'text', group: 'details', placeholder: '#6366f1' },
  {
    name: 'usage_count',
    label: 'Usage Count',
    type: 'number',
    group: 'details',
    readOnly: true,
    sortable: true,
  },
  { name: 'wikipedia_url', label: 'Wikipedia URL', type: 'url', group: 'details' },
  { name: 'image_url', label: 'Image', type: 'image', group: 'media' },
];

export const unifiedTagsContentType: ContentTypeConfig = {
  id: 'unified_tags',
  tableName: 'unified_tags',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  imageField: 'image_url',
  icon: Tag,
  label: { singular: 'Tag', plural: 'Tags' },
  color: '#14b8a6',
  fields: tagFields,
  fieldGroupOrder: ['basic', 'details', 'media'],
};
