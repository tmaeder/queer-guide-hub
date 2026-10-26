import { validateReferenceTerm } from '@/lib/referenceTaxonomyDefinitions';
import { ListTree } from '@/components/icons';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { CLASSIFICATION_LABELS } from '@/config/taxonomyCatalog';

const text = (name: string, label: string, required = false): FieldConfig => ({
  name,
  label,
  required,
  ...(required ? { minLength: 1 } : {}),
  immutable: ['slug', 'value'].includes(name),
  type: 'text',
  group: 'basic',
  searchable: true,
  listColumn: ['name', 'label', 'slug', 'value'].includes(name),
});
const active: FieldConfig = {
  name: 'is_active',
  label: 'Active',
  type: 'boolean',
  group: 'settings',
  filterable: true,
  listColumn: true,
  helpText:
    'Deactivate a term to stop offering it for new selections. Existing references are preserved.',
};
const order: FieldConfig = {
  name: 'sort_order',
  label: 'Sort order',
  type: 'number',
  group: 'settings',
  sortable: true,
};
const description: FieldConfig = {
  name: 'description',
  label: 'Description',
  type: 'textarea',
  group: 'basic',
};
const parent = (table: string, name = 'parent_id', labelColumn = 'name'): FieldConfig => ({
  name,
  label: 'Parent',
  type: 'select',
  group: 'basic',
  dynamicOptions: {
    table,
    valueColumn: 'id',
    labelColumn,
    orderBy: 'sort_order',
    activeColumn: 'is_active',
  },
});
const categoryFields = [
  text('name', 'Name', true),
  text('slug', 'Slug', true),
  description,
  text('icon', 'Icon'),
];

function vocabulary(
  table: string,
  singular: string,
  plural: string,
  fields: FieldConfig[],
  titleField = 'name',
): ContentTypeConfig {
  return {
    id: table,
    tableName: table,
    primaryKey: 'id',
    titleField,
    label: { singular, plural },
    icon: ListTree,
    color: 'hsl(var(--muted-foreground))',
    fields: [...fields, order, active],
    listSelect: '*',
    defaults: { is_active: true, sort_order: 0 },
    fieldGroupOrder: ['basic', 'details', 'settings'],
    defaultSort: { field: 'sort_order', dir: 'asc' },
    writeCreatedBy: false,
    commentable: true,
  };
}

const axes = ['general', 'give_receive', 'self_partner', 'dom_sub'].map((value) => ({
  value,
  label: value,
}));
const localized: FieldConfig[] = [
  { name: 'label_i18n', label: 'Translated labels', type: 'json', group: 'details' },
  { name: 'description_i18n', label: 'Translated descriptions', type: 'json', group: 'details' },
];

export const additionalVocabularies: Record<string, ContentTypeConfig> = {
  tag_categories: vocabulary('tag_categories', 'Tag category', 'Tag categories', [
    ...categoryFields.filter((f) => f.name !== 'icon'),
    text('color', 'Color'),
    parent('tag_categories'),
    { name: 'level', label: 'Level', type: 'number', group: 'settings', readOnly: true },
  ]),
  news_categories: vocabulary('news_categories', 'News category', 'News categories', [
    ...categoryFields,
    text('color', 'Color'),
    parent('news_categories', 'parent_category_id'),
  ]),
  marketplace_categories: vocabulary(
    'marketplace_categories',
    'Marketplace category',
    'Marketplace categories',
    [...categoryFields, parent('marketplace_categories')],
  ),
  event_categories: vocabulary('event_categories', 'Event category', 'Event categories', [
    text('name', 'Name', true),
  ]),
  amenities: vocabulary('amenities', 'Place amenity', 'Place amenities', [
    text('name', 'Name', true),
    text('slug', 'Slug'),
    text('icon_name', 'Icon'),
    {
      name: 'kind',
      label: 'Kind',
      type: 'select',
      group: 'basic',
      options: ['amenity', 'accessibility', 'queer'].map((value) => ({ value, label: value })),
    },
    {
      name: 'category_scope',
      label: 'Category scope',
      type: 'tags',
      group: 'basic',
      helpText: 'Place category slugs, or all.',
    },
    text('contradicts', 'Contradicting amenity slug'),
    {
      name: 'is_negative_assertion',
      label: 'Negative assertion',
      type: 'boolean',
      group: 'settings',
    },
  ]),
  kink_categories: vocabulary(
    'kink_categories',
    'Intimate-profile category',
    'Intimate-profile categories',
    [
      text('label', 'Label', true),
      text('slug', 'Slug', true),
      description,
      ...localized,
      {
        name: 'axis',
        label: 'Rating axis',
        type: 'select',
        required: true,
        group: 'basic',
        options: axes,
      },
    ],
    'label',
  ),
  kink_items: vocabulary(
    'kink_items',
    'Intimate-profile interest',
    'Intimate-profile interests',
    [
      text('label', 'Label', true),
      text('slug', 'Slug', true),
      description,
      ...localized,
      { ...parent('kink_categories', 'category_id', 'label'), label: 'Category', required: true },
      {
        name: 'axis_override',
        label: 'Rating axis override',
        type: 'select',
        group: 'basic',
        options: axes,
      },
      {
        name: 'discussion_recommended',
        label: 'Discussion recommended',
        type: 'boolean',
        group: 'settings',
      },
      text('unified_tag_slug', 'Linked tag slug'),
    ],
    'label',
  ),
  taxonomy_terms: vocabulary(
    'taxonomy_terms',
    'Classification',
    'Content & profile classifications',
    [
      {
        name: 'taxonomy',
        immutable: true,
        label: 'Taxonomy',
        type: 'select',
        required: true,
        group: 'basic',
        filterable: true,
        listColumn: true,
        options: Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => ({ value, label })),
      },
      text('value', 'Stable value', true),
      text('name', 'Label', true),
      description,
      parent('taxonomy_terms'),
      {
        name: 'metadata',
        label: 'Reference details',
        type: 'json',
        group: 'details',
        helpText:
          'Reference definitions: flag stripes and meanings, competition presentation, or other descriptive metadata. Marketplace browse keys use department:, group:, or fine: with the corresponding parent.',
      },
    ],
  ),
};

additionalVocabularies.taxonomy_terms.validate = validateReferenceTerm;
additionalVocabularies.taxonomy_terms.defaults = {
  ...additionalVocabularies.taxonomy_terms.defaults,
  metadata: {},
};
