import type { FieldConfig, FieldType } from '@/types/cms';

/**
 * What a field can do in a view: be displayed, filtered, sorted, grouped, or
 * used as the date axis. One place, so the five view components and the three
 * config builders cannot disagree.
 *
 * The rule that matters: a field with `operators: []` is still OFFERED in the
 * field picker, disabled, with `unfilterableReason` shown. Today the panel does
 * the opposite — it renders a text box for any `filterable` field, and
 * `loadSingleType` then drops the ones it cannot translate, so the filter looks
 * applied and does nothing. Saying "no" out loud beats a control that lies.
 */

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'not_in'
  | 'has_any'
  | 'has_all'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_true'
  | 'is_false'
  | 'before'
  | 'after'
  | 'on';

/** Which value control a given (field, operator) pair needs. */
export type ValueWidget =
  'none' | 'text' | 'number' | 'number-range' | 'select-multi' | 'date' | 'date-range';

export interface FieldCapability {
  displayable: boolean;
  /** Empty means "cannot be filtered" — pair with `unfilterableReason`. */
  operators: FilterOperator[];
  sortable: boolean;
  groupable: boolean;
  dateable: boolean;
  unfilterableReason?: string;
}

const TEXTUAL: FilterOperator[] = [
  'contains',
  'not_contains',
  'starts_with',
  'eq',
  'neq',
  'is_empty',
  'is_not_empty',
];
const NUMERIC: FilterOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_empty',
  'is_not_empty',
];
const CHOICE: FilterOperator[] = ['in', 'not_in', 'is_empty', 'is_not_empty'];
const ARRAYS: FilterOperator[] = ['has_any', 'has_all', 'is_empty', 'is_not_empty'];
const TEMPORAL: FilterOperator[] = ['on', 'before', 'after', 'between', 'is_empty', 'is_not_empty'];
const PRESENCE: FilterOperator[] = ['is_empty', 'is_not_empty'];

/** Autocompletes resolve to a stored scalar, so they behave as closed choices. */
const AUTOCOMPLETE_TYPES: FieldType[] = [
  'city_autocomplete',
  'country_autocomplete',
  'venue_autocomplete',
  'profession_autocomplete',
  'roles_autocomplete',
  'unified_tag',
];

const BY_TYPE: Partial<Record<FieldType, FieldCapability>> = {
  text: {
    displayable: true,
    operators: TEXTUAL,
    sortable: true,
    groupable: false,
    dateable: false,
  },
  slug: {
    displayable: true,
    operators: TEXTUAL,
    sortable: true,
    groupable: false,
    dateable: false,
  },
  url: {
    displayable: true,
    operators: TEXTUAL,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  email: {
    displayable: true,
    operators: TEXTUAL,
    sortable: true,
    groupable: false,
    dateable: false,
  },
  phone: {
    displayable: true,
    operators: TEXTUAL,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  textarea: {
    displayable: true,
    operators: ['contains', ...PRESENCE],
    sortable: false,
    groupable: false,
    dateable: false,
  },
  richtext: {
    displayable: false,
    operators: PRESENCE,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  number: {
    displayable: true,
    operators: NUMERIC,
    sortable: true,
    groupable: false,
    dateable: false,
  },
  boolean: {
    displayable: true,
    operators: ['is_true', 'is_false', 'is_empty'],
    sortable: true,
    groupable: true,
    dateable: false,
  },
  select: {
    displayable: true,
    operators: CHOICE,
    sortable: true,
    groupable: true,
    dateable: false,
  },
  multiselect: {
    displayable: true,
    operators: ARRAYS,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  tags: {
    displayable: true,
    operators: ARRAYS,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  date: {
    displayable: true,
    operators: TEMPORAL,
    sortable: true,
    groupable: false,
    dateable: true,
  },
  datetime: {
    displayable: true,
    operators: TEMPORAL,
    sortable: true,
    groupable: false,
    dateable: true,
  },
  image: {
    displayable: true,
    operators: PRESENCE,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  images: {
    displayable: true,
    operators: PRESENCE,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  json: {
    displayable: true,
    operators: PRESENCE,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  location: {
    displayable: true,
    operators: PRESENCE,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  social_links: {
    displayable: true,
    operators: PRESENCE,
    sortable: false,
    groupable: false,
    dateable: false,
  },
  link_list: {
    displayable: true,
    operators: PRESENCE,
    sortable: false,
    groupable: false,
    dateable: false,
  },
};

const UNKNOWN: FieldCapability = {
  displayable: true,
  operators: [],
  sortable: false,
  groupable: false,
  dateable: false,
  unfilterableReason: 'No filter available for this field type.',
};

export function capabilitiesFor(field: FieldConfig): FieldCapability {
  // A virtual field is computed or joined and has no stored column, so the
  // database cannot filter or sort on it at all. It can still be displayed via
  // `listRender`. This is checked FIRST: a virtual `select` must not inherit
  // select's operators.
  if (field.virtual) {
    return {
      displayable: true,
      operators: [],
      sortable: false,
      groupable: false,
      dateable: false,
      unfilterableReason: 'Computed field — no stored value to filter on.',
    };
  }

  if (AUTOCOMPLETE_TYPES.includes(field.type)) {
    return {
      displayable: true,
      operators: CHOICE,
      sortable: true,
      groupable: field.type !== 'unified_tag',
      dateable: false,
    };
  }

  return BY_TYPE[field.type] ?? UNKNOWN;
}

/** The value control a row needs. `none` renders nothing, not a disabled box. */
export function widgetFor(field: FieldConfig, op: FilterOperator): ValueWidget {
  if (op === 'is_empty' || op === 'is_not_empty' || op === 'is_true' || op === 'is_false') {
    return 'none';
  }
  if (op === 'in' || op === 'not_in' || op === 'has_any' || op === 'has_all') return 'select-multi';

  if (field.type === 'date' || field.type === 'datetime') {
    return op === 'between' ? 'date-range' : 'date';
  }
  if (field.type === 'number') return op === 'between' ? 'number-range' : 'number';
  return 'text';
}

/** Fields a view may show, in config order. */
export function displayableFields(fields: FieldConfig[]): FieldConfig[] {
  return fields.filter((f) => capabilitiesFor(f).displayable);
}

export function filterableFields(fields: FieldConfig[]): FieldConfig[] {
  return fields.filter((f) => capabilitiesFor(f).operators.length > 0);
}

export function sortableFields(fields: FieldConfig[]): FieldConfig[] {
  return fields.filter((f) => capabilitiesFor(f).sortable);
}
