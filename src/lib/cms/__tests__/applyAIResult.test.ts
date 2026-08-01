import { describe, it, expect, vi } from 'vitest';
import { applyAIResult, applySuggestion } from '../applyAIResult';
import type { ContentTypeConfig } from '@/types/cms';

/** A type that stores its own SEO meta columns, like cms_pages. */
const config = {
  id: 'cms_pages',
  label: { singular: 'Page', plural: 'Pages' },
  fields: [
    { name: 'excerpt', label: 'Excerpt', type: 'text' },
    { name: 'meta_title', label: 'Meta title', type: 'text' },
    { name: 'meta_description', label: 'Meta description', type: 'text' },
    { name: 'tags', label: 'Tags', type: 'tags' },
    { name: 'name', label: 'Name', type: 'text' },
  ],
  aiAssist: { ops: ['summarize'], writableFields: ['excerpt', 'meta_title', 'meta_description', 'tags'] },
} as unknown as ContentTypeConfig;

/**
 * An entity type whose table has no meta_* columns — venues/events/
 * personalities/news_articles. Their SEO overrides live in the
 * cms_content_metadata sidecar, so seo_draft must not write to the record.
 */
const entityConfig = {
  id: 'venues',
  label: { singular: 'Venue', plural: 'Venues' },
  fields: [
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'tags', label: 'Tags', type: 'tags' },
  ],
  aiAssist: { ops: ['seo_draft'], writableFields: ['description', 'tags'] },
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

  it('refuses seo_draft for a type that does not store meta fields', () => {
    // Regression: this used to call onApply unconditionally, marking
    // meta_title/meta_description dirty on a table with no such columns. The
    // editor's UPDATE payload is built from dirty keys, so PostgREST rejected
    // the whole save and every other pending edit was lost.
    const onApply = vi.fn();
    const res = applyAIResult(
      entityConfig,
      'seo_draft',
      { meta_title: 'T', meta_description: 'D' },
      onApply,
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(res.applied).toBe(0);
    expect(res.error).toBeTruthy();
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
