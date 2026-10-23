import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAllTaxonomies } from '../taxonomyExport';
import { TAXONOMY_CATALOG } from '@/config/taxonomyCatalog';
import { fetchAllRows, exportWorkbook, sheetName } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';

vi.mock('@/utils/excelExport', async (orig) => ({
  ...(await orig<typeof import('@/utils/excelExport')>()),
  fetchAllRows: vi.fn(),
  exportWorkbook: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchAllRows).mockReset();
  vi.mocked(fetchAllRows).mockImplementation(async (table: string) =>
    table === 'taxonomy_terms'
      ? [
          { id: 'g1', taxonomy: 'gender', value: 'woman', name: 'Woman', is_active: true },
          { id: 'p1', taxonomy: 'pride_flag', value: 'bi', name: 'Bisexual', is_active: false },
          { id: 'g2', taxonomy: 'gender', value: 'man', name: 'Man', is_active: true },
        ]
      : [{ id: `${table}-1`, name: `${table} term`, slug: `${table}-slug`, is_active: true }],
  );
});

describe('exportAllTaxonomies', () => {
  it('reads every catalog table once', async () => {
    await exportAllTaxonomies('Excel');
    const tables = vi.mocked(fetchAllRows).mock.calls.map((c) => c[0]);
    expect(new Set(tables).size).toBe(tables.length);
    expect(tables).toHaveLength(TAXONOMY_CATALOG.length);
  });

  it('writes a sheet per taxonomy, splitting classifications by family', async () => {
    await exportAllTaxonomies('Excel');
    const sheets = vi.mocked(exportWorkbook).mock.lastCall![0];
    const names = sheets.map((s) => s.name);
    expect(names).toContain('Tags');
    expect(names).toContain('Gender identities');
    expect(names).toContain('Pride flags');
    expect(names).not.toContain('Content & profile classifications');
    const gender = sheets.find((s) => s.name === 'Gender identities')!;
    expect(gender.rows.map((r) => r.id)).toEqual(['g1', 'g2']);
    expect(gender.columns.at(-1)?.header).toBe('ID');
    // All fields: the configured ones plus any raw column (here none extra).
    const headers = gender.columns.map((c) => c.header);
    expect(headers).toEqual(
      expect.arrayContaining(['Taxonomy', 'Stable value', 'Reference details']),
    );
  });

  it('can leave tags out', async () => {
    await exportAllTaxonomies('Excel', { includeTags: false });
    expect(vi.mocked(fetchAllRows).mock.calls.map((c) => c[0])).not.toContain('unified_tags');
  });

  it('writes one flat CSV with a taxonomy column', async () => {
    await exportAllTaxonomies('CSV');
    const [rows, columns, filename] = vi.mocked(exportToCsv).mock.lastCall!;
    expect(filename).toMatch(/taxonomies.*\.csv$/);
    expect(columns.map((c) => c.header)).toEqual([
      'Taxonomy',
      'Group',
      'Name',
      'Slug / value',
      'Active',
      'Sort order',
      'Parent ID',
      'Description',
      'ID',
      // Every other column any vocabulary carries follows, so nothing is dropped.
      'name',
      'taxonomy',
    ]);
    const cells = rows.map((r) => columns.map((c) => c.accessor(r)));
    expect(cells).toContainEqual([
      'Pride flags',
      'Content & profile classifications',
      'Bisexual',
      'bi',
      'No',
      '',
      '',
      '',
      'p1',
      'Bisexual',
      'pride_flag',
    ]);
    expect(rows.length).toBe(TAXONOMY_CATALOG.length - 1 + 3);
  });
});

describe('sheetName', () => {
  it('strips illegal characters, truncates to 31 and dedupes', () => {
    const used = new Set<string>();
    expect(sheetName('Marketplace departments, groups & types', used)).toHaveLength(31);
    expect(sheetName('a/b:c', used)).toBe('a b c');
    expect(sheetName('a/b:c', used)).toBe('a b c (2)');
  });
});
