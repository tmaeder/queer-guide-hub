import { describe, it, expect, vi } from 'vitest';
import { applyAIResult, applySuggestion } from '../applyAIResult';
import type { ContentTypeConfig } from '@/types/cms';

const config = {
  id: 'venues',
  label: { singular: 'Venue', plural: 'Venues' },
  fields: [
    { name: 'excerpt', label: 'Excerpt', type: 'text' },
    { name: 'meta_title', label: 'Meta title', type: 'text' },
    { name: 'meta_description', label: 'Meta description', type: 'text' },
    { name: 'tags', label: 'Tags', type: 'tags' },
    { name: 'name', label: 'Name', type: 'text' },
  ],
  aiAssist: { ops: ['summarize'], writableFields: ['excerpt', 'meta_title', 'meta_description', 'tags'] },
} as unknown as ContentTypeConfig;

describe('applySuggestion', () => {
  it('applies a writable, valid value', () => {
    const onApply = vi.fn();
    expect(applySuggestion(config, 'excerpt', 'hello', onApply)).toBe(true);
    expect(onApply).toHaveBeenCalledWith('excerpt', 'hello');
  });

  it('rejects fields not in writableFields', () => {
    const onApply = vi.fn();
    expect(applySuggestion(config, 'name', 'X', onApply)).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('rejects values failing the field schema', () => {
    const onApply = vi.fn();
    // excerpt is a string field; a number should fail Zod validation
    expect(applySuggestion(config, 'excerpt', 123 as unknown as string, onApply)).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('applyAIResult', () => {
  it('applies seo_draft meta fields', () => {
    const onApply = vi.fn();
    const res = applyAIResult(
      config,
      'seo_draft',
      { meta_title: 'T', meta_description: 'D' },
      onApply,
    );
    expect(res.applied).toBe(2);
    expect(res.fields).toEqual(['meta_title', 'meta_description']);
  });

  it('applies only valid, writable quality_review suggestions', () => {
    const onApply = vi.fn();
    const res = applyAIResult(
      config,
      'quality_review',
      {
        quality_score: 60,
        issues: [],
        suggestions: [
          { field: 'excerpt', value: 'ok' }, // applied
          { field: 'name', value: 'blocked' }, // not writable → skipped
        ],
      },
      onApply,
    );
    expect(res.applied).toBe(1);
    expect(res.fields).toEqual(['excerpt']);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('returns an error when nothing is applicable', () => {
    const onApply = vi.fn();
    const res = applyAIResult(
      config,
      'quality_review',
      { quality_score: 10, issues: [], suggestions: [{ field: 'name', value: 'x' }] },
      onApply,
    );
    expect(res.applied).toBe(0);
    expect(res.error).toBeTruthy();
  });
});
