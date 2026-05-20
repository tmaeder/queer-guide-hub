import { FileText } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

export const pageFields: FieldConfig[] = [
  {
    name: 'title',
    label: 'Title',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
  },
  { name: 'slug', label: 'Slug', type: 'text', required: true, group: 'basic' },
  { name: 'subtitle', label: 'Subtitle', type: 'text', group: 'basic' },
  {
    name: 'excerpt',
    label: 'Excerpt',
    type: 'textarea',
    group: 'basic',
    helpText: 'Short summary for listings',
  },
  {
    name: 'page_type',
    label: 'Page Type',
    type: 'select',
    required: true,
    group: 'basic',
    filterable: true,
    options: [
      { value: 'page', label: 'Static Page' },
      { value: 'blog_post', label: 'Blog Post' },
      { value: 'guide', label: 'Guide' },
      { value: 'resource', label: 'Resource' },
    ],
  },
  { name: 'category', label: 'Category', type: 'text', group: 'basic', filterable: true },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'basic' },
  // SEO
  { name: 'meta_title', label: 'Meta Title', type: 'text', group: 'seo', maxLength: 70 },
  {
    name: 'meta_description',
    label: 'Meta Description',
    type: 'textarea',
    group: 'seo',
    maxLength: 160,
  },
  { name: 'canonical_url', label: 'Canonical URL', type: 'url', group: 'seo' },
  { name: 'og_image_url', label: 'OG Image URL', type: 'url', group: 'seo' },
  // Media
  { name: 'cover_image_url', label: 'Cover Image', type: 'image', group: 'media' },
  { name: 'cover_image_alt', label: 'Cover Image Alt Text', type: 'text', group: 'media' },
];

export const cmsPagesContentType: ContentTypeConfig = {
  id: 'cms_pages',
  tableName: 'cms_pages',
  primaryKey: 'id',
  titleField: 'title',
  descriptionField: 'excerpt',
  imageField: 'cover_image_url',
  icon: FileText,
  label: { singular: 'Page', plural: 'Pages' },
  color: 'hsl(var(--foreground))',
  fields: pageFields,
  hasRichText: true,
  defaults: { page_type: 'blog_post', workflow_state: 'draft', visibility_level: 'private' },
  fieldGroupOrder: ['basic', 'seo', 'media'],
  translatableFields: ['title', 'subtitle', 'excerpt', 'body_html', 'meta_title', 'meta_description'],
  commentable: true,
  aiAssist: {
    ops: ['summarize', 'seo_draft', 'auto_tag'],
    writableFields: ['excerpt', 'meta_title', 'meta_description', 'tags'],
  },
};
