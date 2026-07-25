import { createElement } from 'react';
import { BookOpen } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { GuidePicksPanel } from '@/components/admin/guides/GuidePicksPanel';
import { GuideSectionsPanel } from '@/components/admin/guides/GuideSectionsPanel';
import { GuideQuestPanel } from '@/components/admin/guides/GuideQuestPanel';

/**
 * Unified Guides content type — one family for editorial guides (tiered
 * picks), curated lists (/places rails) and community quests. Relational
 * structure (picks, sections, quest participation) lives in extraPanels;
 * quest lifecycle is derived from the publish window (starts_at/ends_at),
 * not a status value.
 */

const ENTITY_TYPE_OPTIONS = [
  { value: 'venue', label: 'Venues' },
  { value: 'event', label: 'Events' },
  { value: 'marketplace', label: 'Marketplace listings' },
  { value: 'city', label: 'Cities' },
  { value: 'country', label: 'Countries' },
  { value: 'queer_village', label: 'Queer villages' },
];

export const guideFields: FieldConfig[] = [
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
  {
    name: 'format',
    label: 'Format',
    type: 'select',
    required: true,
    group: 'basic',
    filterable: true,
    listColumn: true,
    options: [
      { value: 'guide', label: 'Guide (tiered picks)' },
      { value: 'list', label: 'List (curated rail)' },
      { value: 'quest', label: 'Quest (community challenge)' },
    ],
  },
  { name: 'dek', label: 'Dek', type: 'textarea', group: 'basic', colSpan: 2, helpText: 'One-line editorial pull under the title.' },
  { name: 'category', label: 'Category', type: 'text', group: 'basic', filterable: true, helpText: 'Free slug: bar, pride, underwear… For quests this was the theme.' },
  {
    name: 'primary_entity_type',
    label: 'Primary entity type',
    type: 'select',
    group: 'basic',
    filterable: true,
    options: ENTITY_TYPE_OPTIONS,
    helpText: 'What the picks are about. Drives the review cadence (events: 45d) and hub filters. Leave empty for mixed guides.',
  },
  // Details
  { name: 'intro_md', label: 'Intro', type: 'textarea', group: 'details', colSpan: 2, helpText: 'Markdown paragraphs. For quests this is the brief.' },
  { name: 'starts_at', label: 'Window start', type: 'date', group: 'details', helpText: 'Quest window / list display window. Quest lifecycle (scheduled → live → completed) is derived from this window.' },
  { name: 'ends_at', label: 'Window end', type: 'date', group: 'details' },
  { name: 'audience_tags', label: 'Audience tags', type: 'unified_tag', group: 'details' },
  { name: 'city_id', label: 'City ID', type: 'text', group: 'details', helpText: 'Optional city UUID for city-scoped guides (drives safety gating + city rails).' },
  // Media
  { name: 'hero_image_path', label: 'Hero image', type: 'image', group: 'media' },
  // Settings
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    group: 'settings',
    filterable: true,
    listColumn: true,
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'review', label: 'In review' },
      { value: 'published', label: 'Published' },
      { value: 'archived', label: 'Archived' },
    ],
  },
  { name: 'is_featured', label: 'Featured', type: 'boolean', group: 'settings', filterable: true },
  { name: 'reading_time_min', label: 'Reading time (min)', type: 'number', group: 'settings', min: 1, max: 120 },
  // External / computed
  { name: 'pick_count', label: 'Picks', type: 'number', group: 'external', readOnly: true, listColumn: true },
  { name: 'safety_gated', label: 'Safety gated', type: 'boolean', group: 'external', readOnly: true, helpText: 'Derived from the city’s country legal status — recomputed automatically.' },
  { name: 'review_due_at', label: 'Review due', type: 'date', group: 'external', readOnly: true },
  { name: 'published_at', label: 'Published at', type: 'date', group: 'external', readOnly: true },
];

export const guideContentType: ContentTypeConfig = {
  id: 'guides',
  tableName: 'guides',
  primaryKey: 'id',
  titleField: 'title',
  descriptionField: 'dek',
  imageField: 'hero_image_path',
  icon: BookOpen,
  label: { singular: 'Guide', plural: 'Guides' },
  color: 'text-foreground',
  fields: guideFields,
  defaults: {
    format: 'guide',
    status: 'draft',
    audience_tags: [],
    is_featured: false,
  },
  fieldGroupOrder: ['basic', 'details', 'media', 'settings', 'external'],
  translatableFields: ['title', 'dek', 'intro_md'],
  aiAssist: {
    ops: ['quality_review', 'summarize'],
    writableFields: ['dek', 'intro_md'],
  },
  defaultSort: { field: 'published_at', dir: 'desc' },
  extraPanels: [
    {
      id: 'picks',
      label: 'Picks',
      render: (contentId) => createElement(GuidePicksPanel, { guideId: contentId }),
    },
    {
      id: 'sections',
      label: 'Sections',
      render: (contentId) => createElement(GuideSectionsPanel, { guideId: contentId }),
    },
    {
      id: 'quest',
      label: 'Quest',
      render: (contentId) => createElement(GuideQuestPanel, { guideId: contentId }),
    },
  ],
  admin: {
    includeInAllContent: false,
  },
  publicPath: (row) => (row.slug ? `/guides/${row.slug}` : null),
};
