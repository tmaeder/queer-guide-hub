import { describe, expect, it } from 'vitest';
import { unifiedTagsContentType } from '@/config/contentTypes/tag';
import { buildImportPlan, type ImportOptions } from '../plan';

const options: ImportOptions = {
  mode: 'upsert',
  matchField: 'id',
  clearBlanks: false,
  mapping: ['id', 'name', 'short_description'],
};
const sheet = (name: string, description = '') => ({
  name: 'Tags',
  headers: ['id', 'name', 'short_description'],
  rows: [['existing', name, description]],
});

describe('real tag registry import validation', () => {
  it.each(['unverified', 'auto', 'reviewed', 'locked'])(
    'can preserve, correct and enrich a stored %s tag',
    (verification_status) => {
      const stored = [
        {
          id: 'existing',
          name: 'Before',
          status: 'active',
          verification_status,
          short_description: null,
          wikipedia_url: '',
        },
      ];
      const unchanged = buildImportPlan(
        unifiedTagsContentType,
        sheet('Before'),
        options,
        stored,
      )[0];
      expect(unchanged.action).toBe('skip');
      expect(unchanged.issues).toEqual([]);
      const correction = buildImportPlan(
        unifiedTagsContentType,
        sheet('After'),
        options,
        stored,
      )[0];
      expect(correction.action).toBe('update');
      expect(correction.patch).toEqual({ name: 'After' });
      const enrichment = buildImportPlan(
        unifiedTagsContentType,
        sheet('After', 'Fill missing'),
        { ...options, mode: 'enrich' },
        stored,
      )[0];
      expect(enrichment.action).toBe('update');
      expect(enrichment.patch).toEqual({ short_description: 'Fill missing' });
    },
  );

  it.each(['pending', 'verified', 'rejected'])(
    'rejects uploading the unsupported verification status %s',
    (status) => {
      const row = buildImportPlan(
        unifiedTagsContentType,
        { name: 'Tags', headers: ['id', 'verification_status'], rows: [['existing', status]] },
        { ...options, mapping: ['id', 'verification_status'] },
        [{ id: 'existing', name: 'Before', verification_status: 'reviewed' }],
      )[0];
      expect(row.action).toBe('error');
      expect(row.issues).toContain('Verification: Choose a configured option.');
    },
  );
});
