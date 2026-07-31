import { describe, expect, it } from 'vitest';
import { Tag } from 'lucide-react';
import { validateAgainstRegistry, zodFromFields } from '../zodFromFields';
import type { ContentTypeConfig } from '@/types/cms';

/**
 * `visibleWhen` lets one content type hold records of different shapes — a
 * redirect is either SHORT (has `slug`) or PATH (has `source_path`).
 *
 * The half that is easy to miss is validation: if a conditionally-hidden field
 * stayed `required`, the record shape that legitimately omits it could never be
 * saved, and the editor would reject it with an error about a field the user
 * cannot even see.
 */

const config: ContentTypeConfig = {
  id: 'redirects',
  tableName: 'redirects',
  primaryKey: 'id',
  titleField: 'target',
  icon: Tag,
  label: { singular: 'Redirect', plural: 'Redirects' },
  color: 'hsl(0 0% 20%)',
  fields: [
    { name: 'type', label: 'Type', type: 'text', group: 'basic', required: true },
    { name: 'target', label: 'Target', type: 'text', group: 'basic', required: true },
    {
      name: 'slug',
      label: 'Slug',
      type: 'text',
      group: 'basic',
      required: true,
      visibleWhen: (v) => v.type === 'SHORT',
    },
    {
      name: 'source_path',
      label: 'Source Path',
      type: 'text',
      group: 'basic',
      required: true,
      visibleWhen: (v) => v.type === 'PATH',
    },
  ],
};

describe('visibleWhen validation exemption', () => {
  it('accepts a SHORT redirect without source_path', () => {
    const result = validateAgainstRegistry(config, {
      type: 'SHORT',
      target: '/somewhere',
      slug: 'promo',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a PATH redirect without slug', () => {
    const result = validateAgainstRegistry(config, {
      type: 'PATH',
      target: '/somewhere',
      source_path: '/old',
    });
    expect(result.ok).toBe(true);
  });

  it('still enforces the field that IS visible', () => {
    // slug is required for SHORT, and it is missing.
    const result = validateAgainstRegistry(config, { type: 'SHORT', target: '/somewhere' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain('slug');
    }
  });

  it('still enforces unconditional required fields', () => {
    const result = validateAgainstRegistry(config, { type: 'SHORT', slug: 'promo' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain('target');
    }
  });

  it('keeps every field required when no values are supplied', () => {
    // Without values the predicate cannot be evaluated, so the schema must stay
    // strict rather than silently dropping rules.
    const schema = zodFromFields(config);
    const parsed = schema.safeParse({ type: 'SHORT', target: '/x', slug: 'promo' });
    expect(parsed.success).toBe(false);
  });

  it('does not let a conditionally-hidden field block the other shape', () => {
    // The regression this guards: a PATH redirect rejected for a missing `slug`
    // the editor never rendered.
    const result = validateAgainstRegistry(config, {
      type: 'PATH',
      target: '/somewhere',
      source_path: '/old',
    });
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).not.toContain('slug');
    }
    expect(result.ok).toBe(true);
  });
});
