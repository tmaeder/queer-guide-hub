import type { LucideIcon } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig, SelectOption } from '@/types/cms';

/**
 * Controlled-vocabulary content types (venue services, event types, target
 * groups, professions, …).
 *
 * These tables are structurally the same — name, description, icon, a
 * colour or a category, sort order, active flag, optionally a slug — and were
 * previously served by their own shell (`TaxonomyAdminPage`) sitting beside the
 * CMS registry. That split meant a taxonomy change, which reclassifies content
 * site-wide, had none of the things entity edits get: no revision history, no
 * workflow state, no shared validation, and a separate save path.
 *
 * Registering them here puts every content type on one shell. The factory
 * exists because several near-identical configs written out longhand is exactly
 * the duplication being removed.
 */

export interface VocabularyOptions {
  /** Registry id AND table name — these always match for vocabularies. */
  table: string;
  icon: LucideIcon;
  label: { singular: string; plural: string };
  /** Vocabularies with a public-facing slug (venue_services, professions). */
  hasSlug?: boolean;
  /** Vocabularies that group their terms rather than colour-code them. */
  categoryOptions?: SelectOption[];
  /** Vocabularies that colour-code their terms. */
  hasColor?: boolean;
  /** Appended after the shared fields (e.g. professions' aliases). */
  extraFields?: FieldConfig[];
}

const MUTED = 'hsl(var(--muted-foreground))';

export function vocabularyContentType(options: VocabularyOptions): ContentTypeConfig {
  const {
    table,
    icon,
    label,
    hasSlug = false,
    categoryOptions,
    hasColor = false,
    extraFields = [],
  } = options;

  const fields: FieldConfig[] = [
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
  ];

  if (hasSlug) {
    fields.push({
      name: 'slug',
      label: 'Slug',
      type: 'text',
      group: 'basic',
      searchable: true,
      helpText: 'URL-safe identifier. Changing it breaks existing links.',
      listColumn: true,
    });
  }

  fields.push({
    name: 'description',
    label: 'Description',
    type: 'textarea',
    group: 'basic',
    searchable: true,
  });

  fields.push({
    name: 'icon',
    label: 'Icon',
    type: 'text',
    group: 'media',
    placeholder: 'Lucide name',
    helpText: 'A lucide-react icon name, e.g. "Accessibility".',
  });

  if (categoryOptions) {
    fields.push({
      name: 'category',
      label: 'Category',
      type: 'select',
      group: 'basic',
      options: categoryOptions,
      filterable: true,
      sortable: true,
      listColumn: true,
    });
  }

  if (hasColor) {
    fields.push({
      name: 'color',
      label: 'Color',
      type: 'text',
      group: 'media',
      placeholder: MUTED,
      helpText: 'A CSS colour. Leave as the default unless this term needs to stand out.',
    });
  }

  fields.push(
    {
      name: 'sort_order',
      label: 'Sort Order',
      type: 'number',
      group: 'settings',
      sortable: true,
    },
    {
      name: 'is_active',
      label: 'Active',
      type: 'boolean',
      group: 'settings',
      filterable: true,
      listColumn: true,
      helpText:
        'Inactive terms stay attached to existing content but are not offered for new content.',
    },
    ...extraFields,
  );

  const listSelect = [
    'id',
    'name',
    hasSlug ? 'slug' : null,
    'description',
    'icon',
    categoryOptions ? 'category' : null,
    hasColor ? 'color' : null,
    'sort_order',
    'is_active',
    'updated_at',
  ]
    .filter(Boolean)
    .join(',');

  return {
    id: table,
    tableName: table,
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    icon,
    label,
    color: MUTED,
    fields,
    listSelect,
    defaults: {
      is_active: true,
      sort_order: 0,
      ...(hasColor ? { color: MUTED } : {}),
      ...(categoryOptions ? { category: 'general' } : {}),
    },
    // Derived, not hardcoded: a group missing from this list renders no tab, so
    // an extraField in e.g. 'details' would silently become uneditable.
    fieldGroupOrder: (['basic', 'details', 'media', 'settings'] as const).filter((g) =>
      fields.some((f) => f.group === g),
    ) as ContentTypeConfig['fieldGroupOrder'],
    defaultSort: { field: 'sort_order', dir: 'asc' },
    // Vocabularies reclassify content site-wide, so who changed a term and when
    // is worth keeping — the main thing the old taxonomy shell could not do.
    commentable: true,
    // Deliberately no publicPath: a vocabulary term has no page of its own.
  } satisfies ContentTypeConfig;
}
