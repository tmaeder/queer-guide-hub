import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type {
  AdminColumnMeta,
  EntityFilterConfig,
  BulkEditFieldConfig,
} from '@/components/admin/data-table/types';

/**
 * Config types + pure form helpers for TaxonomyAdminPage. Separate file so the
 * component file only exports a component (react-refresh).
 */

export interface TaxonomyRowBase {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  slug?: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string;
}

export interface TaxonomyField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'color' | 'switch' | 'slug' | 'select' | 'aliases';
  /** Validated in field order on save: "<Label> is required". */
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Empty-form value. Aliases use a CSV string in form state. */
  default: string | number | boolean;
  placeholder?: string;
  /** Textarea rows (default 3); aliases textarea uses 2. */
  rows?: number;
  selectPlaceholder?: string;
  /** Save `trim() || null` instead of the raw string. */
  nullWhenEmpty?: boolean;
}

export interface TaxonomyPageConfig<TRow extends TaxonomyRowBase> {
  table: string;
  title: string;
  subtitle: string;
  /** Drives the toolbar "Add X" and dialog "Edit/Create X" labels. */
  entityLabel: string;
  /** Drives toasts: "Event type updated" etc. */
  toastNoun: string;
  /**
   * 'prefixed' (default): "Success: …"/"Error: …" and catch `Error: ${err}`.
   * 'plain': bare messages and catch err.message.
   */
  toastStyle?: 'prefixed' | 'plain';
  select: string;
  fields: TaxonomyField[];
  /** Dialog rows; an array renders as a 2/3-column grid. Default: one field per row. */
  formLayout?: (string | string[])[];
  dialogMaxWidth?: number;
  nameColumn?: { colorDot?: 'badge' | 'full'; showSlug?: boolean };
  showDescriptionColumn?: boolean;
  orderColumnDefaultVisible?: boolean;
  /** Inserted after the name column, before description. */
  extraColumns?: ColumnDef<TRow, string>[];
  entityFilters?: EntityFilterConfig[];
  bulkEditFields?: BulkEditFieldConfig[];
  searchColumns?: string[];
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
}

type FormState = Record<string, string | number | boolean>;

export function buildEmptyForm(fields: TaxonomyField[]): FormState {
  const form: FormState = {};
  for (const f of fields) form[f.key] = f.default;
  return form;
}

export function rowToForm(fields: TaxonomyField[], row: Record<string, unknown>): FormState {
  const form: FormState = {};
  for (const f of fields) {
    const value = row[f.key];
    switch (f.type) {
      case 'number':
        form[f.key] = (value as number) || (f.default as number);
        break;
      case 'switch':
        form[f.key] = (value as boolean | null) ?? (f.default as boolean);
        break;
      case 'aliases':
        form[f.key] = ((value ?? []) as string[]).join(', ');
        break;
      default:
        form[f.key] = (value as string) || (f.default as string);
    }
  }
  return form;
}

export function formToPayload(
  fields: TaxonomyField[],
  form: FormState,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const value = form[f.key];
    if (f.type === 'aliases') {
      payload[f.key] = String(value)
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);
    } else if (f.nullWhenEmpty) {
      payload[f.key] = String(value).trim() || null;
    } else {
      payload[f.key] = value;
    }
  }
  return payload;
}

/** Shared "Category" badge column used by several taxonomy pages. */
export function categoryBadgeColumn<TRow extends TaxonomyRowBase & { category?: string | null }>(
  opts?: { alwaysBadge?: boolean },
): ColumnDef<TRow, string> {
  const columnHelper = createColumnHelper<TRow>();
  return columnHelper.accessor((row) => row.category ?? '', {
    id: 'category',
    header: 'Category',
    cell: (info) =>
      opts?.alwaysBadge || info.getValue() ? (
        <Badge variant="outline">{info.getValue()}</Badge>
      ) : (
        '-'
      ),
    meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
  });
}

