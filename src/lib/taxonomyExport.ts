/**
 * Export every editorial vocabulary in one file: an Excel workbook with a
 * sheet per taxonomy (each classification family in `taxonomy_terms` gets its
 * own sheet), or one long CSV with a `Taxonomy` column so it stays a single
 * flat table.
 *
 * The taxonomy list comes from TAXONOMY_CATALOG, the same source the
 * Taxonomies directory renders, so a vocabulary added there is exported
 * without a change here.
 */
import { getContentType } from '@/config/contentTypes';
import {
  CLASSIFICATION_LABELS,
  TAXONOMY_CATALOG,
  classificationGroup,
} from '@/config/taxonomyCatalog';
import {
  exportColumnsFor,
  fetchContentRows,
  rowColumnNames,
  type ExportFormat,
} from '@/components/cms/ContentListPanel/exportContentList';
import type { ContentTypeConfig } from '@/types/cms';
import { exportToCsv } from '@/utils/csvExport';
import {
  exportWorkbook,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
  type ExportSheet,
} from '@/utils/excelExport';

type Row = Record<string, unknown>;

export interface TaxonomyExportOptions {
  /** Include `unified_tags` (~10k rows). Off keeps the file to vocabularies. */
  includeTags?: boolean;
}

interface TaxonomySource {
  label: string;
  group: string;
  config: ContentTypeConfig;
  rows: Row[];
}

async function loadSources({ includeTags = true }: TaxonomyExportOptions) {
  const sources: TaxonomySource[] = [];
  for (const entry of TAXONOMY_CATALOG) {
    if (entry.id === 'unified_tags' && !includeTags) continue;
    const config = getContentType(entry.id);
    // A catalog entry with no registered content type cannot be read through
    // the CMS config; say so rather than silently shipping a short file.
    if (!config) throw new Error(`No content type registered for taxonomy "${entry.id}"`);
    const rows = await fetchContentRows(config);
    if (entry.id === 'taxonomy_terms') {
      const byFamily = new Map<string, Row[]>();
      for (const row of rows) {
        const key = String(row.taxonomy ?? '');
        byFamily.set(key, [...(byFamily.get(key) ?? []), row]);
      }
      for (const [family, familyRows] of [...byFamily].sort(([a], [b]) => a.localeCompare(b))) {
        sources.push({
          label: CLASSIFICATION_LABELS[family] ?? family,
          group: classificationGroup(family),
          config,
          rows: familyRows,
        });
      }
    } else {
      sources.push({ label: entry.label, group: entry.group, config, rows });
    }
  }
  return sources;
}

const pick =
  (...names: string[]) =>
  (row: Row) => {
    for (const name of names) {
      const v = row[name];
      if (v !== null && v !== undefined && v !== '') return String(v);
    }
    return '';
  };

const FLAT_HEADERS = [
  'Taxonomy',
  'Group',
  'Name',
  'Slug / value',
  'Active',
  'Sort order',
  'Parent ID',
  'Description',
  'ID',
] as const;

/** Raw columns the shared columns above already carry. */
const FLAT_COVERED = new Set([
  'id',
  'slug',
  'value',
  'is_active',
  'sort_order',
  'parent_id',
  'description',
]);

function cell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number | boolean;
}

/** The columns every vocabulary shares, for the single flat CSV (FLAT_HEADERS order). */
function flatColumns(source: TaxonomySource): ExportColumnDef<Row>[] {
  const { config } = source;
  return [
    { header: 'Taxonomy', accessor: () => source.label },
    { header: 'Group', accessor: () => source.group },
    { header: 'Name', accessor: (r) => String(r[config.titleField] ?? '') },
    { header: 'Slug / value', accessor: pick('slug', 'value') },
    {
      header: 'Active',
      accessor: (r) =>
        typeof r.is_active === 'boolean'
          ? formatBoolean(r.is_active)
          : typeof r.status === 'string'
            ? r.status
            : '',
    },
    { header: 'Sort order', accessor: pick('sort_order') },
    { header: 'Parent ID', accessor: pick('parent_id') },
    { header: 'Description', accessor: pick('description', 'short_description') },
    { header: 'ID', accessor: (r) => String(r[config.primaryKey] ?? '') },
  ];
}

export async function exportAllTaxonomies(
  format: ExportFormat,
  options: TaxonomyExportOptions = {},
): Promise<void> {
  const sources = await loadSources(options);
  if (format === 'CSV') {
    // One column set for every row; each source supplies its own accessors.
    type Tagged = { row: Row; columns: ExportColumnDef<Row>[] };
    const tagged: Tagged[] = sources.flatMap((s) => {
      const columns = flatColumns(s);
      return s.rows.map((row) => ({ row, columns }));
    });
    const shared: ExportColumnDef<Tagged>[] = FLAT_HEADERS.map((header, i) => ({
      header,
      accessor: (t) => t.columns[i].accessor(t.row),
    }));
    // Then every other column any vocabulary carries, so no field is dropped;
    // a vocabulary without that column leaves the cell empty.
    const extra = rowColumnNames(sources.flatMap((s) => s.rows))
      .filter((name) => !FLAT_COVERED.has(name))
      .map((name): ExportColumnDef<Tagged> => ({
        header: name,
        accessor: (t) => cell(t.row[name]),
      }));
    const columns = [...shared, ...extra];
    exportToCsv(tagged, columns, generateFilename('taxonomies').replace(/\.xlsx$/, '.csv'));
    return;
  }
  const sheets: ExportSheet<Row>[] = sources.map((s) => ({
    name: s.label,
    rows: s.rows,
    columns: exportColumnsFor(s.config, s.rows),
  }));
  await exportWorkbook(sheets, generateFilename('taxonomies'));
}
