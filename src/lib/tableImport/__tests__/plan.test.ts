import { config } from './fixture';
import { describe, expect, it } from 'vitest';
import type { FieldConfig } from '@/types/cms';
import {
  buildImportPlan,
  convertCell,
  suggestMapping,
  writableFields,
  type ImportOptions,
} from '../plan';
import { MAX_IMPORT_ROWS, parseDelimited, detectDelimiter } from '../files';

const sheet = (rows: string[][]) => ({
  name: 'Test',
  headers: ['ID', 'Name', 'Description'],
  rows,
});
const opts: ImportOptions = {
  mode: 'upsert',
  matchField: 'id',
  clearBlanks: false,
  mapping: ['id', 'name', 'description'],
};
const existing = [{ id: 'one', name: 'Before', description: 'Preserve', active: false }];
describe('delimited file parsing', () => {
  it.each([',', ';', '\t'])(
    'reads %j delimiters, BOM, quoted multiline and escaped quotes',
    (d) => {
      const input = `\uFEFFName${d}Description\r\n"A${d}B"${d}"Line 1\nLine ""2"""\r\n`;
      expect(detectDelimiter(input)).toBe(d);
      expect(parseDelimited(input, d).rows).toEqual([[`A${d}B`, 'Line 1\nLine "2"']]);
    },
  );
  it.each(['a,a\nx,y', 'a,\nx,y', 'a,b\nx', 'a,b\n"x,y', 'a,b\n"x"oops,y', 'a,b\nx\0,y'])(
    'rejects malformed input',
    (input) => expect(() => parseDelimited(input, ',')).toThrow(),
  );
  it('rejects uploads above the row limit', () =>
    expect(() => parseDelimited('a\n' + 'b\n'.repeat(MAX_IMPORT_ROWS + 1), ',')).toThrow(/20000/));
});
describe('import planning', () => {
  it('maps exported labels and excludes protected fields', () => {
    expect(
      suggestMapping(config, [
        'ID',
        'Title',
        'Description',
        'secret',
        'computed',
        'Created',
        'Read only',
      ]),
    ).toEqual(['id', 'name', 'description', '', '', '', '']);
    expect(writableFields(config).map((f) => f.name)).toEqual([
      'name',
      'slug',
      'description',
      'active',
      'amount',
    ]);
  });
  it('plans creates and corrections, keeping blanks unchanged', () => {
    const rows = buildImportPlan(
      config,
      sheet([
        ['one', 'After', ''],
        ['', 'New', 'Detail'],
      ]),
      opts,
      existing,
    );
    expect(rows.map((r) => r.action)).toEqual(['update', 'create']);
    expect(rows[0].patch).toEqual({ name: 'After' });
    expect(rows[1].patch).toEqual({ name: 'New', description: 'Detail' });
  });
  it('clears values only when explicitly requested', () => {
    expect(
      buildImportPlan(
        config,
        sheet([['one', 'After', '']]),
        { ...opts, clearBlanks: true },
        existing,
      )[0].patch.description,
    ).toBeNull();
  });
  it('enrichment preserves false and zero, filling only missing values', () => {
    const rows = buildImportPlan(
      config,
      {
        name: '',
        headers: ['ID', 'Active', 'Amount', 'Description'],
        rows: [['one', 'true', '10', 'Detail']],
      },
      { ...opts, mode: 'enrich', mapping: ['id', 'active', 'amount', 'description'] },
      [{ id: 'one', name: 'Existing', active: false, amount: 0, description: '' }],
    );
    expect(rows[0].patch).toEqual({ description: 'Detail' });
  });
  it('skips existing records in create-only mode', () =>
    expect(
      buildImportPlan(
        config,
        sheet([['one', 'After', '']]),
        { ...opts, mode: 'create' },
        existing,
      )[0].action,
    ).toBe('skip'));
  it.each(['update', 'enrich'] as const)('rejects missing matches in %s mode', (mode) =>
    expect(
      buildImportPlan(config, sheet([['missing', 'New', '']]), { ...opts, mode }, existing)[0]
        .action,
    ).toBe('error'),
  );
  it('rejects all duplicate file identities, including the first', () =>
    expect(
      buildImportPlan(
        config,
        sheet([
          ['one', 'A', ''],
          ['one', 'B', ''],
        ]),
        opts,
        existing,
      ).map((r) => r.action),
    ).toEqual(['error', 'error']));
  it('rejects ambiguous names rather than choosing one', () => {
    const rows = buildImportPlan(
      config,
      sheet([['', 'Same', 'New']]),
      { ...opts, matchField: 'name' },
      [
        { id: 'a', name: 'Same' },
        { id: 'b', name: 'Same' },
      ],
    );
    expect(rows[0].action).toBe('error');
    expect(rows[0].issues.join()).toMatch(/More than one/);
  });
  it('enforces immutability and custom/required validation', () => {
    const rows = buildImportPlan(
      config,
      { name: '', headers: ['id', 'slug'], rows: [['one', 'changed']] },
      { ...opts, mapping: ['id', 'slug'] },
      [{ id: 'one', name: 'Existing', slug: 'stable' }],
    );
    expect(rows[0].issues.join()).toMatch(/cannot change/);
    expect(buildImportPlan(config, sheet([['', '', 'Detail']]), opts, [])[0].action).toBe('error');
    const custom = {
      ...config,
      validate: () => ({
        isValid: false,
        errors: [{ field: 'name', message: 'Refused', severity: 'error' as const }],
        warnings: [],
      }),
    };
    expect(
      buildImportPlan(custom, sheet([['', 'New', 'Detail']]), opts, [])[0].issues.join(),
    ).toMatch(/Refused/);
  });
  it('rejects duplicate mappings and attempts to write protected fields', () => {
    expect(() =>
      buildImportPlan(
        config,
        sheet([['', '', '']]),
        { ...opts, mapping: ['id', 'name', 'name'] },
        [],
      ),
    ).toThrow(/once/);
    expect(() =>
      buildImportPlan(
        config,
        sheet([['', '', '']]),
        { ...opts, mapping: ['id', 'name', 'secret'] },
        [],
      ),
    ).toThrow(/cannot be imported/);
  });
  it('does not silently accept unsafe numbers, invalid dates or malformed arrays', () => {
    const field = (type: FieldConfig['type']) =>
      ({ name: 'test', label: 'Test', type, group: 'basic' }) as FieldConfig;
    expect(() => convertCell('10x', field('number'))).toThrow();
    expect(() => convertCell('2026-02-30', field('date'))).toThrow();
    expect(convertCell('2026-10-23T23:00:00-05:00', field('datetime'))).toBe(
      '2026-10-24T04:00:00.000Z',
    );
    expect(convertCell('No', field('boolean'))).toBe(false);
    expect(convertCell('one|two', field('tags'))).toEqual(['one', 'two']);
    expect(() => convertCell('[1,2]', field('tags'))).toThrow();
  });
});
