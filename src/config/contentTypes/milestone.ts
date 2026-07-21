import { createElement } from 'react';
import { Milestone } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { MilestoneLinksPanel } from '@/components/admin/milestones/MilestoneLinksPanel';

const PRECISION_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export const milestoneFields: FieldConfig[] = [
  {
    name: 'title',
    label: 'Title',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
    listColumn: true,
    maxLength: 255,
  },
  { name: 'slug', label: 'Slug', type: 'text', group: 'basic' },
  { name: 'description', label: 'Description', type: 'textarea', group: 'basic', colSpan: 2 },
  { name: 'date', label: 'Date', type: 'date', required: true, group: 'basic', sortable: true, listColumn: true },
  {
    name: 'date_precision',
    label: 'Date precision',
    type: 'select',
    group: 'basic',
    options: PRECISION_OPTIONS,
    helpText: "Year-precision dates store Jan 1 — the precision controls how they're rendered.",
  },
  { name: 'date_end', label: 'End date', type: 'date', group: 'basic' },
  { name: 'date_end_precision', label: 'End date precision', type: 'select', group: 'basic', options: PRECISION_OPTIONS },
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    group: 'basic',
    filterable: true,
    listColumn: true,
    options: [
      { value: 'uprising-movement', label: 'Uprising / Movement' },
      { value: 'law-equality', label: 'Law / Equality' },
      { value: 'law-decriminalization', label: 'Law / Decriminalization' },
      { value: 'law-criminalization', label: 'Law / Criminalization' },
      { value: 'depathologization', label: 'Depathologization' },
      { value: 'persecution-destruction', label: 'Persecution / Destruction' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    name: 'impact',
    label: 'Impact',
    type: 'select',
    group: 'basic',
    filterable: true,
    options: [
      { value: 'positive', label: 'Positive / progress' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'negative', label: 'Negative / setback' },
    ],
  },
  {
    name: 'significance',
    label: 'Significance (1–5)',
    type: 'number',
    group: 'basic',
    min: 1,
    max: 5,
    sortable: true,
  },
  // Location
  { name: 'location', label: 'Location (free text)', type: 'text', group: 'location', placeholder: 'Stonewall Inn, Christopher Street' },
  { name: 'region', label: 'Region', type: 'text', group: 'location' },
  {
    name: 'city_name',
    label: 'City',
    type: 'city_autocomplete',
    group: 'location',
    relatedFields: { city_id: 'city_id', country_id: 'country_id', country_name: 'country' },
  },
  {
    name: 'country_name',
    label: 'Country',
    type: 'country_autocomplete',
    group: 'location',
    relatedFields: { country_id: 'country_id' },
  },
  { name: 'city_id', label: 'City ID', type: 'text', group: 'location', hidden: true },
  { name: 'country_id', label: 'Country ID', type: 'text', group: 'location', hidden: true },
  // Details
  {
    name: 'sources',
    label: 'Sources',
    type: 'link_list',
    group: 'details',
    colSpan: 2,
    helpText: 'Every milestone needs at least one verifiable source.',
  },
  { name: 'tags', label: 'Tags', type: 'unified_tag', group: 'details' },
  { name: 'image_url', label: 'Image', type: 'image', group: 'media' },
  // Settings
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    group: 'settings',
    filterable: true,
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'published', label: 'Published' },
      { value: 'archived', label: 'Archived' },
    ],
  },
  {
    name: 'review_status',
    label: 'Review status',
    type: 'select',
    group: 'settings',
    filterable: true,
    listColumn: true,
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
    ],
  },
  { name: 'seo_indexable', label: 'SEO indexable', type: 'boolean', group: 'settings' },
  { name: 'is_featured', label: 'Featured', type: 'boolean', group: 'settings', filterable: true },
  // External / computed
  { name: 'safety_gated', label: 'Safety gated', type: 'boolean', group: 'external', readOnly: true, helpText: 'Derived from the country legal status (criminalizing / death penalty) — recomputed automatically.' },
  { name: 'quality_score', label: 'Quality score', type: 'number', group: 'external', readOnly: true },
];

export const milestoneContentType: ContentTypeConfig = {
  id: 'milestones',
  tableName: 'milestones',
  primaryKey: 'id',
  titleField: 'title',
  descriptionField: 'description',
  imageField: 'image_url',
  icon: Milestone,
  label: { singular: 'Milestone', plural: 'Milestones' },
  color: 'text-foreground',
  fields: milestoneFields,
  defaults: {
    status: 'draft',
    review_status: 'pending',
    date_precision: 'day',
    impact: 'neutral',
    significance: 3,
    seo_indexable: false,
    sources: [],
    tags: [],
  },
  fieldGroupOrder: ['basic', 'location', 'details', 'media', 'settings', 'external'],
  translatableFields: ['title', 'description'],
  aiAssist: {
    ops: ['quality_review', 'summarize', 'auto_tag'],
    writableFields: ['description', 'tags'],
  },
  defaultSort: { field: 'date', dir: 'asc' },
  extraPanels: [
    {
      id: 'links',
      label: 'Linked entities',
      render: (contentId) => createElement(MilestoneLinksPanel, { milestoneId: contentId }),
    },
  ],
};
