import { describe, it, expect } from 'vitest';
import {
  classifyEntityType,
  entityTypeToTable,
  summarizeDetections,
  expectedEntityTypeFor,
} from '../entityTypeClassifier';

describe('classifyEntityType', () => {
  it('honors explicit _entity_type hint', () => {
    const r = classifyEntityType({ name: 'Some Bar', _entity_type: 'venue' });
    expect(r.entityType).toBe('venue');
    expect(r.fromHint).toBe(true);
  });

  it('honors aliases (person, business, category)', () => {
    expect(classifyEntityType({ name: 'X', _entity_type: 'person' }).entityType).toBe('personality');
    expect(classifyEntityType({ name: 'X', _entity_type: 'business' }).entityType).toBe('venue');
    expect(classifyEntityType({ name: 'X', _entity_type: 'category' }).entityType).toBe('tag');
  });

  it('routes by birth_date marker', () => {
    expect(
      classifyEntityType({ name: 'Lytton Strachey', birth_date: '1880-03-01' }).entityType,
    ).toBe('personality');
  });

  it('routes by start_date marker', () => {
    expect(
      classifyEntityType({ name: 'Berlin Pride 2026', start_date: '2026-07-25' }).entityType,
    ).toBe('event');
  });

  it('routes by venue language in name', () => {
    expect(classifyEntityType({ name: 'Sauna Tres Chic' }).entityType).toBe('venue');
  });

  it('routes by address column', () => {
    expect(
      classifyEntityType({ name: 'ES Collection Flagship', address: '123 Main St' }).entityType,
    ).toBe('venue');
  });

  it('classifies postcodes / numeric junk as unknown', () => {
    expect(classifyEntityType({ name: '344' }).entityType).toBe('unknown');
    expect(classifyEntityType({ name: 'BN2 1TH' }).entityType).toBe('unknown');
    expect(classifyEntityType({ name: '' }).entityType).toBe('unknown');
  });

  it('classifies short slang as unknown', () => {
    expect(classifyEntityType({ name: 'DILF' }).entityType).toBe('unknown');
    expect(classifyEntityType({ name: 'fag hag' }).entityType).toBe('unknown');
  });
});

describe('entityTypeToTable', () => {
  it('maps known types', () => {
    expect(entityTypeToTable('personality')).toBe('personalities');
    expect(entityTypeToTable('venue')).toBe('venues');
    expect(entityTypeToTable('event')).toBe('events');
    expect(entityTypeToTable('tag')).toBe('unified_tags');
    expect(entityTypeToTable('unknown')).toBe('');
  });
});

describe('summarizeDetections', () => {
  it('counts per-type and flags mismatches against expected', () => {
    const rows = [
      { name: 'Lytton Strachey', birth_date: '1880-03-01' },
      { name: 'Sauna Tres Chic' },
      { name: 'InTeam Club', description: 'darkroom' },
      { name: 'DILF' },
    ];
    const summary = summarizeDetections(rows, 'personality');
    expect(summary.byType.personality).toBe(1);
    expect(summary.byType.venue).toBe(2);
    expect(summary.byType.unknown).toBe(1);
    // 2 rows are venues but expected was personality → 2 mismatches.
    expect(summary.mismatches).toBe(2);
    expect(summary.unknownCount).toBe(1);
  });

  it('does not count unknowns as mismatches', () => {
    const rows = [{ name: '344' }, { name: 'DILF' }];
    const summary = summarizeDetections(rows, 'personality');
    expect(summary.mismatches).toBe(0);
    expect(summary.byType.unknown).toBe(2);
  });
});

describe('expectedEntityTypeFor', () => {
  it('maps import-type keys', () => {
    expect(expectedEntityTypeFor('personalities-csv')).toBe('personality');
    expect(expectedEntityTypeFor('venues-csv')).toBe('venue');
    expect(expectedEntityTypeFor('events-csv')).toBe('event');
    expect(expectedEntityTypeFor('tags-csv')).toBe('tag');
    expect(expectedEntityTypeFor('unknown-csv')).toBeNull();
  });
});
